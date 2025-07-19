import express from 'express';
import connectDB from './config/db';
import dotenv from 'dotenv';
import { default as router } from './routes/git.routes';
import { errorHandler } from './middleware/error.middleware';
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
app.use(express.json());
connectDB();

app.use('/api/git', router);
app.use(errorHandler);
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
