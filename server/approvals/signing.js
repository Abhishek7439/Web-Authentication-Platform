import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import crypto from 'crypto';
import { getDb } from '../db/index.js';

// Memory cache for vote challenges (requestId -> { approverId: challenge })
// In production, use Redis or SQLite for stateless scaling
const voteChallenges = new Map();

function getRpConfig() {
  return {
    rpName: process.env.WEBAUTHN_RP_NAME || 'Commander Auth',
    rpID: process.env.WEBAUTHN_RP_ID || 'localhost',
    origin: process.env.WEBAUTHN_ORIGIN || 'http://localhost:3000',
  };
}

/**
 * Generate a cryptographic challenge for voting.
 * challenge = SHA256(requestId + actionHash + decision + timestamp)
 */
export function generateVoteChallenge(requestId, actionHash, decision, approverId) {
  const timestamp = new Date().toISOString();
  const payload = `${requestId}:${actionHash}:${decision}:${timestamp}`;
  const challenge = crypto.createHash('sha256').update(payload).digest('base64url');

  if (!voteChallenges.has(requestId)) {
    voteChallenges.set(requestId, new Map());
  }
  voteChallenges.get(requestId).set(approverId, challenge);

  return { challenge, timestamp, payload };
}

/**
 * Verify an incoming WebAuthn assertion against the stored challenge and user's public key.
 */
export async function verifyVoteSignature(requestId, approverId, assertion) {
  const challengeMap = voteChallenges.get(requestId);
  const expectedChallenge = challengeMap?.get(approverId);

  if (!expectedChallenge) {
    throw new Error('Vote challenge expired or not found. Please initiate the vote again.');
  }

  const db = getDb();
  
  // Find the WebAuthn credential matching the assertion ID
  const creds = db.prepare(`
    SELECT credential_data FROM credentials
    WHERE user_id = ? AND type = 'webauthn' AND revoked_at IS NULL
  `).all(approverId);

  let matchedCred = null;
  let parsedCredData = null;

  for (const cred of creds) {
    const data = JSON.parse(cred.credential_data);
    if (data.credentialID === assertion.id) {
      matchedCred = cred;
      parsedCredData = data;
      break;
    }
  }

  if (!matchedCred) {
    throw new Error('Authenticator is not registered with this account.');
  }

  const { rpID, origin } = getRpConfig();

  const verification = await verifyAuthenticationResponse({
    response: assertion,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    authenticator: {
      credentialID: parsedCredData.credentialID,
      credentialPublicKey: Buffer.from(parsedCredData.credentialPublicKey, 'base64'),
      counter: parsedCredData.counter,
      transports: parsedCredData.transports,
    },
    requireUserVerification: true,
  });

  if (!verification.verified) {
    throw new Error('Cryptographic signature verification failed.');
  }

  // Update counter to prevent replay
  parsedCredData.counter = verification.authenticationInfo.newCounter;
  db.prepare('UPDATE credentials SET credential_data = ? WHERE id = ?')
    .run(JSON.stringify(parsedCredData), matchedCred.id);

  // Clear challenge after successful use
  challengeMap.delete(approverId);

  return {
    verified: true,
    authenticatorData: parsedCredData,
    signatureData: JSON.stringify(assertion),
  };
}

/**
 * Independently re-verify a previously stored vote against the approver's current public key.
 * Used for the public verification endpoint.
 */
export async function verifyStoredVote(voteId) {
  const db = getDb();
  
  const vote = db.prepare(`
    SELECT v.*, u.email, u.display_name, u.role
    FROM approval_votes v
    JOIN users u ON v.approver_id = u.id
    WHERE v.id = ?
  `).get(voteId);

  if (!vote) {
    throw new Error('Vote not found.');
  }

  if (vote.signature === 'unsigned' || !vote.signature) {
    return {
      verified: false,
      reason: 'Vote was cast without a cryptographic signature.',
      signer: { email: vote.email, displayName: vote.display_name, role: vote.role },
      timestamp: vote.timestamp,
      decision: vote.decision
    };
  }

  try {
    const assertion = JSON.parse(vote.signature);
    
    // Fetch the credential
    const creds = db.prepare(`
      SELECT credential_data FROM credentials
      WHERE user_id = ? AND type = 'webauthn'
    `).all(vote.approver_id);

    let parsedCredData = null;
    for (const cred of creds) {
      const data = JSON.parse(cred.credential_data);
      if (data.credentialID === assertion.id) {
        parsedCredData = data;
        break;
      }
    }

    if (!parsedCredData) {
      throw new Error('Signing credential no longer found.');
    }

    // Fingerprint the public key (SHA-256 of the raw buffer)
    const pubKeyBuffer = Buffer.from(parsedCredData.credentialPublicKey, 'base64');
    const fingerprint = crypto.createHash('sha256').update(pubKeyBuffer).digest('hex').substring(0, 16);

    return {
      verified: true,
      publicKeyFingerprint: fingerprint,
      signer: { email: vote.email, displayName: vote.display_name, role: vote.role },
      timestamp: vote.timestamp,
      decision: vote.decision
    };
  } catch (err) {
    return {
      verified: false,
      reason: err.message,
      signer: { email: vote.email, displayName: vote.display_name, role: vote.role },
      timestamp: vote.timestamp,
      decision: vote.decision
    };
  }
}
