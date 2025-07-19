import mongoose, { Document } from 'mongoose';

// Interface for the Git model
interface IRepository extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  path: string;
  status: 'active' | 'missing' | 'moved' | 'deleted';
  permission: 'read' | 'read-write';
  createdAt: Date;
  updatedAt: Date;
  lastSyncedAt?: Date;
}

interface IGitData extends Document {
  _id: mongoose.Types.ObjectId;
  repoId: mongoose.Types.ObjectId;
  commitHash: string;
  message: string;
  date: Date;
  filesChanged: number;
  insertions: number;
  deletions: number;
  branch: string;
  fileNames: string[];
  pullCount: number;
  createdAt: Date;
  synced: boolean;
}

export { IRepository, IGitData };
