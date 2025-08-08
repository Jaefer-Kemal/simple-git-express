import logger from "../utils/logger";
import { CommitStats, FetchCommitsInput, LogOptions, RegisterRepoInput } from "./interfaces";
import fs from 'fs/promises';
import { RepositoryModel, GitDataModel } from '../models';
import simpleGit, { LogResult } from "simple-git";
import mongoose from "mongoose";

class GitLegacyServices {
  // legacy method: Register a new repository
  async registerRepository({
    name,
    description,
    path,
    permission,
  }: RegisterRepoInput) {
    try {
      logger.info(
        `Registering repository: ${name} at path: ${path} with permission: ${permission}`
      );
      await fs.access(path);
      const git = simpleGit(path);
      await git.revparse(['--is-inside-work-tree']);

      // Check if the repository already exists
      const existingRepo = await RepositoryModel.findOne({ path });
      if (existingRepo) {
        logger.error(`Repository at path ${path} already exists.`);
        throw new Error(`Repository at path ${path} already exists.`);
      }

      const repo = new RepositoryModel({
        _id: new mongoose.Types.ObjectId(),
        name,
        description,
        path,
        permission,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await repo.save();
      logger.info(`Repository registered successfully: ${repo._id}`);
      return repo;
    } catch (error: any) {
      if (error.message.includes('not a git repository')) {
        logger.error(`Path ${path} is not a valid Git repository.`);
        throw new Error(`Path ${path} is not a valid Git repository.`);
      }
      logger.error(`Error registering repository: ${error.message}`);
      throw new Error(`Error registering repository: ${error.message}`);
    }
  }

  // legacy method: Check repository status
  async checkRepositoryStatus(repoId: mongoose.Types.ObjectId) {
    try {
      logger.info(`Checking status of repository with ID: ${repoId}`);
      const repo = await RepositoryModel.findById(repoId);
      if (!repo) {
        logger.error(`Repository with ID ${repoId} not found.`);
        throw new Error(`Repository with ID ${repoId} not found.`);
      }

      try {
        await fs.access(repo.path);
        const git = simpleGit(repo.path);
        await git.revparse(['--is-inside-work-tree']);
        repo.status = 'active';
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          repo.status = 'missing';
        } else if (error.message.includes('not a git repository')) {
          repo.status = 'deleted';
        } else {
          repo.status = 'moved';
        }
      }
      repo.updatedAt = new Date();
      await repo.save();
      logger.info(
        `Repository status updated successfully: ${repo._id} - ${repo.status}`
      );
      return repo;
    } catch (error: any) {
      logger.error(`Error checking repository status: ${error.message}`);
      throw new Error(`Error checking repository status: ${error.message}`);
    }
  }

  async fetchCommits(
    repoId: mongoose.Types.ObjectId,
    { branch }: FetchCommitsInput = {}
  ) {
    try {
      logger.info(
        `Fetching commits for repository: ${repoId} on ${branch ? `branch: ${branch}` : `all branches`}`
      );
      const repo = await RepositoryModel.findById(repoId);
      if (!repo) {
        logger.error(`Repository with ID ${repoId} not found.`);
        throw new Error(`Repository with ID ${repoId} not found.`);
      }
      const repoStatus = await this.checkRepositoryStatus(repoId);
      if (repoStatus.status !== 'active') {
        logger.error(`Repository with ID ${repoId} is not active.`);
        throw new Error(`Repository with ID ${repoId} is not active.`);
      }
      const git = simpleGit(repo.path);
      const gitUserName = await git.raw(['config', 'user.name']);

      const logOptions: LogOptions = {
        '--stat': null,
        '--author': gitUserName.trim(),
      };

      if (branch) {
        logOptions.branch = branch;
        // verify if branch exists
        const branches = await git.branch(['-a']);
        const normalizedBranches = branches.all.map((b) => b.trim());

        if (!normalizedBranches.includes(branch)) {
          logger.error(
            `Branch ${branch} does not exist in repository ${repoId}`
          );
          logger.info(`Available branches: ${normalizedBranches.join(', ')}`);
          throw new Error(
            `Branch ${branch} does not exist in repository ${repoId}`
          );
        }
      } else {
        logOptions['--all'] = null; // Fetch commits from all branches
      }

      if (repo.lastSyncedAt) {
        logOptions['--since'] = repo.lastSyncedAt.toISOString(); // Fetch commits since last sync
      }

      const logArgs = Object.entries(logOptions).flatMap(([key, value]) =>
        value === null ? [key] : [`${key}=${value}`]
      );
      const log: LogResult = await git.log(logArgs);
      const commits = [];

      for (const commit of log.all) {
        const existingCommit = await GitDataModel.findOne({
          repoId: repo._id,
          commitHash: commit.hash,
        });
        if (existingCommit) {
          logger.info(`Skipping existing commit: ${commit.hash}`);
          continue;
        }

        const diffSummary = await git.show([commit.hash, '--stat']);
        const commitStats = this.parseDiffSummary(diffSummary);
        let commitBranch = branch;

        if (!branch) {
          const branchesContaining = await git.branch([
            '--contains',
            commit.hash,
          ]);
          commitBranch = branchesContaining.all[0] || 'unknown';
        }
        const gitData = new GitDataModel({
          _id: new mongoose.Types.ObjectId(),
          repoId: repo._id,
          commitHash: commit.hash,
          message: commit.message,
          date: new Date(commit.date),
          filesChanged: commitStats.filesChanged,
          insertions: commitStats.insertions,
          deletions: commitStats.deletions,
          branch: commitBranch,
          fileNames: commitStats.fileNames,
          pullCount: 0, // Initialize pull count
          createdAt: new Date(),
          synced: true,
        });

        await gitData.save();
        logger.info(
          'Stored new commit: ' + commit.hash + ' in repository: ' + repo._id
        );
        commits.push(gitData);
      }
      const now = new Date();
      repo.updatedAt = now;
      logger.info(`Updated last synced at for repository: ${repo._id}`);

      // Fetch the commits from database for response
      const dbCommits = branch
        ? await GitDataModel.find({ repoId: repo._id, branch }).sort({
            date: -1,
          })
        : await GitDataModel.find({ repoId: repo._id }).sort({ date: -1 });

      const timeSinceLastSync = repo.lastSyncedAt
        ? this.formatTimeSince(repo.lastSyncedAt)
        : 'never synced';
      repo.lastSyncedAt = now;
      await repo.save();

      return {
        newCommits: commits,
        allCommits: dbCommits,
        totalCommits: dbCommits.length,
        lastSyncedAt: repo.lastSyncedAt,
        timeSinceLastSync: timeSinceLastSync,
        gitUserName: gitUserName.trim(),
      };
    } catch (error: any) {
      logger.error(`Error fetching commits: ${error.message}`);
      throw new Error(`Error fetching commits: ${error.message}`);
    }
  }

  private parseDiffSummary(diffOutput: string): CommitStats {
    const lines = diffOutput.split('\n');
    let filesChanged = 0;
    let insertions = 0;
    let deletions = 0;
    const fileNames: string[] = [];

    lines.forEach((line) => {
      // Match line like: "1 file changed, 2 insertions(+), 2 deletions(-)"
      const summaryMatch = line.match(
        /(\d+)\s+file[s]?\schanged(?:,\s+(\d+)\s+insertion[s]?\(\+\))?(?:,\s+(\d+)\s+deletion[s]?\(\-\))?/
      );

      if (summaryMatch) {
        filesChanged = parseInt(summaryMatch[1], 10) || 0;
        insertions = summaryMatch[2] ? parseInt(summaryMatch[2], 10) : 0;
        deletions = summaryMatch[3] ? parseInt(summaryMatch[3], 10) : 0;
      } else {
        // Match line like: "pnpm-lock.yaml | 4 ++--"
        const fileLineMatch = line.match(/^(.+?)\s+\|\s+\d+/);
        if (fileLineMatch) {
          fileNames.push(fileLineMatch[1].trim());
        }
      }
    });

    return {
      filesChanged,
      insertions,
      deletions,
      fileNames,
    };
  }

  private formatTimeSince(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return `${seconds} second${seconds > 1 ? 's' : ''} ago`;
  }

  // get all branches of a repository
  async getBranches(repoId: mongoose.Types.ObjectId) {
    try {
      logger.info(`Fetching branches for repository: ${repoId}`);
      const repo = await RepositoryModel.findById(repoId);
      if (!repo) {
        logger.error(`Repository with ID ${repoId} not found.`);
        throw new Error(`Repository with ID ${repoId} not found.`);
      }
      const repoStatus = await this.checkRepositoryStatus(repoId);
      if (repoStatus.status !== 'active') {
        logger.error(`Repository with ID ${repoId} is not active.`);
        throw new Error(`Repository with ID ${repoId} is not active.`);
      }
      const git = simpleGit(repo.path);
      const branches = await git.branch(['-a']);
      const normalizedBranches = branches.all.map((b) => b.trim());
      return normalizedBranches;
    } catch (error: any) {
      logger.error(`Error fetching branches: ${error.message}`);
      throw new Error(`Error fetching branches: ${error.message}`);
    }
  }
}
export default new GitLegacyServices();