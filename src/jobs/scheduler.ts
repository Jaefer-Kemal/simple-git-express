import cron from 'node-cron';
import { getSessionDb } from '../config/session.db';
import axios, { AxiosError } from 'axios'; // <-- Import AxiosError
import logger from '../utils/logger';
import { checkToken } from '../utils/checkToken';

interface Session {
  id: number;
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

export function startScheduler(): void {
  cron.schedule('*/10 * * * *', async () => {
    logger.info('[Scheduler] Running session check...');

    try {
      const db = getSessionDb(); 

      const session = db
        .prepare('SELECT * FROM session WHERE id = ?')
        .get(1) as Session | undefined;

      if (!session) {
        logger.warn('[Scheduler] No session found, skipping check');
        return;
      }

      const now = new Date().getTime();
      const accessTokenExpiresAt = new Date(session.accessTokenExpiresAt).getTime();
      const refreshTokenExpiresAt = new Date(session.refreshTokenExpiresAt).getTime();
      let accessToken = session.accessToken;
      
      if (now >= accessTokenExpiresAt) {
        logger.warn('[Scheduler] Access token expired, attempting refresh...');

        if (now >= refreshTokenExpiresAt) {
          logger.error(
            '[Scheduler] Refresh token also expired. Manual re-authentication required.'
          );
          return;
        }

        try {
          const response = await axios.post(
            'http://localhost:3001/api/auth/refresh',
            {
              refreshToken: session.refreshToken,
            }
          );

          accessToken = response.data.data.access_token;
          const tokenInfo = await checkToken(accessToken);
          const newAccessTokenExpiresAt = tokenInfo.toString();

          db.prepare(
            'UPDATE session SET accessToken = ?, accessTokenExpiresAt = ? WHERE id = ?'
          ).run(accessToken, newAccessTokenExpiresAt, 1);

          logger.info(
            '[Scheduler] Access token refreshed and session updated.'
          );
        } catch (err) {
          // =================== START: FIXED ERROR HANDLER ===================
          if (axios.isAxiosError(err)) {
            // Check for a network error (server down, no route, etc.)
            if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
                logger.error(`[Scheduler] Failed to refresh: Authentication service is unreachable at ${err.config?.url}. (Code: ${err.code})`);
            } else {
                // Handle other potential Axios errors (like a 401 or 500 response from the auth server)
                logger.error(`[Scheduler] Auth service returned an error. Status: ${err.response?.status}, Data: ${JSON.stringify(err.response?.data)}`);
            }
          } else {
            // Handle non-Axios errors (e.g., programming errors)
            logger.error('[Scheduler] An unexpected non-network error occurred during refresh:', err);
          }
          // ==================== END: FIXED ERROR HANDLER ====================
        }
      } else {
        logger.info('[Scheduler] Access token still valid. No action needed.');
      }
    } catch (err) {
      logger.error('[Scheduler] Unexpected error during session check:', err);
    }
  });
}