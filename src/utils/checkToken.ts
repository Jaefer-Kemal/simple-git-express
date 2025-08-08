import axios from 'axios';
import logger from './logger';
export async function checkToken(token: string) {
    try {
        const response = await axios.post('http://localhost:3001/api/auth/check-token', {
            token,
        });
        
        return response.data.data.expirationDate; // Assuming the response structure is { data: { ... } }
    } catch (error) {
        logger.error('[checkToken] Error checking token:', error);
        throw error;
    }
}
