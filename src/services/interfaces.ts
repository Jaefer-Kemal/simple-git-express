import { DefaultLogFields } from 'simple-git';

interface RegisterRepoInput {
  name: string;
  description?: string;
  path: string;
  permission: 'read' | 'read-write';
}

interface FetchCommitsInput {
  branch?: string;
}

interface CommitStats {
  filesChanged: number;
  insertions: number;
  deletions: number;
  fileNames: string[];
}

interface Repository {
  id: number;
  repoId: string;
  developerId: string;
  projectId: string;
  name: string;
  description: string;
  path: string;
  permission: 'read' | 'read-write';
  status: 'active' | 'missing' | 'moved' | 'deleted';
  createdAt: Date;
  updatedAt: Date;
}

// Stricter LogOptions type, but still allows arbitrary keys
interface LogOptions {
  [key: string]: string | number | null | undefined;
  '--stat'?: null;
  '--name-only'?: null;
  '--author'?: string;
  branch?: string;
  '--pretty'?: string;
  '--no-merges'?: null;
  '--since'?: string;
  '--until'?: string;
  '--grep'?: string;
  '--all'?: null;
  '--reverse'?: null;
  '--max-count'?: number;
  '--skip'?: number;
  '--abbrev-commit'?: null;
  '--no-color'?: null;
}

interface RemoteRepository {
  repoId: string; // MongoDB repo ID
  _id: string; // Backend uses _id
  name: string;
  path: string;
  // ... other remote fields
}

interface LocalRepository {
  id: number;
  repoId: string;
  projectId: string;
  path: string;
  lastSyncedAt: string | null;
}

type LogWithParents = DefaultLogFields & {
  parents: string;
};

interface CommitPayload {
  repoId: string; // MongoDB repo ID
  developerId: string;
  projectId: string;
  commitHash: string;
  message: string;
  branch: string;
  timestamp: string | number | Date;
  stats: Record<string, any>; // Parsed JSON object from commit.stats
  changes: any[]; // Parsed JSON array from commit.changes
  parentCommit?: string;
  createdAt: Date;
  desktopSyncedAt: string | number | Date; // Originally commit.createdAt
}

interface ComparisonResult {
  counts: {
    local: number;
    remote: number;
    missingInRemote: number;
    missingInLocal: number;
  };
  diff: {
    missingInRemote: LocalRepository[];
    missingInLocal: RemoteRepository[];
  };
}

interface UpdateRepoDto{
  repoId: string; // MongoDB repo ID
  name?: string;
  description?: string;
  path?: string;
  developerId: string
}
export {
  RegisterRepoInput,
  FetchCommitsInput,
  CommitStats,
  LogOptions,
  Repository,
  RemoteRepository,
  LocalRepository,
  LogWithParents,
  ComparisonResult,
  CommitPayload,
  UpdateRepoDto
};