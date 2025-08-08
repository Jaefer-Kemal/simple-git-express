import { Router } from 'express';
import { simulateLogin } from '../controllers/auth.controller';

const router = Router();

router.post('/simulate-login', simulateLogin);

export default router;
