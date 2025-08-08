import express, { Request, Response } from 'express';
import GitServices from '../services/gitServices';
import logger from '../utils/logger';
import mongoose from 'mongoose';
import { getGitDb } from '../config/git.db';
import axios from 'axios';
import { checkAndRefreshSession } from '../utils/checkSession';

const backendApi = axios.create({ baseURL: process.env.BACKEND_API_URL });

export const RegisterRepoController = async (req: Request, res: Response) => {
  let db; // Define here to be accessible in the finally block if needed
  try {
    const { name, description, path, projectId } = req.body;

    // --- Step 1: Handle Authentication ---
    // The route is responsible for getting the credentials needed for the API call.
    const session = await checkAndRefreshSession();

    // --- Step 2: Call the Focused Validation Service ---
    // The route calls the simple service to perform the pure validation task.
    // If this fails, it will throw and be caught by our single catch block.
    const repoFingerprint = await GitServices.validateLocalRepository(path);
    logger.info(`[RegisterRepo] Local validation successful for path "${path}"`);

    // --- Step 3: Orchestrate the External API Call ---
    const backendPayload = {
      name,
      description,
      path,
      projectId,
      developerId: session.userId,
      repoFingerprint,
    };

    const response = await backendApi.post(
      '/repositories/register',
      backendPayload,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.accessToken}`,
        },
      }
    );
    
    // --- Step 4: Save the Successful Result to the Local Database ---
    db = getGitDb();
    const repoData = response.data.data;
    const insertStmt = db.prepare(`
      INSERT INTO repositories (repoId, name, description, path, developerId, projectId, permission, repoFingerprint)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = insertStmt.run(
      repoData._id, repoData.name, repoData.description, repoData.path, 
      repoData.developerId, repoData.projectId, repoData.permission, repoData.repoFingerprint
    );
    logger.info(`Repository saved locally with ID ${result.lastInsertRowid}`);

    // --- Step 5: Send the Final Success Response ---
    return res.status(201).json({
      success: true,
      message: 'Repository registered successfully.',
      data: response.data,
    });

  } catch (error: any) {
    
    // --- Step 6: Centralized Error Handling ---
    // This single block catches errors from the session, validation service, axios, or the DB insert.
    const status = error.response?.status || 400; // Default to 400 for validation/client errors
    const message = error.response?.data?.message || error.message;

    logger.error(`[RegisterRepo] Failed: ${message}`);
    return res.status(status).json({ success: false, message: message });
  } finally {
    // Ensure the database connection is always closed.
    if (db) db.close();
  }
}

export const ExtractCommitController = async (req: Request, res: Response) => {
    try {
      const { repoId } = req.params;
      const session = await checkAndRefreshSession();
      const developerId = session.userId;
      const newCommits = await GitServices.extractNewCommits(repoId, developerId);

      if (newCommits.length === 0) {
        return res.status(200).json({
          success: true,
          message: 'No new commits to extract. Repository is up-to-date.',
          data: [],
        });
      }

      return res.status(200).json({
        success: true,
        message: `Successfully extracted ${newCommits.length} new commits.`,
        data: newCommits,
      });
    } catch (error: any) {
      logger.error(`❌ Failed to extract new commits: ${error.message}`);
    // ENOENT
      if (error.code === 'ENOENT') {
        return res.status(404).json({ success: false, message: 'Repository is missing or inaccessible.' });
      }
      if (error.message.includes('not a git repository'))
        return res.status(400).json({success: false, message: 'Not a valid git repository.' });
      return res.status(500).json({
        success: false,
        message: error.message || 'An internal server error occurred.',
      });
    }
  }

export const CheckStatusController =  async (req: Request, res: Response) => {
  const successes: any[] = [];
  const failures: any[] = [];

  try {
    // 1. Get Session once for all subsequent operations.
    const session = await checkAndRefreshSession();

    // 2. Call the pure service to get the list of local statuses.
    const localStatuses = await GitServices.checkAllLocalRepoStatuses(session.userId);

    if (localStatuses.length === 0) {
      return res.status(200).json({ success: true, message: 'No local repositories found to check.' });
    }

    // 3. Orchestrate the batch update process.
    // Loop through the local statuses and update each one on the backend.
    for (const repoStatus of localStatuses) {
      try {
        // --- This inner try/catch handles INDIVIDUAL failures ---
        const updateDto = { status: repoStatus.status };
        
        // 3a. Update the backend via API call.
        await backendApi.patch(
          `/repositories/${repoStatus.repoId}`,
          updateDto,
          { headers: { 'Authorization': `Bearer ${session.accessToken}` } }
        );

        // 3b. If backend update is successful, update the local DB.
        await GitServices.updateLocalRepoStatus(repoStatus.id, repoStatus.status);

        // 3c. If both succeed, add to the success report.
        successes.push({
          repoId: repoStatus.repoId,
          path: repoStatus.path,
          status: repoStatus.status,
        });

      } catch (error: any) {
        // 3d. If anything fails for this specific repo, add it to the failure report.
        const errorMessage = error.response?.data?.message || error.message;
        logger.error(`[StatusCheck] Failed to process repository ${repoStatus.repoId}: ${errorMessage}`);
        failures.push({
          repoId: repoStatus.repoId,
          path: repoStatus.path,
          error: errorMessage,
        });
      }
    }

    // 4. Send the final aggregated report.
    return res.status(200).json({
      success: true,
      allSucceeded: failures.length === 0,
      totalChecked: localStatuses.length,
      totalSuccess: successes.length,
      totalFailed: failures.length,
      data: { successes, failures },
    });

  } catch (error: any) {
    // 5. This outer catch block handles CATASTROPHIC failures (e.g., session check fails).
    logger.error(`[StatusCheck] A critical error occurred during the operation:`, error.message);
    return res.status(500).json({
      success: false,
      message: 'A critical error prevented the status check from running.',
      error: error.message,
    });
  }
}


export const CompareRepositoriesController = async (req: Request, res: Response) => {
  try {
    // 1. Get Session
    const session = await checkAndRefreshSession();

    // 2. Fetch data from the backend
    const response = await backendApi.get('/repositories/me/developer', {
      headers: { 'Authorization': `Bearer ${session.accessToken}` }
    });
    const remoteRepos = response.data.data;

    // 3. Call the pure service with the fetched data
    const comparisonResult = await GitServices.compareRepositories(session.userId, remoteRepos);

    // 4. Send the successful response
    return res.status(200).json({
      success: true,
      message: 'Repository comparison complete.',
      data: comparisonResult,
    });
  } catch (error: any) {
    // 5. Centralized error handling
    const status = error.response?.status || 500;
    const message = error.response?.data?.message || error.message;
    logger.error(`[CompareRepos] Failed: ${message}`);
    return res.status(status).json({ success: false, message });
  }
}

export const FetchRepositoryController = async (req: Request, res: Response) => {
  try {
    // --- This route is a "super orchestrator" ---

    // 1. Get Session
    const session = await checkAndRefreshSession();

    // 2. Fetch data from the backend
    const response = await backendApi.get('/repositories/me/developer', {
      headers: { 'Authorization': `Bearer ${session.accessToken}` }
    });
    const remoteRepos = response.data.data;

    // 3. Call the first pure service (compare)
    const compareRes = await GitServices.compareRepositories(session.userId, remoteRepos);

    // 4. Call the second pure service (build view), using the result of the first
    const consolidatedView = await GitServices.getConsolidatedRepositoryView(session.userId, compareRes);

    // 5. Send the final successful response
    return res.status(200).json({
      success: true,
      ...consolidatedView, // Spread the result as it's already well-formatted
    });
  } catch (error: any) {
    // 6. Centralized error handling for the entire flow
    const status = error.response?.status || 500;
    const message = error.response?.data?.message || error.message;
    logger.error(`[GetRepoView] Failed: ${message}`);
    return res.status(status).json({ success: false, message });
  }
}

export const UpdateRepositoryController = async (req: Request, res: Response) => {
  try {
    const { repoId } = req.params;
    const { name, description } = req.body;

    // 1. Validate Input
    if (!mongoose.Types.ObjectId.isValid(repoId)) {
      return res.status(400).json({ success: false, message: 'Invalid repository ID format.' });
    }

    // 2. Get Session
    const session = await checkAndRefreshSession();

    // 3. Orchestrate the Update: Backend first, then local.
    // 3a. Update the backend (the primary source of truth).
    const backendResponse = await backendApi.patch(
      `/repositories/${repoId}`,
      { name, description }, // Only send the fields that can be changed
      { headers: { 'Authorization': `Bearer ${session.accessToken}` } }
    );
    logger.info(`[UpdateRepo] Backend successfully updated for repo ${repoId}.`);

    // 3b. If backend succeeds, update the local SQLite cache.
    await GitServices.updateLocalRepository({
      repoId,
      name,
      description,
      developerId: session.userId,
    });
    logger.info(`[UpdateRepo] Local SQLite cache successfully updated for repo ${repoId}.`);

    // 4. Send the final success response.
    return res.status(200).json({
      success: true,
      message: 'Repository updated successfully.',
      data: backendResponse.data, // Return the fresh data from the backend
    });

  } catch (error: any) {
    // 5. Centralized Error Handling for the entire flow.
    const status = error.response?.status || 404; // Default to 404 if repo not found
    const message = error.response?.data?.message || error.message;

    logger.error(`[UpdateRepo] Failed: ${message}`);
    return res.status(status).json({ success: false, message });
  }
}

export const SyncUnsyncedCommitsController = async (req: Request, res: Response) => {
  try {
    const { repoId } = req.params;

    // 1. The Route handles the session
    const session = await checkAndRefreshSession();

    // 2. The Route calls the pure service to get the raw data
    const unsyncedCommits = await GitServices.getUnsyncedCommits(repoId, session.userId);

    // 3. The Route handles the "nothing to sync" case
    if (unsyncedCommits.length === 0) {
      return res.status(200).json({ success: true, message: 'Repository is already in sync.' });
    }
    logger.info(`[SyncRoute] Found ${unsyncedCommits.length} unsynced commits for repo ${repoId}.`);

    // 4. The Route is responsible for preparing the final API payload
    const payload = unsyncedCommits.map((commit: any) => ({
      repoId: commit.repoId,
      developerId: commit.developerId,
      projectId: commit.projectId,
      commitHash: commit.commitHash,
      message: commit.message,
      branch: commit.branch,
      timestamp: commit.timestamp,
      stats: JSON.parse(commit.stats || '{}'),
      changes: JSON.parse(commit.changes || '[]'),
      parentCommit: commit.parentCommit,
      desktopSyncedAt: commit.createdAt,
    }));

    // 5. The Route orchestrates the external API call
    const response = await backendApi.post('/git-data/commits', payload, {
      headers: { 'Authorization': `Bearer ${session.accessToken}` }
    });
    
    // 6. If the backend call is successful, the Route calls the second pure service to update the local state
    const changes = await GitServices.markCommitsAsSynced(repoId, session.userId);
    
    // 7. The Route sends the final success response
    return res.status(200).json({
      success: true,
      message: `Successfully synced ${changes} commits.`,
      data: response.data,
    });

  } catch (error: any) {
    // 8. The Route handles all errors for the entire flow
    const status = error.response?.status || 500;
    const message = error.response?.data?.message || error.message;
    logger.error(`[SyncRoute] Failed: ${message}`);
    return res.status(status).json({ success: false, message });
  }
}