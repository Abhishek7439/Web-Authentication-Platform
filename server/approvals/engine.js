import { getDb } from '../db/index.js';
import { v4 as uuidv4 } from 'uuid';
import { appendAuditLog } from '../audit/index.js';
import { notifyNewApprovalRequest, notifyVoteSubmitted, notifyApprovalResolved } from '../realtime/index.js';

/**
 * Create a new approval request.
 */
export function createApprovalRequest({ policyName, actionType, actionPayload, requesterId }) {
  const db = getDb();

  // Look up policy
  const policy = db.prepare('SELECT * FROM approval_policies WHERE name = ?').get(policyName);
  if (!policy) {
    throw new Error(`Policy "${policyName}" not found.`);
  }

  // Requester cannot approve their own request
  const requester = db.prepare('SELECT * FROM users WHERE id = ?').get(requesterId);
  if (!requester) {
    throw new Error('Requester not found.');
  }

  const actionHash = JSON.stringify({ actionType, ...actionPayload });
  const requestId = uuidv4();
  const expiresAt = new Date(Date.now() + policy.expiry_minutes * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO approval_requests (id, policy_id, action_type, action_hash, requester_id, status, expires_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?)
  `).run(requestId, policy.id, actionType, actionHash, requesterId, expiresAt);

  // Audit log
  appendAuditLog('approval_requested', requesterId, {
    requestId,
    actionType,
    policy: policyName,
    threshold: policy.quorum_threshold,
  });

  const result = {
    id: requestId,
    policyId: policy.id,
    policyName: policy.name,
    actionType,
    status: 'pending',
    requester: { id: requester.id, email: requester.email, displayName: requester.display_name },
    quorumThreshold: policy.quorum_threshold,
    roleWeights: JSON.parse(policy.role_weights),
    currentTally: 0,
    votes: [],
    expiresAt,
    createdAt: new Date().toISOString(),
  };

  // Real-time: notify all approvers
  notifyNewApprovalRequest(result);

  return result;
}

/**
 * Submit a vote on an approval request (unsigned for Phase 2, signed in Phase 3).
 */
export function submitVote({ requestId, approverId, decision, signature = null, signedPayload = null }) {
  const db = getDb();

  // Validate request exists and is pending
  const request = db.prepare('SELECT * FROM approval_requests WHERE id = ?').get(requestId);
  if (!request) {
    throw new Error('Approval request not found.');
  }
  if (request.status !== 'pending') {
    throw new Error(`Request is already ${request.status}.`);
  }

  // Check expiry
  if (new Date(request.expires_at) < new Date()) {
    db.prepare("UPDATE approval_requests SET status = 'expired' WHERE id = ?").run(requestId);
    appendAuditLog('approval_expired', null, { requestId });
    throw new Error('Approval request has expired.');
  }

  // Cannot approve own request
  if (request.requester_id === approverId) {
    throw new Error('Cannot vote on your own request.');
  }

  // Check if already voted
  const existingVote = db.prepare(
    'SELECT * FROM approval_votes WHERE request_id = ? AND approver_id = ?'
  ).get(requestId, approverId);
  if (existingVote) {
    throw new Error('You have already voted on this request.');
  }

  // Validate approver exists
  const approver = db.prepare('SELECT * FROM users WHERE id = ?').get(approverId);
  if (!approver) {
    throw new Error('Approver not found.');
  }

  // Insert vote
  const voteId = uuidv4();
  db.prepare(`
    INSERT INTO approval_votes (id, request_id, approver_id, decision, signature, signed_payload)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    voteId, requestId, approverId, decision,
    signature, signedPayload ? JSON.stringify(signedPayload) : null
  );

  // Audit log
  appendAuditLog('vote_submitted', approverId, {
    requestId,
    voteId,
    decision,
    signed: !!signature,
  });

  // Evaluate quorum
  const result = evaluateQuorum(requestId);

  const voteResult = {
    voteId,
    decision,
    approver: { id: approver.id, email: approver.email, displayName: approver.display_name, role: approver.role },
    quorumResult: result,
  };

  // Real-time: notify all connected users of the new vote + tally
  notifyVoteSubmitted(requestId, voteResult);

  return voteResult;
}

/**
 * Evaluate whether the quorum threshold has been met.
 * Uses role-weighted voting: each approver's vote weight depends on their role.
 */
export function evaluateQuorum(requestId) {
  const db = getDb();

  const request = db.prepare('SELECT * FROM approval_requests WHERE id = ?').get(requestId);
  if (!request) {
    throw new Error('Approval request not found.');
  }

  const policy = db.prepare('SELECT * FROM approval_policies WHERE id = ?').get(request.policy_id);
  const roleWeights = JSON.parse(policy.role_weights);

  // Get all votes for this request
  const votes = db.prepare(`
    SELECT v.*, u.role, u.display_name, u.email
    FROM approval_votes v
    JOIN users u ON v.approver_id = u.id
    WHERE v.request_id = ?
  `).all(requestId);

  // Calculate weighted tally
  let approveTally = 0;
  let denyTally = 0;
  const voteDetails = [];

  for (const vote of votes) {
    const weight = roleWeights[vote.role] || 1;
    if (vote.decision === 'approve') {
      approveTally += weight;
    } else {
      denyTally += weight;
    }
    voteDetails.push({
      approver: { id: vote.approver_id, email: vote.email, displayName: vote.display_name, role: vote.role },
      decision: vote.decision,
      weight,
      signed: !!vote.signature,
      timestamp: vote.timestamp,
    });
  }

  const threshold = policy.quorum_threshold;
  let newStatus = request.status;

  // Check if quorum is met
  if (approveTally >= threshold) {
    newStatus = 'approved';
    db.prepare("UPDATE approval_requests SET status = 'approved' WHERE id = ?").run(requestId);
    appendAuditLog('approval_approved', null, {
      requestId,
      tally: approveTally,
      threshold,
      votes: votes.length,
    });
    notifyApprovalResolved(requestId, 'approved', request.action_type);
  } else if (denyTally >= threshold) {
    newStatus = 'denied';
    db.prepare("UPDATE approval_requests SET status = 'denied' WHERE id = ?").run(requestId);
    appendAuditLog('approval_denied', null, {
      requestId,
      denyTally,
      threshold,
    });
    notifyApprovalResolved(requestId, 'denied', request.action_type);
  }

  return {
    status: newStatus,
    approveTally,
    denyTally,
    threshold,
    remainingToApprove: Math.max(0, threshold - approveTally),
    votes: voteDetails,
  };
}

/**
 * Get a full approval request with all details.
 */
export function getApprovalRequest(requestId) {
  const db = getDb();

  const request = db.prepare(`
    SELECT ar.*, ap.name as policy_name, ap.quorum_threshold, ap.role_weights,
           ap.expiry_minutes, ap.escalation_policy, ap.step_up_freshness_minutes,
           u.email as requester_email, u.display_name as requester_name
    FROM approval_requests ar
    JOIN approval_policies ap ON ar.policy_id = ap.id
    JOIN users u ON ar.requester_id = u.id
    WHERE ar.id = ?
  `).get(requestId);

  if (!request) return null;

  const votes = db.prepare(`
    SELECT v.*, u.role, u.display_name, u.email
    FROM approval_votes v
    JOIN users u ON v.approver_id = u.id
    WHERE v.request_id = ?
    ORDER BY v.timestamp ASC
  `).all(requestId);

  const roleWeights = JSON.parse(request.role_weights);
  let approveTally = 0;
  let denyTally = 0;

  const voteDetails = votes.map((v) => {
    const weight = roleWeights[v.role] || 1;
    if (v.decision === 'approve') approveTally += weight;
    else denyTally += weight;
    return {
      id: v.id,
      approver: { id: v.approver_id, email: v.email, displayName: v.display_name, role: v.role },
      decision: v.decision,
      weight,
      signed: !!v.signature,
      timestamp: v.timestamp,
    };
  });

  return {
    id: request.id,
    policyName: request.policy_name,
    step_up_freshness_minutes: request.step_up_freshness_minutes,
    actionType: request.action_type,
    actionHash: request.action_hash,
    status: request.status,
    requester: {
      id: request.requester_id,
      email: request.requester_email,
      displayName: request.requester_name,
    },
    quorum: {
      threshold: request.quorum_threshold,
      approveTally,
      denyTally,
      remainingToApprove: Math.max(0, request.quorum_threshold - approveTally),
      roleWeights,
    },
    escalationPolicy: request.escalation_policy,
    votes: voteDetails,
    createdAt: request.created_at,
    expiresAt: request.expires_at,
  };
}

/**
 * List pending approval requests for a given approver.
 */
export function getPendingApprovals(approverId) {
  const db = getDb();

  // Get all pending requests where this user hasn't voted yet
  const requests = db.prepare(`
    SELECT ar.*, ap.name as policy_name, ap.quorum_threshold, ap.role_weights,
           u.email as requester_email, u.display_name as requester_name
    FROM approval_requests ar
    JOIN approval_policies ap ON ar.policy_id = ap.id
    JOIN users u ON ar.requester_id = u.id
    WHERE ar.status = 'pending'
      AND ar.requester_id != ?
      AND ar.id NOT IN (
        SELECT request_id FROM approval_votes WHERE approver_id = ?
      )
    ORDER BY ar.created_at DESC
  `).all(approverId, approverId);

  return requests.map((r) => ({
    id: r.id,
    policyName: r.policy_name,
    actionType: r.action_type,
    status: r.status,
    requester: { email: r.requester_email, displayName: r.requester_name },
    quorumThreshold: r.quorum_threshold,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
  }));
}

/**
 * List all approval requests (for admin/dashboard view).
 */
export function getAllApprovals(page = 1, limit = 20) {
  const db = getDb();
  const offset = (page - 1) * limit;

  const requests = db.prepare(`
    SELECT ar.*, ap.name as policy_name, ap.quorum_threshold,
           u.email as requester_email, u.display_name as requester_name
    FROM approval_requests ar
    JOIN approval_policies ap ON ar.policy_id = ap.id
    JOIN users u ON ar.requester_id = u.id
    ORDER BY ar.created_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);

  const total = db.prepare('SELECT COUNT(*) as count FROM approval_requests').get().count;

  return {
    requests: requests.map((r) => ({
      id: r.id,
      policyName: r.policy_name,
      actionType: r.action_type,
      status: r.status,
      requester: { email: r.requester_email, displayName: r.requester_name },
      quorumThreshold: r.quorum_threshold,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}
