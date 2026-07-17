import { describe, it, expect } from 'vitest';
import { evaluateQuorum } from '../server/approvals/engine.js';
import { getDb, closeDb } from '../server/db/index.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Helper to set up a minimal test scenario:
 * one policy + one approval request with given votes.
 */
function setupQuorumTest({ threshold, roleWeights, votes }) {
  const db = getDb();

  // Clean tables
  db.exec('DELETE FROM approval_votes; DELETE FROM approval_requests; DELETE FROM approval_policies; DELETE FROM users;');

  // Create users
  const users = {};
  for (const [name, role] of Object.entries({ requester: 'member', senior: 'senior', member1: 'member', member2: 'member', admin: 'admin' })) {
    const id = uuidv4();
    db.prepare('INSERT INTO users (id, email, display_name, role) VALUES (?, ?, ?, ?)')
      .run(id, `${name}@test.local`, name, role);
    users[name] = id;
  }

  // Create policy
  const policyId = uuidv4();
  db.prepare(`
    INSERT INTO approval_policies (id, name, quorum_threshold, role_weights, expiry_minutes, fallback_config, escalation_policy)
    VALUES (?, 'test-policy', ?, ?, 60, '{}', 'delegate')
  `).run(policyId, threshold, JSON.stringify(roleWeights));

  // Create request
  const requestId = uuidv4();
  db.prepare(`
    INSERT INTO approval_requests (id, policy_id, action_type, action_hash, requester_id, status, expires_at)
    VALUES (?, ?, 'test', 'hash', ?, 'pending', datetime('now', '+1 hour'))
  `).run(requestId, policyId, users.requester);

  // Insert votes
  for (const vote of votes) {
    db.prepare(`
      INSERT INTO approval_votes (id, request_id, approver_id, decision, timestamp)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(uuidv4(), requestId, users[vote.voter], vote.decision);
  }

  return { requestId, users };
}

// Use in-memory DB
import { vi } from 'vitest';
process.env.DB_PATH = ':memory:';
closeDb();
getDb();

describe('Quorum Evaluation — weighted voting', () => {
  it('should approve when single senior vote meets threshold', () => {
    const { requestId } = setupQuorumTest({
      threshold: 2,
      roleWeights: { admin: 3, senior: 2, member: 1 },
      votes: [{ voter: 'senior', decision: 'approve' }],
    });

    const result = evaluateQuorum(requestId);
    expect(result.approveTally).toBe(2);
    expect(result.status).toBe('approved');
  });

  it('should stay pending when tally is below threshold', () => {
    const { requestId } = setupQuorumTest({
      threshold: 3,
      roleWeights: { admin: 3, senior: 2, member: 1 },
      votes: [{ voter: 'member1', decision: 'approve' }],
    });

    const result = evaluateQuorum(requestId);
    expect(result.approveTally).toBe(1);
    expect(result.status).toBe('pending');
    expect(result.remainingToApprove).toBe(2);
  });

  it('should approve when combined member votes meet threshold', () => {
    const { requestId } = setupQuorumTest({
      threshold: 2,
      roleWeights: { admin: 3, senior: 2, member: 1 },
      votes: [
        { voter: 'member1', decision: 'approve' },
        { voter: 'member2', decision: 'approve' },
      ],
    });

    const result = evaluateQuorum(requestId);
    expect(result.approveTally).toBe(2);
    expect(result.status).toBe('approved');
  });

  it('should deny when deny tally reaches threshold', () => {
    const { requestId } = setupQuorumTest({
      threshold: 2,
      roleWeights: { admin: 3, senior: 2, member: 1 },
      votes: [{ voter: 'senior', decision: 'deny' }],
    });

    const result = evaluateQuorum(requestId);
    expect(result.denyTally).toBe(2);
    expect(result.status).toBe('denied');
  });

  it('should apply admin weight correctly', () => {
    const { requestId } = setupQuorumTest({
      threshold: 3,
      roleWeights: { admin: 3, senior: 2, member: 1 },
      votes: [{ voter: 'admin', decision: 'approve' }],
    });

    const result = evaluateQuorum(requestId);
    expect(result.approveTally).toBe(3);
    expect(result.status).toBe('approved');
  });

  it('should not approve when approve and deny partially cancel', () => {
    const { requestId } = setupQuorumTest({
      threshold: 3,
      roleWeights: { admin: 3, senior: 2, member: 1 },
      votes: [
        { voter: 'member1', decision: 'approve' },
        { voter: 'member2', decision: 'deny' },
      ],
    });

    const result = evaluateQuorum(requestId);
    expect(result.approveTally).toBe(1);
    expect(result.denyTally).toBe(1);
    expect(result.status).toBe('pending');
  });
});
