const API_BASE = '/api';

/**
 * Get the stored JWT token.
 */
export function getToken() {
  return localStorage.getItem('commander_token');
}

/**
 * Store a JWT token.
 */
export function setToken(token) {
  localStorage.setItem('commander_token', token);
}

/**
 * Clear the stored token.
 */
export function clearToken() {
  localStorage.removeItem('commander_token');
}

/**
 * Fetch wrapper with JWT auth, error handling, and JSON parsing.
 */
export async function api(path, options = {}) {
  const token = getToken();

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.message || `Request failed: ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

/**
 * Convenience methods.
 */
export const get = (path) => api(path);
export const post = (path, body, headers) => api(path, { method: 'POST', body, headers });
export const del = (path) => api(path, { method: 'DELETE' });
