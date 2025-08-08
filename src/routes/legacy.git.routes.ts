import express, { Request, Response } from 'express';
import { z, ZodError } from 'zod';
import GitLegacyServices from '../services/legacyServices';
import logger from '../utils/logger';
import mongoose from 'mongoose';
import { GitDataModel, RepositoryModel } from '../models';


const router = express.Router();


// Define the schema for the request body
const registerRepositorySchema = z.object({
  name: z.string().min(1, 'Repository name is required'),
  description: z.string().optional(),
  path: z.string().min(1, 'Repository path is required'),
  permission: z.enum(['read', 'read-write'], { message: 'Invalid permission' }),
});

const updateRepositorySchema = z.object({
  repoId: z.string().min(1, 'Repository ID is required'),
  name: z.string().min(1, 'Repository name is required').optional(),
  description: z.string().optional(),
  path: z.string().min(1, 'Repository path is required').optional(),
});

const fetchCommitsSchema = z.object({
  repoId: z.string().min(1, 'Repository ID is required'),
  branch: z.string().optional(),
});

// Register a new repository
router.post('/repositories', async (req: Request, res: Response) => {
  try {
    const validatedData = registerRepositorySchema.parse(req.body);
    const repo = await GitLegacyServices.registerRepository(validatedData);
    res.status(201).json(repo);
  } catch (error: any) {
    if (error instanceof ZodError) {
      // Safe: error.issues exists
      const messages = error.issues.map((err) => err.message);
      logger.error(
        `Validation error in POST /repositories: ${messages.join(', ')}`
      );
      return res.status(400).json({ error: messages });
    }

    // For other types of errors, fallback to generic message
    logger.error(`Error in POST /repositories: ${error.message}`);
    return res
      .status(500)
      .json({ error: error?.message || 'Something went wrong' });
  }
});

// Check repository
router.get('/repositories/:id/status', async (req: Request, res: Response) => {
  try {
    const repoId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(repoId)) {
      return res.status(400).json({ error: 'Invalid repository ID' });
    }
    const objectId = new mongoose.Types.ObjectId(repoId);
    const status = await GitLegacyServices.checkRepositoryStatus(objectId);
    res.json(status);
  } catch (error: any) {
    if (error instanceof ZodError) {
      // Safe: error.issues exists
      const messages = error.issues.map((err) => err.message);
      logger.error(
        `Validation error in GET /repositories/:id/status: ${messages.join(', ')}`
      );
      return res.status(400).json({ error: messages });
    }

    // For other types of errors, fallback to generic message
    logger.error(`Error in GET /repositories/:id/status: ${error.message}`);
    return res
      .status(500)
      .json({ error: error?.message || 'Something went wrong' });
  }
});

// Fetch of all branches
router.get('/repositories/:id/commits', async (req: Request, res: Response) => {
  try {
    const data = fetchCommitsSchema.parse({
      repoId: req.params.id,
    });
    if (!mongoose.Types.ObjectId.isValid(data.repoId)) {
      return res.status(400).json({ error: 'Invalid repository ID' });
    }
    const objectId = new mongoose.Types.ObjectId(data.repoId);
    const commits = await GitLegacyServices.fetchCommits(objectId);
    res.json(commits);
  } catch (error: any) {
    if (error instanceof ZodError) {
      // Safe: error.issues exists
      const messages = error.issues.map((err) => err.message);
      logger.error(
        `Validation error in GET /repositories/:id/commits: ${messages.join(', ')}`
      );
      return res.status(400).json({ error: messages });
    }

    // For other types of errors, fallback to generic message
    logger.error(`Error in GET /repositories/:id/commits: ${error.message}`);
    return res
      .status(500)
      .json({ error: error?.message || 'Something went wrong' });
  }
});

// Fetch commits for a specific branch
router.get(
  '/repositories/:id/commits/*branch',
  async (req: Request, res: Response) => {
    try {
      const data = fetchCommitsSchema.parse({
        repoId: req.params.id,
        branch: Array.isArray(req.params[0])
          ? req.params[0].join('/')
          : req.params[0],
      });
      if (!mongoose.Types.ObjectId.isValid(data.repoId)) {
        return res.status(400).json({ error: 'Invalid repository ID' });
      }
      const objectId = new mongoose.Types.ObjectId(data.repoId);
      const commits = await GitLegacyServices.fetchCommits(objectId, {
        branch: data.branch,
      });
      res.json(commits);
    } catch (error: any) {
      if (error instanceof ZodError) {
        const messages = error.issues.map((err) => err.message);
        logger.error(
          `Validation error in GET /repositories/:id/commits/:branch: ${messages.join(', ')}`
        );
        return res.status(400).json({ error: messages });
      }
      logger.error(
        `Error in GET /repositories/:id/commits/:branch: ${error.message}`
      );
      return res
        .status(500)
        .json({ error: error?.message || 'Something went wrong' });
    }
  }
);

// Get all repositories
router.get('/repositories', async (req: Request, res: Response) => {
  try {
    const repositories = await RepositoryModel.find();
    if (!repositories.length) {
      return res.status(404).json({ error: 'No repositories found' });
    }
    logger.info(`Fetched ${repositories.length} repositories`);
    res.json({ data: repositories, count: repositories.length });
  } catch (error: any) {
    logger.error(`Error in GET /repositories: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Get all commits for a specific repository in db
router.get(
  '/repositories/:id/db-commits',
  async (req: Request, res: Response) => {
    try {
      const repoId = req.params.id;
      if (!mongoose.Types.ObjectId.isValid(repoId)) {
        return res.status(400).json({ error: 'Invalid repository ID' });
      }
      const objectId = new mongoose.Types.ObjectId(repoId);
      const commits = await GitDataModel.find({ repoId: objectId }).sort({
        date: -1,
      }); // Sort by date in descending order
      if (!commits.length) {
        return res
          .status(404)
          .json({ error: 'No commits found for this repository' });
      }
      logger.info(
        `Fetched ${commits.length} commits for repository: ${repoId}`
      );
      res.json({ data: commits, count: commits.length });
    } catch (error: any) {
      logger.error(
        `Error in GET /repositories/:id/db-commits: ${error.message}`
      );
      res.status(500).json({ error: error.message });
    }
  }
);

// Get all branches for a specific repository
router.get(
  '/repositories/:id/branches',
  async (req: Request, res: Response) => {
    try {
      const repoId = req.params.id;
      if (!mongoose.Types.ObjectId.isValid(repoId)) {
        return res.status(400).json({ error: 'Invalid repository ID' });
      }
      const objectId = new mongoose.Types.ObjectId(repoId);
      const branches = await GitLegacyServices.getBranches(objectId);
      if (!branches.length) {
        return res
          .status(404)
          .json({ error: 'No branches found for this repository' });
      }
      logger.info(
        `Fetched ${branches.length} branches for repository: ${repoId}`
      );
      res.json({ data: branches, count: branches.length });
    } catch (error: any) {
      logger.error(`Error in GET /repositories/:id/branches: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  }
);

// Update a repository
router.put('/repositories/:id', async (req: Request, res: Response) => {
  try {
    const repoId = req.params.id;
    const validatedData = updateRepositorySchema.parse({
      ...req.body,
      repoId: repoId,
    });

    if (!mongoose.Types.ObjectId.isValid(repoId)) {
      return res.status(400).json({ error: 'Invalid repository ID' });
    }
    const objectId = new mongoose.Types.ObjectId(repoId);
    const updatedRepo = await RepositoryModel.findByIdAndUpdate(
      objectId,
      validatedData,
      { new: true }
    );
    if (!updatedRepo) {
      return res.status(404).json({ error: 'Repository not found' });
    }
    logger.info(`Updated repository: ${repoId}`);
    res.json({ data: updatedRepo });
  } catch (error: any) {
    logger.error(`Error in PUT /repositories/:id: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Delete a repository
router.delete('/repositories/:id', async (req: Request, res: Response) => {
  try {
    const repoId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(repoId)) {
      return res.status(400).json({ error: 'Invalid repository ID' });
    }
    const objectId = new mongoose.Types.ObjectId(repoId);
    // Delete the repository and its associated git data
    const gitData = await GitDataModel.find({ repoId: objectId });
    if (gitData.length > 0) {
      logger.info(`Deleting associated git data for repository: ${repoId}`);
      await GitDataModel.deleteMany({ repoId: objectId });
    }
    logger.info(`Deleting repository: ${repoId}`);
    // Delete the repository from the database
    const deletedRepo = await RepositoryModel.findByIdAndDelete(objectId);
    if (!deletedRepo) {
      return res.status(404).json({ error: 'Repository not found' });
    }
    logger.info(`Deleted repository: ${repoId}`);
    res.json({ data: deletedRepo });
  } catch (error: any) {
    logger.error(`Error in DELETE /repositories/:id: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

export default router;
