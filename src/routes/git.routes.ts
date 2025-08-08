import express from 'express';

import {
  CheckStatusController,
  CompareRepositoriesController,
  ExtractCommitController,
  FetchRepositoryController,
  RegisterRepoController,
  SyncUnsyncedCommitsController,
  UpdateRepositoryController,
} from '../controllers/git.controller';

const router = express.Router();

router.post('/register-repo', RegisterRepoController);

router.get('/extract-new-commits/:repoId', ExtractCommitController);

router.get('/repositories/status-check', CheckStatusController);

router.get('/compare-repos', CompareRepositoriesController);

router.get('/get-repo', FetchRepositoryController);

router.patch('/update-repo/:repoId', UpdateRepositoryController);

router.post('/sync-unsynced-commits/:repoId', SyncUnsyncedCommitsController);

export default router;
