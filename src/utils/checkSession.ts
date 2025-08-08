// src/utils/checkSession.ts
import { getSessionDb } from '../config/session.db';
import axios, { AxiosError } from 'axios';
import logger from './logger';
import { checkToken } from './checkToken';

export interface ValidSession {
  userId: string;
  accessToken: string;
}

interface Session {
  id: number;
  userId: string;
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

export async function checkAndRefreshSession(): Promise<ValidSession> {
  const db = getSessionDb();
  const session = db.prepare('SELECT * FROM session WHERE id = ?').get(1) as Session | undefined;

  if (!session) {
    throw new Error('No active session. Please authenticate.');
  }

  const now = Date.now();
  const accessTokenExpiresAt = new Date(session.accessTokenExpiresAt).getTime();
  const refreshTokenExpiresAt = new Date(session.refreshTokenExpiresAt).getTime();

  let accessToken = session.accessToken;

  // Access token expired
  if (now >= accessTokenExpiresAt) {
    logger.warn('[Session] Access token expired, attempting refresh...');

    if (now >= refreshTokenExpiresAt) {
      throw new Error('Session expired. Please re-authenticate.');
    }

    try {
      const response = await axios.post('http://localhost:3001/api/auth/refresh', {
        refreshToken: session.refreshToken,
      });

      accessToken = response.data.data.access_token;
      const tokenInfo = await checkToken(accessToken);
      const newAccessTokenExpiresAt = tokenInfo.toString();

      db.prepare(
        'UPDATE session SET accessToken = ?, accessTokenExpiresAt = ? WHERE id = ?'
      ).run(accessToken, newAccessTokenExpiresAt, 1);

      logger.info('[Session] Access token refreshed and session updated.');
    } catch (err) {
        
      let errorMessage = 'Failed to refresh session. Please re-authenticate.';
      
      if (axios.isAxiosError(err) && err.code === 'ECONNREFUSED') {
          // Create the specific error message
          errorMessage = 'Authentication service is down or unreachable. Please try again later.';
          // Log the clean, specific error
          logger.error(`[Session] Refresh failed: ${errorMessage} (Code: ${err.code})`);
      } else {
          // Log any other kind of error
          logger.error('[Session] Failed to refresh access token:', err);
      }
      // Throw the final, appropriate error message
      throw new Error(errorMessage);
    }
  }

  return {
    userId: session.userId,
    accessToken,
  };
}
