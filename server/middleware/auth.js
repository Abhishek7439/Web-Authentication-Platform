import jwt from 'jsonwebtoken';
import { getDb } from '../db/index.js';

const JWT_SECRET = () => process.env.JWT_SECRET || 'dev-secret';
const STEP_UP_FRESHNESS = () => parseInt(process.env.STEP_UP_FRESHNESS_MINUTES || '5', 10);

/**
 * Create a JWT session token for a user.
 */
export function createSessionToken(user, sessionId) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      sessionId,
    },
    JWT_SECRET(),
    { expiresIn: '24h' }
  );
}

/**
 * Middleware: Require a valid JWT session.
 * Attaches req.user and req.session on success.
 */
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized', message: 'Authentication required.' });
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET());
    const db = getDb();

    // Verify session still exists and hasn't expired
    const session = db.prepare(`
      SELECT * FROM sessions WHERE id = ? AND user_id = ?
    `).get(decoded.sessionId, decoded.sub);

    if (!session) {
      return res.status(401).json({ error: 'session_expired', message: 'Session not found or expired.' });
    }

    if (new Date(session.expires_at) < new Date()) {
      // Clean up expired session
      db.prepare('DELETE FROM sessions WHERE id = ?').run(session.id);
      return res.status(401).json({ error: 'session_expired', message: 'Session has expired.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.sub);
    if (!user) {
      return res.status(401).json({ error: 'user_not_found', message: 'User not found.' });
    }

    req.user = user;
    req.session = session;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'token_expired', message: 'Token has expired.' });
    }
    return res.status(401).json({ error: 'invalid_token', message: 'Invalid authentication token.' });
  }
}

/**
 * Middleware: Require a fresh WebAuthn assertion within the last N minutes.
 * Returns 403 with step_up_required if stale or never verified.
 */
export function requireStepUp(req, res, next) {
  const session = req.session;
  const freshnessMinutes = STEP_UP_FRESHNESS();

  // If last_verified_at is null, WebAuthn was never used in this session
  if (!session.last_verified_at) {
    return res.status(403).json({
      error: 'step_up_required',
      message: 'Re-authentication required. Please verify your identity with WebAuthn.',
      lastVerifiedMinutesAgo: null,
      requiredFreshnessMinutes: freshnessMinutes,
    });
  }

  const lastVerified = new Date(session.last_verified_at);
  const elapsed = Date.now() - lastVerified.getTime();
  const elapsedMinutes = Math.floor(elapsed / (60 * 1000));

  if (elapsed > freshnessMinutes * 60 * 1000) {
    return res.status(403).json({
      error: 'step_up_required',
      message: 'Re-authentication required. Please verify your identity.',
      lastVerifiedMinutesAgo: elapsedMinutes,
      requiredFreshnessMinutes: freshnessMinutes,
    });
  }

  next();
}

/**
 * Middleware factory: Require a specific role.
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'unauthorized', message: 'Authentication required.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'forbidden',
        message: `This action requires one of: ${roles.join(', ')}`,
      });
    }
    next();
  };
}
