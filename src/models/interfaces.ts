import mongoose, { Document } from 'mongoose';

// Nested types for stats and changes
interface IChange {
  fileName: string;
  added: number;
  removed: number;
}

interface IStats {
  files_changed: number;
  files_added: number;
  files_removed: number;
  lines_added: number;
  lines_removed: number;
}

// Repository interface
interface IRepository extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  path: string;
  status: 'active' | 'missing' | 'moved' | 'deleted';
  developerId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  permission: 'read' | 'read-write';
  repoFingerprint: string;
  lastSyncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// GitData interface
interface IGitData extends Document {
  _id: mongoose.Types.ObjectId;
  repoId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  branch: string;
  message: string;
  commitHash: string;
  date: Date;
  stats: IStats;
  changes: IChange[];
  parentCommit?: string | null; // ObjectId if you switch to populate
  synced: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export { IRepository, IGitData, IStats, IChange };
