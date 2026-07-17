import * as OTPAuth from 'otpauth';
import { encrypt, decrypt } from '../utils/crypto.js';
import { getDb } from '../db/index.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Generate a new TOTP secret for a user and store it encrypted.
 * Returns { uri, secret } — URI is for QR code, secret is for manual entry.
 */
export function setupTotp(userId, email) {
  const db = getDb();

  // Revoke any existing TOTP credentials
  db.prepare(`
    UPDATE credentials SET revoked_at = datetime('now')
    WHERE user_id = ? AND type = 'totp' AND revoked_at IS NULL
  `).run(userId);

  const totp = new OTPAuth.TOTP({
    issuer: 'Commander Auth',
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: new OTPAuth.Secret({ size: 20 }),
  });

  const credId = uuidv4();
  const credentialData = JSON.stringify({
    secret: encrypt(totp.secret.base32),
    uri: totp.toString(),
  });

  db.prepare(`
    INSERT INTO credentials (id, user_id, type, credential_data, is_backup)
    VALUES (?, ?, 'totp', ?, 0)
  `).run(credId, userId, credentialData);

  return {
    credId,
    uri: totp.toString(),
    secret: totp.secret.base32, // returned once for QR setup
  };
}

/**
 * Validate a TOTP code against a user's stored secret.
 * Returns true if valid (window ±1 = 90 seconds grace).
 */
export function verifyTotp(userId, code) {
  const db = getDb();

  const cred = db.prepare(`
    SELECT * FROM credentials
    WHERE user_id = ? AND type = 'totp' AND revoked_at IS NULL
    ORDER BY created_at DESC LIMIT 1
  `).get(userId);

  if (!cred) {
    throw new Error('No TOTP credential found for this user.');
  }

  const data = JSON.parse(cred.credential_data);
  const secretBase32 = decrypt(data.secret);

  const totp = new OTPAuth.TOTP({
    issuer: 'Commander Auth',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });

  const delta = totp.validate({ token: code, window: 1 });

  if (delta === null) {
    return false;
  }

  // Update last_used
  db.prepare('UPDATE credentials SET last_used = datetime(\'now\') WHERE id = ?').run(cred.id);

  return true;
}

/**
 * Get the TOTP URI for a user (for re-displaying QR code during setup).
 */
export function getTotpUri(userId) {
  const db = getDb();

  const cred = db.prepare(`
    SELECT credential_data FROM credentials
    WHERE user_id = ? AND type = 'totp' AND revoked_at IS NULL
    ORDER BY created_at DESC LIMIT 1
  `).get(userId);

  if (!cred) return null;

  const data = JSON.parse(cred.credential_data);
  return data.uri;
}
