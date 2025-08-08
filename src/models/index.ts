import { IGitData, IRepository } from './interfaces';
import mongoose, { Schema } from 'mongoose';

const RepositorySchema: Schema = new Schema({
  name: { type: String, required: true },
  description: { type: String, default: null },
  path: { type: String, required: true },
  status: {
    type: String,
    enum: ['active', 'missing', 'moved', 'deleted'],
    default: 'active',
  },
  developerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
  permission: { type: String, enum: ['read', 'read-write'], required: true },
  repoFingerprint: { type: String, required: true },
  lastSyncedAt: { type: Date },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

const ChangeSchema = new Schema({
  fileName: { type: String, required: true },
  added: { type: Number, default: 0 },
  removed: { type: Number, default: 0 },
});

const StatsSchema = new Schema({
  files_changed: { type: Number, default: 0 },
  files_added: { type: Number, default: 0 },
  files_removed: { type: Number, default: 0 },
  lines_added: { type: Number, default: 0 },
  lines_removed: { type: Number, default: 0 },
});

const GitDataSchema: Schema = new Schema({
  repoId: { type: Schema.Types.ObjectId, ref: 'Repository', required: true },
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
  branch: { type: String, required: true },
  message: { type: String, required: true },
  commitHash: { type: String, required: true, unique: true },
  date: { type: Date, required: true },
  stats: {type: StatsSchema, default: () => ({}) },
  changes: { type: [ChangeSchema], default: () => [] },
  parentCommit: { type: String, default: null },
  synced: { type: Boolean, default: false },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

const RepositoryModel = mongoose.model<IRepository>(
  'Repository',
  RepositorySchema
);
const GitDataModel = mongoose.model<IGitData>('GitData', GitDataSchema);

export { RepositoryModel, GitDataModel };
