import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getAuditLog, verifyChainIntegrity } from '../audit/index.js';

const router = Router();

/**
 * GET /api/audit
 * Get paginated audit log entries (newest first).
 */
router.get('/', requireAuth, (req, res) => {
  try {
    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '50', 10);
    const result = getAuditLog(page, Math.min(limit, 100));
    res.json(result);
  } catch (err) {
    console.error('[audit/list]', err);
    res.status(500).json({ error: 'internal', message: 'Failed to fetch audit log.' });
  }
});

/**
 * GET /api/audit/verify
 * Verify the integrity of the entire audit chain.
 */
router.get('/verify', requireAuth, (req, res) => {
  try {
    const result = verifyChainIntegrity();
    res.json(result);
  } catch (err) {
    console.error('[audit/verify]', err);
    res.status(500).json({ error: 'internal', message: 'Failed to verify chain integrity.' });
  }
});

import { getDb } from '../db/index.js';

/**
 * POST /api/audit/tamper-test
 * Intentionally corrupt an audit log entry for demo purposes.
 * Backs up the original payload so it can be restored.
 */
router.post('/tamper-test', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const entry = db.prepare('SELECT id, payload FROM audit_log ORDER BY id DESC LIMIT 1 OFFSET 2').get();
    
    if (!entry) {
      return res.status(400).json({ error: 'not_enough_entries', message: 'Need more audit logs to tamper.' });
    }

    // Back up original payload
    db.prepare(`INSERT OR REPLACE INTO tamper_backups (audit_id, original_payload) VALUES (?, ?)`).run(entry.id, entry.payload);

    // Tamper with it
    const fakePayload = JSON.stringify({ tampered: true, original: 'deleted' });
    db.prepare('UPDATE audit_log SET payload = ? WHERE id = ?').run(fakePayload, entry.id);

    res.json({ success: true, tamperedId: entry.id });
  } catch (err) {
    console.error('[audit/tamper]', err);
    res.status(500).json({ error: 'internal', message: 'Tamper failed.' });
  }
});

/**
 * POST /api/audit/tamper-test/undo
 * Restore a corrupted audit log entry from the backup.
 */
router.post('/tamper-test/undo', requireAuth, (req, res) => {
  try {
    const db = getDb();
    // Get the most recent tamper backup
    const backup = db.prepare('SELECT audit_id, original_payload FROM tamper_backups ORDER BY audit_id DESC LIMIT 1').get();
    
    if (!backup) {
      return res.status(400).json({ error: 'no_backup', message: 'No tampered entries to restore.' });
    }

    // Restore original payload
    db.prepare('UPDATE audit_log SET payload = ? WHERE id = ?').run(backup.original_payload, backup.audit_id);
    // Delete the backup
    db.prepare('DELETE FROM tamper_backups WHERE audit_id = ?').run(backup.audit_id);

    res.json({ success: true, restoredId: backup.audit_id });
  } catch (err) {
    console.error('[audit/undo]', err);
    res.status(500).json({ error: 'internal', message: 'Undo failed.' });
  }
});

export default router;
