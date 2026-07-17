import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { idempotency } from '../middleware/idempotency.js';
import {
  createApprovalRequest,
  submitVote,
  getApprovalRequest,
  getPendingApprovals,
  getAllApprovals,
} from '../approvals/engine.js';
import { generateVoteChallenge, verifyVoteSignature, verifyStoredVote } from '../approvals/signing.js';

const router = Router();

/**
 * POST /api/approvals
 * Create a new approval request. Idempotency-Key supported.
 */
router.post('/', requireAuth, idempotency, (req, res) => {
  try {
    const { policyName, actionType, actionPayload } = req.body;

    if (!policyName || !actionType) {
      return res.status(400).json({
        error: 'validation',
        message: 'policyName and actionType are required.',
      });
    }

    const result = createApprovalRequest({
      policyName,
      actionType,
      actionPayload: actionPayload || {},
      requesterId: req.user.id,
    });

    res.status(201).json(result);
  } catch (err) {
    console.error('[approvals/create]', err);
    const status = err.message.includes('not found') ? 404 : 400;
    res.status(status).json({ error: 'request_failed', message: err.message });
  }
});

/**
 * GET /api/approvals/pending
 * List pending approvals for the current user.
 */
router.get('/pending', requireAuth, (req, res) => {
  try {
    const pending = getPendingApprovals(req.user.id);
    res.json({ approvals: pending });
  } catch (err) {
    console.error('[approvals/pending]', err);
    res.status(500).json({ error: 'internal', message: 'Failed to fetch pending approvals.' });
  }
});

/**
 * GET /api/approvals/all
 * List all approval requests (paginated).
 */
router.get('/all', requireAuth, (req, res) => {
  try {
    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '20', 10);
    const result = getAllApprovals(page, limit);
    res.json(result);
  } catch (err) {
    console.error('[approvals/all]', err);
    res.status(500).json({ error: 'internal', message: 'Failed to fetch approvals.' });
  }
});

/**
 * GET /api/approvals/:id
 * Get a specific approval request with full details.
 */
router.get('/:id', requireAuth, (req, res) => {
  try {
    const approval = getApprovalRequest(req.params.id);
    if (!approval) {
      return res.status(404).json({ error: 'not_found', message: 'Approval request not found.' });
    }
    res.json(approval);
  } catch (err) {
    console.error('[approvals/get]', err);
    res.status(500).json({ error: 'internal', message: 'Failed to fetch approval.' });
  }
});

/**
 * POST /api/approvals/:id/vote/challenge
 * Generate a cryptographic challenge for voting.
 */
router.post('/:id/vote/challenge', requireAuth, (req, res) => {
  try {
    const { decision } = req.body;
    if (!decision || !['approve', 'deny'].includes(decision)) {
      return res.status(400).json({ error: 'validation', message: 'Invalid decision.' });
    }

    const request = getApprovalRequest(req.params.id);
    if (!request) {
      return res.status(404).json({ error: 'not_found', message: 'Approval request not found.' });
    }

    const result = generateVoteChallenge(request.id, request.actionHash, decision, req.user.id);
    res.json(result);
  } catch (err) {
    console.error('[approvals/vote/challenge]', err);
    res.status(500).json({ error: 'internal', message: 'Failed to generate challenge.' });
  }
});

/**
 * POST /api/approvals/:id/vote
 * Submit a vote on an approval request. Idempotency-Key supported.
 */
router.post('/:id/vote', requireAuth, idempotency, async (req, res) => {
  try {
    const { decision, assertion } = req.body;
    const requestId = req.params.id;

    if (!decision || !['approve', 'deny'].includes(decision)) {
      return res.status(400).json({
        error: 'validation',
        message: 'decision must be "approve" or "deny".',
      });
    }

    const request = getApprovalRequest(requestId);
    if (!request) {
      return res.status(404).json({ error: 'not_found', message: 'Approval request not found.' });
    }

    let signatureToStore = 'unsigned';
    
    // Mandatory signing for sensitive policies
    const isSensitivePolicy = ['high-value-transaction', 'production-deploy'].includes(request.policyName);
    
    if (isSensitivePolicy && !assertion) {
      return res.status(403).json({
        error: 'signature_required',
        message: 'This policy requires a cryptographically signed vote (WebAuthn passkey). Unsigned votes are forbidden.',
      });
    }

    if (assertion) {
      const verification = await verifyVoteSignature(requestId, req.user.id, assertion);
      if (verification.verified) {
        signatureToStore = verification.signatureData;
      }
    }

    const result = submitVote({
      requestId,
      approverId: req.user.id,
      decision,
      signature: signatureToStore,
      signedPayload: null,
    });

    res.json(result);
  } catch (err) {
    console.error('[approvals/vote]', err);
    const status = err.message.includes('not found') ? 404
      : err.message.includes('already') ? 409
      : err.message.includes('signature') ? 403
      : 400;
    res.status(status).json({ error: 'vote_failed', message: err.message });
  }
});

/**
 * GET /api/approvals/:id/votes/:voteId/verify
 * Independently verify a stored vote's signature.
 */
router.get('/:id/votes/:voteId/verify', requireAuth, async (req, res) => {
  try {
    const result = await verifyStoredVote(req.params.voteId);
    res.json(result);
  } catch (err) {
    console.error('[approvals/verify]', err);
    res.status(500).json({ error: 'internal', message: 'Verification failed.' });
  }
});

export default router;
