import express from 'express';
import dotenv from 'dotenv';
import gitRoutes from './routes/git.routes';
import authRoutes from './routes/auth.routes';
import { errorHandler } from './middleware/error.middleware';
import { startScheduler } from './jobs/scheduler';

// Uncomment the following lines if you want to use legacy routes
// import gitLegacyRoutes from './routes/legacy.git.routes';
// import connectDB from './config/legacy.db';

dotenv.config();

const app = express();
const PORT = 5000;
app.use(express.json());

// Uncomment the following lines if you want to use legacy routes
// app.use('/api/legacy', gitLegacyRoutes);
// connectDB();

app.use('/api/git', gitRoutes);
app.use('/api/auth', authRoutes);
app.use(errorHandler);

// Scheduler for periodic tasks
startScheduler();

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
