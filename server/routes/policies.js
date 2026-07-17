import { Router } from 'express';
import { getDb } from '../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { v4 as uuidv4 } from 'uuid';
import { appendAuditLog } from '../audit/index.js';

const router = Router();

/**
 * GET /api/policies
 * List all approval policies.
 */
router.get('/', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const policies = db.prepare('SELECT * FROM approval_policies ORDER BY created_at DESC').all();

    res.json({
      policies: policies.map((p) => ({
        id: p.id,
        name: p.name,
        quorumThreshold: p.quorum_threshold,
        roleWeights: JSON.parse(p.role_weights),
        expiryMinutes: p.expiry_minutes,
        fallbackConfig: JSON.parse(p.fallback_config),
        escalationPolicy: p.escalation_policy,
        createdAt: p.created_at,
      })),
    });
  } catch (err) {
    console.error('[policies/list]', err);
    res.status(500).json({ error: 'internal', message: 'Failed to list policies.' });
  }
});

/**
 * POST /api/policies
 * Create a new approval policy. Admin only.
 */
router.post('/', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const { name, quorumThreshold, roleWeights, expiryMinutes, fallbackConfig, escalationPolicy } = req.body;

    if (!name || !quorumThreshold) {
      return res.status(400).json({
        error: 'validation',
        message: 'name and quorumThreshold are required.',
      });
    }

    const db = getDb();
    const id = uuidv4();

    db.prepare(`
      INSERT INTO approval_policies (id, name, quorum_threshold, role_weights, expiry_minutes, fallback_config, escalation_policy)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, name, quorumThreshold,
      JSON.stringify(roleWeights || { admin: 3, senior: 2, member: 1 }),
      expiryMinutes || 60,
      JSON.stringify(fallbackConfig || {}),
      escalationPolicy || 'delegate'
    );

    appendAuditLog('policy_created', req.user.id, { policyId: id, name, threshold: quorumThreshold });

    res.status(201).json({
      id,
      name,
      quorumThreshold,
      roleWeights: roleWeights || { admin: 3, senior: 2, member: 1 },
      expiryMinutes: expiryMinutes || 60,
      escalationPolicy: escalationPolicy || 'delegate',
    });
  } catch (err) {
    console.error('[policies/create]', err);
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'conflict', message: 'A policy with this name already exists.' });
    }
    res.status(500).json({ error: 'internal', message: 'Failed to create policy.' });
  }
});

export default router;
