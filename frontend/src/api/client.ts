import axios from 'axios';
import { rateLimitManager } from '@/lib/rateLimitManager';
import { notifySessionExpired } from '@/features/auth/authEvents';

// Create a base client using the Vite proxy
export const apiClient = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Intercept requests to add the Authorization header
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('airw_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Intercept responses to handle global errors (401 Unauthorized, 429 Rate Limits)
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // A stored token that is rejected has expired: drop it and ask to log in again over the current page.
      // Requests made while signed out just fail; visitors are never interrupted by the dialog.
      const hadToken = localStorage.getItem('airw_token') !== null;
      localStorage.removeItem('airw_token');
      if (hadToken) notifySessionExpired();
    } else if (error.response?.status === 429) {
      // Show the rate limit popup beside whatever started the request
      rateLimitManager.notify(error);
    }
    return Promise.reject(error);
  }
);

