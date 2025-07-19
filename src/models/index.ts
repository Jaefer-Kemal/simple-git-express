import { IGitData, IRepository } from './interfaces';
import mongoose, { Schema, Document } from 'mongoose';

const RepositorySchema: Schema = new Schema({
  _id: {
    type: Schema.Types.ObjectId,
    default: () => new mongoose.Types.ObjectId(),
  },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  path: { type: String, required: true },
  status: {
    type: String,
    enum: ['active', 'missing', 'moved'],
    default: 'active',
  },
  permission: { type: String, enum: ['read', 'read-write'], required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  lastSyncedAt: { type: Date },
});

const GitDataSchema: Schema = new Schema({
  _id: {
    type: Schema.Types.ObjectId,
    default: () => new mongoose.Types.ObjectId(),
  },
  repoId: { type: Schema.Types.ObjectId, ref: 'Repository', required: true },
  commitHash: { type: String, required: true },
  message: { type: String, required: true },
  date: { type: Date, required: true },
  filesChanged: { type: Number, required: true },
  insertions: { type: Number, required: true },
  deletions: { type: Number, required: true },
  branch: { type: String, required: true },
  fileNames: { type: [String], required: true },
  pullCount: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
  synced: { type: Boolean, default: false },
});

const RepositoryModel = mongoose.model<IRepository>(
  'Repository',
  RepositorySchema
);
const GitDataModel = mongoose.model<IGitData>('GitData', GitDataSchema);

export { RepositoryModel, GitDataModel };
