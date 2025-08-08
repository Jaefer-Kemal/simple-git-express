import simpleGit, { DefaultLogFields, LogResult } from 'simple-git';
import {
  RegisterRepoInput,
  CommitStats,
  FetchCommitsInput,
  LogOptions,
  Repository,
  RemoteRepository,
  LocalRepository,
  LogWithParents,
  CommitPayload,
  ComparisonResult,
  UpdateRepoDto,
} from './interfaces';
import logger from '../utils/logger';
import mongoose from 'mongoose';
import { getGitDb } from '../config/git.db';
import { checkAndRefreshSession } from '../utils/checkSession';
import axios from 'axios';
import fs from 'fs/promises';


/**
 * GitServices class provides methods to interact with Git repositories.
 * It includes functionalities to register repositories, fetch commits, and get commit statistics.
 */

class GitServices {
  // 1st service method: Validate a local repository path
   /**
   * Validates that a given path exists, is a Git repository, has at least one commit,
   * and returns its unique fingerprint (the hash of the first commit).
   * This is PURE business logic.
   *
   * @param path - The absolute file system path to the repository.
   * @returns A promise that resolves with the repository's fingerprint string.
   * @throws An error with a clear, user-friendly message if validation fails.
   */
   async validateLocalRepository(path: string): Promise<string> {
    try {
      // 1. Check that path exists.
      await fs.access(path);

      // 2. Check that it is a valid git repository.
      const git = simpleGit(path);
      await git.revparse(['--is-inside-work-tree']);

      // 3. Get the first commit hash. Using --max-parents=0 is a more direct way to find a root commit.
      const rootCommitHash = await git.revparse(['--revs-only', 'HEAD', '--max-parents=0']);
      
      if (!rootCommitHash) {
        throw new Error('Repository must have at least one commit before registration.');
      }
      
      // 4. On success, return the fingerprint.
      return rootCommitHash.trim();

    } catch (error: any) {
      // 5. Catch any low-level errors and convert them into specific, meaningful exceptions.
      logger.error(`[ValidationService] Path validation failed for "${path}": ${error.message}`);
      
      if (error.code === 'ENOENT') {
        throw new Error(`Validation failed: The path "${path}" does not exist or is not accessible.`);
      }
      if (error.message.includes('not a git repository')) {
        throw new Error('Validation failed: The specified path is not a valid Git repository.');
      }
      // Re-throw the original error if it's one we haven't specifically handled (like the 'no commits' error).
      throw error;
    }
  }

 /**
   * Checks the file system status of all repositories for a given developer.
   * This is a purely local operation. It does not call any external APIs.
   *
   * @param developerId - The ID of the developer whose repos to check.
   * @returns An array containing the status of each repository.
   */
  public async checkAllLocalRepoStatuses(developerId: string) {
    const db = getGitDb();
    try {
      const repos = db.prepare('SELECT * FROM repositories WHERE developerId = ?').all(developerId) as Repository[];
      const statusResults = [];

      for (const repo of repos) {
        let status: 'active' | 'missing' | 'deleted' | 'moved' = 'active';
        try {
          await fs.access(repo.path);
          await simpleGit(repo.path).revparse(['--is-inside-work-tree']);
        } catch (fsError: any) {
          if (fsError.code === 'ENOENT') status = 'missing';
          else if (fsError.message.includes('not a git repository')) status = 'deleted';
          else status = 'moved';
        }
        statusResults.push({ id: repo.id, repoId: repo.repoId, path: repo.path, status });
      }
      return statusResults;
    } finally {
      if (db) db.close();
    }
  }

  /**
   * Updates the status for a SINGLE repository in the local SQLite database.
   * This is a simple utility method for the orchestrator to call.
   */
  public async updateLocalRepoStatus(localRepoId: number, status: string): Promise<void> {
    const db = getGitDb();
    try {
      db.prepare(`UPDATE repositories SET status = ?, updatedAt = datetime('now') WHERE id = ?`)
        .run(status, localRepoId);
    } finally {
      if (db) db.close();
    }
  }
   /**
   * Compares a list of remote repositories against the local database for a specific developer.
   * This is PURE business logic. It knows nothing about APIs or sessions.
   *
   * @param developerId - The ID of the developer whose repos to check.
   * @param remoteRepos - The array of repository objects fetched from the backend.
   * @returns A detailed comparison result object.
   */
   async compareRepositories(developerId: string, remoteRepos: RemoteRepository[]) {
    const db = getGitDb();
    try {
      const localRepos = db.prepare('SELECT repoId, path FROM repositories WHERE developerId = ?').all(developerId) as LocalRepository[];
      
      const localRepoIds = new Set(localRepos.map((r) => r.repoId));
      const remoteRepoIds = new Set(remoteRepos.map((r) => r._id));

      const missingInRemote = localRepos.filter((r) => !remoteRepoIds.has(r.repoId));
      const missingInLocal = remoteRepos.filter((r) => !localRepoIds.has(r._id));

      return {
        counts: {
          local: localRepos.length,
          remote: remoteRepos.length,
          missingInRemote: missingInRemote.length,
          missingInLocal: missingInLocal.length,
        },
        diff: { missingInRemote, missingInLocal },
      };
    } finally {
      if (db) db.close();
    }
  }

  /**
   * Builds the annotated, consolidated repository list based on a pre-computed comparison.
   *
   * @param developerId - The ID of the developer.
   * @param comparison - The result from the `compareRepositories` service.
   * @returns The final annotated list of repositories for the UI.
   */
  public async getConsolidatedRepositoryView(developerId: string, comparison: ComparisonResult){
    const { counts, diff } = comparison;

    if (counts.missingInLocal === 0 && counts.missingInRemote === 0) {
      const db = getGitDb();
      try {
        const allLocalRepos = db.prepare('SELECT * FROM repositories WHERE developerId = ?').all(developerId);
        return {
          status: 'synced',
          message: 'All repositories are in sync.',
          repositories: allLocalRepos.map((repo: any) => ({ ...repo, syncStatus: 'synced' })),
        };
      } finally {
        if (db) db.close();
      }
    }

    const db = getGitDb();
    try {
      const missingInLocalList = diff.missingInLocal.map((repo) => ({ ...repo, syncStatus: 'missing_local' }));
      const missingInRemoteList = diff.missingInRemote.map((repo) => ({ ...repo, syncStatus: 'missing_remote' }));

      const missingRemoteIds = diff.missingInRemote.map((repo) => repo.repoId);
      let commonRepos = [];
      if (missingRemoteIds.length > 0) {
        const placeholders = missingRemoteIds.map(() => '?').join(',');
        const sql = `SELECT * FROM repositories WHERE developerId = ? AND repoId NOT IN (${placeholders})`;
        commonRepos = db.prepare(sql).all(developerId, ...missingRemoteIds);
      } else {
        commonRepos = db.prepare('SELECT * FROM repositories WHERE developerId = ?').all(developerId);
      }

      const commonReposList = commonRepos.map((repo: any) => ({ ...repo, syncStatus: 'synced' }));
      const combinedList = [...commonReposList, ...missingInLocalList, ...missingInRemoteList];

      return {
        status: 'requires_action',
        message: 'Differences found between local and remote repositories.',
        repositories: combinedList,
      };
    } finally {
      if (db) db.close();
    }
  }

 /**
   * Updates the details for a SINGLE repository ONLY in the local SQLite database.
   * This is a pure business logic worker.
   *
   * @param dto - An object containing the repository details to update.
   * @returns The number of rows changed.
   * @throws An error if the repository is not found for the given user.
   */
  public async updateLocalRepository(dto: UpdateRepoDto): Promise<number> {
    const { repoId, name, description, developerId } = dto;
    const db = getGitDb();
    try {
      // COALESCE is a handy SQL function that returns the first non-null value.
      // This means we can pass null for a field we don't want to update.
      const stmt = db.prepare(`
        UPDATE repositories 
        SET 
          name = COALESCE(?, name), 
          description = COALESCE(?, description), 
          updatedAt = datetime('now') 
        WHERE repoId = ? AND developerId = ?
      `);
      
      const result = stmt.run(name, description, repoId, developerId);
      
      if (result.changes === 0) {
        throw new Error(`Repository with ID ${repoId} not found for this user.`);
      }

      return result.changes;
    } finally {
      if (db) db.close();
    }
  }


  async extractNewCommits(repoId: string, developerId: string) {
    let db;
    try {
      // --- Step 1 & 2: Get Session, DB, Repo, and Git User ---
      
      db = getGitDb();

      const repo = db
        .prepare(
          "SELECT id, repoId, path, lastSyncedAt, projectId FROM repositories WHERE repoId = ? AND developerId = ? AND status = 'active'"
        )
        .get(repoId, developerId) as LocalRepository | undefined;

      if (!repo) {
        throw new Error(
          `Active repository with ID ${repoId} not found or has status 'inactive'.`
        );
      }
      if (!repo.projectId) {
        throw new Error(`Repository ID ${repoId} has no projectId.`);
      }

      await fs.access(repo.path);
      const git = simpleGit(repo.path);
      const gitUserName = (await git.raw(['config', 'user.name'])).trim();
      if (!gitUserName) {
        throw new Error(`Git user.name is not configured in ${repo.path}.`);
      }
      logger.info(`[CommitSaver] Filtering commits for author: ${gitUserName}`);

      // --- Step 3 (NEW STRATEGY): Iterate Through Local Branches ---
      const branches = await git.branchLocal();
      const processedCommitHashes = new Set<string>(); // Set to prevent processing the same commit twice
      const allNewCommits: any[] = []; // Array to collect unique commits from all branches

      for (const branch of branches.all.map((b) => branches.branches[b])) {
        const logOptions: any = {
          format: { hash: '%H', date: '%cI', message: '%B', parents: '%P' },
          '--author': gitUserName,
        };
        // Add the branch name to the log command to only get commits for this branch
        logOptions[branch.name] = null;

        if (repo.lastSyncedAt) {
          logOptions['--since'] = new Date(repo.lastSyncedAt).toISOString();
        }

        const log: LogResult<LogWithParents> = await git.log(logOptions);

        for (const commit of log.all) {
          // If we've already processed this commit from another branch, skip it.
          if (processedCommitHashes.has(commit.hash)) {
            continue;
          }
          processedCommitHashes.add(commit.hash);

          // --- Step 4 & 5: Process Each UNIQUE Commit for Detailed Stats ---
          const diffTreeOutput = await git.raw([
            'diff-tree',
            '-r',
            '--name-status',
            commit.hash,
          ]);
          const fileStatuses = diffTreeOutput
            ? diffTreeOutput
                .split('\n')
                .filter(Boolean)
                .map((line) => ({
                  status: line.split('\t')[0],
                  file: line.split('\t')[1],
                }))
            : [];
          const files_added = fileStatuses.filter(
            (f) => f.status === 'A'
          ).length;
          const files_removed = fileStatuses.filter(
            (f) => f.status === 'D'
          ).length;

          const showOutput = await git.show(['--stat=200', commit.hash]);
          const parsedChanges = this.parseShowStat(showOutput);
          const parentHashes = commit.parents ? commit.parents.split(' ') : [];

          allNewCommits.push({
            repoId: repo.repoId,
            developerId,
            projectId: repo.projectId,
            branch: branch.name, // Assign the branch name from our current loop context
            message: commit.message,
            commitHash: commit.hash,
            timestamp: new Date(commit.date).toISOString(),
            parentCommit: parentHashes.length > 0 ? parentHashes[0] : null,
            stats: {
              files_changed: fileStatuses.length,
              files_added,
              files_removed,
              lines_added: parsedChanges.totalInsertions,
              lines_removed: parsedChanges.totalDeletions,
            },
            changes: parsedChanges.changes,
          });
        }
      }

      const extractionTime = new Date().toISOString();

      if (allNewCommits.length === 0) {
        logger.info(`[CommitSaver] No new commits found for repo ${repoId}.`);
        db.prepare('UPDATE repositories SET lastSyncedAt = ? WHERE id = ?').run(
          extractionTime,
          repo.id
        );
        return [];
      }

      logger.info(
        `[CommitSaver] Found a total of ${allNewCommits.length} unique new commits to save.`
      );

      // --- Step 6: Insert into SQLite (with Transformation) ---
      const commitsForDb = allNewCommits.map((commit) => ({
        ...commit,
        stats: JSON.stringify(commit.stats),
        changes: JSON.stringify(commit.changes),
      }));

      const insertStmt = db.prepare(`
        INSERT INTO git_commits (repoId, developerId, projectId, branch, message, commitHash, timestamp, stats, changes, parentCommit, synced, createdAt) 
        VALUES (@repoId, @developerId, @projectId, @branch, @message, @commitHash, @timestamp, @stats, @changes, @parentCommit, 0, @createdAt) 
        ON CONFLICT(commitHash, projectId, developerId) DO NOTHING
      `);
      const insertMany = db.transaction((commits) => {
        let insertedCount = 0;
        for (const commit of commits) {
          const info = insertStmt.run({ ...commit, createdAt: extractionTime });
          if (info.changes > 0) insertedCount++;
        }
        return insertedCount;
      });
      const insertedCount = insertMany(commitsForDb);
      logger.info(
        `[CommitSaver] Saved ${insertedCount} new commits to local SQLite.`
      );

      // --- Step 7: Update Local Repository Sync Time ---
      db.prepare('UPDATE repositories SET lastSyncedAt = ? WHERE id = ?').run(
        extractionTime,
        repo.id
      );
      logger.info(
        `[CommitSaver] Local repository ${repo.repoId} lastSyncedAt timestamp updated.`
      );

      return allNewCommits; // Return the original structured commits
    } finally {
      if (db) db.close();
      logger.info(
        `[CommitSaver] Finished processing and saving commits for repoId: ${repoId}`
      );
    }
  }

  /**
   * A private helper method to parse the output of 'git show --stat' into structured data.
   * This includes a detailed list of file changes and the total line changes.
   * @param showOutput The raw string output from the git command.
   * @returns An object containing the parsed statistics.
   */
  private parseShowStat(showOutput: string): {
    changes: { fileName: string; added: number; removed: number }[];
    totalInsertions: number;
    totalDeletions: number;
  } {
    const changes: { fileName: string; added: number; removed: number }[] = [];
    let totalInsertions = 0;
    let totalDeletions = 0;

    const lines = showOutput.split('\n');
    // Find the summary line like " 1 file changed, 1 insertion(+), 1 deletion(-) "
    const summaryLine = lines.find((line) => line.includes('file changed'));

    if (summaryLine) {
      const insertionMatch = summaryLine.match(/(\d+)\s+insertion/);
      const deletionMatch = summaryLine.match(/(\d+)\s+deletion/);
      totalInsertions = insertionMatch ? parseInt(insertionMatch[1], 10) : 0;
      totalDeletions = deletionMatch ? parseInt(deletionMatch[1], 10) : 0;
    }

    // Process each file's line in the stat output
    for (const line of lines) {
      // Match lines like: " src/services/git.service.ts | 2 +- "
      const match = line.match(/^\s*(.+?)\s*\|\s*\d+\s*([+-]+)$/);
      if (match) {
        const fileName = match[1].trim();
        const diffChars = match[2];
        const added = (diffChars.match(/\+/g) || []).length;
        const removed = (diffChars.match(/-/g) || []).length;
        changes.push({ fileName, added, removed });
      }
    }

    return { changes, totalInsertions, totalDeletions };
  }

   /**
   * Fetches all raw, unsynced commits for a specific repository from the SQLite database.
   *
   * @param repoId - The MongoDB _id of the repository.
   * @param developerId - The MongoDB _id of the developer.
   * @returns An array of raw commit rows from the database.
   */
  public async getUnsyncedCommits(repoId: string, developerId: string): Promise<any[]> {
    const db = getGitDb();
    try {
      // Your original query is correct and will be used here.
      // We do NOT need a JOIN because the repoId in git_commits is the MongoDB ID.
      const sql = `SELECT * FROM git_commits WHERE repoId = ? AND developerId = ? AND synced = 0`;
      return db.prepare(sql).all(repoId, developerId);
    } finally {
      if (db) db.close();
    }
  }

  /**
   * Marks ALL unsynced commits for a specific repository as synced=1.
   *
   * @param repoId - The MongoDB _id of the repository to update.
   * @param developerId - The MongoDB _id of the developer.
   * @returns The number of rows that were updated.
   */
  public async markCommitsAsSynced(repoId: string, developerId: string): Promise<number> {
    const db = getGitDb();
    try {
      const sql = `UPDATE git_commits SET synced = 1, updatedAt = datetime('now') WHERE repoId = ? AND developerId = ? AND synced = 0`;
      const result = db.prepare(sql).run(repoId, developerId);
      logger.info(`[SyncService] Marked ${result.changes} local commits as synced for repo ${repoId}.`);
      return result.changes;
    } finally {
      if (db) db.close();
    }
  }
}
export default new GitServices();