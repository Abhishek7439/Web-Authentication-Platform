import { getDb } from '../db/index.js';

/**
 * Idempotency middleware factory.
 * Reads Idempotency-Key header, stores and replays responses for duplicate keys.
 * Covers POST /api/approvals and POST /api/approvals/:id/vote.
 */
export function idempotency(req, res, next) {
  const key = req.headers['idempotency-key'];

  // If no key provided, pass through normally
  if (!key) return next();

  const db = getDb();
  const route = `${req.method} ${req.baseUrl}${req.path}`;

  // Clean up expired keys (older than 24h)
  db.prepare(`DELETE FROM idempotency_keys WHERE expires_at < datetime('now')`).run();

  // Check for existing key
  const existing = db.prepare('SELECT * FROM idempotency_keys WHERE key = ?').get(key);

  if (existing) {
    // Key conflict: same key used for a different route
    if (existing.route !== route) {
      return res.status(422).json({
        error: 'idempotency_key_conflict',
        message: `This Idempotency-Key was already used for a different route: ${existing.route}`,
      });
    }

    // Replay stored response
    return res.status(existing.response_status).json(JSON.parse(existing.response_body));
  }

  // Intercept the response to store it
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    // Store the response for future replays
    try {
      db.prepare(`
        INSERT INTO idempotency_keys (key, route, response_status, response_body, expires_at)
        VALUES (?, ?, ?, ?, datetime('now', '+24 hours'))
      `).run(key, route, res.statusCode, JSON.stringify(body));
    } catch (err) {
      // If insert fails (e.g., race condition), just continue
      console.warn('[idempotency] Failed to store key:', err.message);
    }

    return originalJson(body);
  };

  next();
}
