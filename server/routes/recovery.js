import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getDb } from '../db/index.js';
import { v4 as uuidv4 } from 'uuid';
import { appendAuditLog } from '../audit/index.js';
import { generateMagicLink } from '../auth/magic-link.js';

const router = Router();

/**
 * POST /api/recovery/self-serve
 * Initiate self-serve account recovery.
 * Sends a magic link and creates a recovery request with elevated risk window.
 */
router.post('/self-serve', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'validation', message: 'Email is required.' });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    // Don't leak existence — always return success
    if (!user) {
      return res.json({ initiated: true, message: 'If an account exists, recovery instructions have been sent.' });
    }

    // Create recovery request
    const recoveryId = uuidv4();
    db.prepare(`
      INSERT INTO recovery_requests (id, user_id, method, status)
      VALUES (?, ?, 'self_serve', 'pending')
    `).run(recoveryId, user.id);

    // Set user to recovery pending
    db.prepare("UPDATE users SET recovery_status = 'pending' WHERE id = ?").run(user.id);

    // Generate magic link for verification
    const origin = process.env.WEBAUTHN_ORIGIN || 'http://localhost:5173';
    const { token, link } = generateMagicLink(user.id, origin);

    // Set 48-hour elevated risk window after recovery
    const elevatedUntil = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    db.prepare("UPDATE users SET recovery_elevated_until = ? WHERE id = ?").run(elevatedUntil, user.id);

    appendAuditLog('recovery_initiated', user.id, {
      recoveryId,
      method: 'self_serve',
      elevatedUntil,
    });

    res.json({
      initiated: true,
      message: 'Recovery link generated (demo mode).',
      recoveryId,
      demoLink: link,
      token,
    });
  } catch (err) {
    console.error('[recovery/self-serve]', err);
    res.status(500).json({ error: 'internal', message: 'Recovery initiation failed.' });
  }
});

/**
 * POST /api/recovery/complete
 * Complete recovery: mark completed, activate elevated risk window.
 */
router.post('/complete', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const user = req.user;

    // Update recovery status
    db.prepare("UPDATE users SET recovery_status = 'active' WHERE id = ?").run(user.id);

    // Mark recovery request as completed
    db.prepare(`
      UPDATE recovery_requests SET status = 'completed', resolved_at = datetime('now')
      WHERE user_id = ? AND status = 'pending'
    `).run(user.id);

    appendAuditLog('recovery_completed', user.id, {
      elevatedUntil: user.recovery_elevated_until,
    });

    res.json({
      completed: true,
      elevatedUntil: user.recovery_elevated_until,
      message: 'Recovery complete. Your account is in elevated security mode for 48 hours.',
    });
  } catch (err) {
    console.error('[recovery/complete]', err);
    res.status(500).json({ error: 'internal', message: 'Failed to complete recovery.' });
  }
});

/**
 * POST /api/recovery/credentials/revoke
 * Revoke a specific credential (e.g., lost device).
 */
router.post('/credentials/revoke', requireAuth, async (req, res) => {
  try {
    const { credentialId } = req.body;
    if (!credentialId) {
      return res.status(400).json({ error: 'validation', message: 'credentialId is required.' });
    }

    const db = getDb();
    const cred = db.prepare('SELECT * FROM credentials WHERE id = ? AND user_id = ?')
      .get(credentialId, req.user.id);

    if (!cred) {
      return res.status(404).json({ error: 'not_found', message: 'Credential not found.' });
    }

    db.prepare("UPDATE credentials SET revoked_at = datetime('now') WHERE id = ?").run(credentialId);

    appendAuditLog('credential_revoked', req.user.id, {
      credentialId,
      type: cred.type,
    });

    res.json({ revoked: true, credentialId, type: cred.type });
  } catch (err) {
    console.error('[recovery/revoke]', err);
    res.status(500).json({ error: 'internal', message: 'Failed to revoke credential.' });
  }
});

/**
 * GET /api/recovery/requests
 * List recovery requests (admin only).
 */
router.get('/requests', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const db = getDb();
    const requests = db.prepare(`
      SELECT rr.*, u.email, u.display_name
      FROM recovery_requests rr
      JOIN users u ON rr.user_id = u.id
      ORDER BY rr.initiated_at DESC
    `).all();

    res.json({ requests });
  } catch (err) {
    console.error('[recovery/requests]', err);
    res.status(500).json({ error: 'internal', message: 'Failed to fetch recovery requests.' });
  }
});

export default router;
