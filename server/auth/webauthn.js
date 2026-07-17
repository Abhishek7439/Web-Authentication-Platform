import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { getDb } from '../db/index.js';
import { v4 as uuidv4 } from 'uuid';

// In-memory challenge store (per-session, short-lived)
// In production, use Redis or DB — fine for hackathon scope
const challengeStore = new Map();

function getRpConfig() {
  return {
    rpName: process.env.WEBAUTHN_RP_NAME || 'Commander Auth',
    rpID: process.env.WEBAUTHN_RP_ID || 'localhost',
    origin: process.env.WEBAUTHN_ORIGIN || 'http://localhost:5173',
  };
}

/**
 * Generate WebAuthn registration options for a user.
 */
export async function getRegistrationOptions(user) {
  const db = getDb();
  const { rpName, rpID } = getRpConfig();

  // Get existing credentials for this user to exclude
  const existingCreds = db.prepare(`
    SELECT credential_data FROM credentials
    WHERE user_id = ? AND type = 'webauthn' AND revoked_at IS NULL
  `).all(user.id);

  const excludeCredentials = existingCreds.map((cred) => {
    const data = JSON.parse(cred.credential_data);
    return {
      id: data.credentialID,
      type: 'public-key',
    };
  });

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: new TextEncoder().encode(user.id),
    userName: user.email,
    userDisplayName: user.display_name,
    attestationType: 'none',
    excludeCredentials,
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });

  // Store challenge for verification
  challengeStore.set(user.id, { challenge: options.challenge, type: 'registration', timestamp: Date.now() });

  // Clean up old challenges (older than 5 minutes)
  for (const [key, val] of challengeStore) {
    if (Date.now() - val.timestamp > 5 * 60 * 1000) {
      challengeStore.delete(key);
    }
  }

  return options;
}

/**
 * Verify a WebAuthn registration response and store the credential.
 */
export async function verifyRegistration(user, response) {
  const { rpID, origin } = getRpConfig();
  const stored = challengeStore.get(user.id);

  if (!stored || stored.type !== 'registration') {
    throw new Error('No registration challenge found. Please restart registration.');
  }

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: stored.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error('WebAuthn registration verification failed.');
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

  // Store credential (public key stays plaintext — it's public by design)
  const db = getDb();
  const credId = uuidv4();
  const credentialData = JSON.stringify({
    credentialID: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString('base64url'),
    counter: credential.counter,
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
  });

  db.prepare(`
    INSERT INTO credentials (id, user_id, type, credential_data, is_backup)
    VALUES (?, ?, 'webauthn', ?, 0)
  `).run(credId, user.id, credentialData);

  challengeStore.delete(user.id);

  return { verified: true, credentialId: credId };
}

/**
 * Generate WebAuthn authentication options for a user.
 */
export async function getAuthenticationOptions(userEmail) {
  const db = getDb();
  const { rpID } = getRpConfig();

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(userEmail);
  if (!user) {
    // Return options anyway to not leak whether user exists
    // (passkey autofill will handle it)
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: 'preferred',
    });
    challengeStore.set(`anon-${Date.now()}`, { challenge: options.challenge, type: 'authentication', timestamp: Date.now() });
    return options;
  }

  const creds = db.prepare(`
    SELECT credential_data FROM credentials
    WHERE user_id = ? AND type = 'webauthn' AND revoked_at IS NULL
  `).all(user.id);

  const allowCredentials = creds.map((cred) => {
    const data = JSON.parse(cred.credential_data);
    return {
      id: data.credentialID,
      type: 'public-key',
    };
  });

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: allowCredentials.length > 0 ? allowCredentials : undefined,
    userVerification: 'preferred',
  });

  challengeStore.set(user.id, { challenge: options.challenge, type: 'authentication', timestamp: Date.now() });

  return options;
}

/**
 * Verify a WebAuthn authentication response.
 * Returns the authenticated user on success.
 */
export async function verifyAuthentication(response) {
  const db = getDb();
  const { rpID, origin } = getRpConfig();

  // Find the credential by its ID
  const allCreds = db.prepare(`
    SELECT c.*, u.id as uid, u.email, u.display_name, u.role,
           u.recovery_status, u.recovery_elevated_until
    FROM credentials c
    JOIN users u ON c.user_id = u.id
    WHERE c.type = 'webauthn' AND c.revoked_at IS NULL
  `).all();

  let matchedCred = null;
  let matchedUser = null;

  for (const cred of allCreds) {
    const data = JSON.parse(cred.credential_data);
    if (data.credentialID === response.id) {
      matchedCred = { ...cred, parsedData: data };
      matchedUser = {
        id: cred.uid,
        email: cred.email,
        display_name: cred.display_name,
        role: cred.role,
        recovery_status: cred.recovery_status,
        recovery_elevated_until: cred.recovery_elevated_until,
      };
      break;
    }
  }

  if (!matchedCred || !matchedUser) {
    throw new Error('Credential not found.');
  }

  const stored = challengeStore.get(matchedUser.id);
  if (!stored || stored.type !== 'authentication') {
    throw new Error('No authentication challenge found. Please restart login.');
  }

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: stored.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: {
      id: matchedCred.parsedData.credentialID,
      publicKey: Buffer.from(matchedCred.parsedData.publicKey, 'base64url'),
      counter: matchedCred.parsedData.counter,
    },
  });

  if (!verification.verified) {
    throw new Error('WebAuthn authentication verification failed.');
  }

  // Update counter
  const updatedData = { ...matchedCred.parsedData, counter: verification.authenticationInfo.newCounter };
  db.prepare(`
    UPDATE credentials SET credential_data = ?, last_used = datetime('now')
    WHERE id = ?
  `).run(JSON.stringify(updatedData), matchedCred.id);

  challengeStore.delete(matchedUser.id);

  return matchedUser;
}

/**
 * Generate a step-up WebAuthn challenge for approval signing.
 * Returns challenge bound to a specific action.
 */
export async function getStepUpOptions(user, actionPayload) {
  const { rpID } = getRpConfig();
  const db = getDb();

  const creds = db.prepare(`
    SELECT credential_data FROM credentials
    WHERE user_id = ? AND type = 'webauthn' AND revoked_at IS NULL
  `).all(user.id);

  const allowCredentials = creds.map((cred) => {
    const data = JSON.parse(cred.credential_data);
    return { id: data.credentialID, type: 'public-key' };
  });

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: allowCredentials.length > 0 ? allowCredentials : undefined,
    userVerification: 'required',
  });

  challengeStore.set(`stepup-${user.id}`, {
    challenge: options.challenge,
    type: 'step-up',
    actionPayload,
    timestamp: Date.now(),
  });

  return options;
}
