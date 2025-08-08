import { Request, Response } from 'express';
import axios from 'axios';
import { getSessionDb } from '../config/session.db';
import { checkToken } from '../utils/checkToken';
import logger from '../utils/logger'; // If you have a logger

export const simulateLogin = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const response = await axios.post('http://localhost:3001/api/auth/login', {
      email,
      password,
      rememberMe: true,
    });

    const { access_token, refresh_token, user } = response.data.data;

    if (user.userType !== 'developer') {
      logger.warn(`🚫 Access denied. UserType: ${user.userType}`);
      return res.status(403).json({
        statusCode: 403,
        message: 'Only developers can login',
        error: 'Forbidden',
      });
    }

    // Fetch token expirations
    const accessTokenExpiresAt = await checkToken(access_token);
    const refreshTokenExpiresAt = await checkToken(refresh_token);

    // Save to DB
    const db = getSessionDb();
    db.prepare('DELETE FROM session WHERE id = 1').run();
    db.prepare(
      `INSERT INTO session 
       (id, accessToken, refreshToken, accessTokenExpiresAt, refreshTokenExpiresAt, userId, email, userType)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run([
      1,
      access_token,
      refresh_token,
      accessTokenExpiresAt.toString(),
      refreshTokenExpiresAt.toString(),
      user._id.toString(),
      user.email,
      user.userType,
    ]);

    logger.info(`✅ Simulated login successful for user: ${user.email}`);
    return res.status(200).json(response.data);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      const { status, data } = error.response;
      logger.error(`❌ Login failed with status ${status}:`, data);
      return res.status(status).json(data);
    }

    logger.error('❌ Unexpected error:', error);
    return res.status(500).json({
      statusCode: 500,
      message: 'Internal server error',
      error: 'InternalServerError',
    });
  }
};
