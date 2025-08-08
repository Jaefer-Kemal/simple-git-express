// src/config/git.db.ts
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.resolve(__dirname, '../../git-tracker.sqlite');
if (!fs.existsSync(path.dirname(dbPath))) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}
export function getGitDb() {
const db = new Database(dbPath);

// Optional
db.pragma('journal_mode = WAL');

// Initialize schema
db.exec(/* sql */`
CREATE TABLE IF NOT EXISTS repositories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repoId TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  path TEXT NOT NULL,
  status TEXT DEFAULT 'active', -- active, missing, moved
  developerId TEXT, -- can be null
  projectId TEXT, -- can be null until verified
  permission TEXT NOT NULL, -- read, read-write
  repoFingerprint TEXT NOT NULL,
  lastSyncedAt DATETIME DEFAULT NULL,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS git_commits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repoId INTEGER NOT NULL,
  developerId TEXT, -- can be null
  projectId TEXT, -- assigned later
  branch TEXT NOT NULL,
  message TEXT NOT NULL,
  commitHash TEXT NOT NULL,
  timestamp DATETIME NOT NULL,
  stats TEXT, -- JSON string for StatsSchema
  changes TEXT, -- JSON string for array of ChangeSchema
  parentCommit TEXT,
  synced BOOLEAN DEFAULT 0,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(commitHash, projectId, developerId)
);
`);
return db;
}
