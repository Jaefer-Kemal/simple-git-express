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
interface LogOptions {
  [key: string]: any; // Add this index signature
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
export { RegisterRepoInput, FetchCommitsInput, CommitStats, LogOptions };
