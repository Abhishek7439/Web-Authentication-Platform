import { encrypt, decrypt, randomToken } from '../utils/crypto.js';
import { getDb } from '../db/index.js';
import { v4 as uuidv4 } from 'uuid';

const MAGIC_LINK_TTL_MINUTES = 15;

/**
 * Generate a magic link token and store it encrypted.
 * Returns { token, link, expiresAt }.
 */
export function generateMagicLink(userId, baseOrigin) {
  const db = getDb();
  const token = randomToken(32);

  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MINUTES * 60 * 1000).toISOString();
  const credId = uuidv4();

  const credentialData = JSON.stringify({
    token: encrypt(token),
    expiresAt,
    consumed: false,
  });

  db.prepare(`
    INSERT INTO credentials (id, user_id, type, credential_data, is_backup)
    VALUES (?, ?, 'magic_link', ?, 0)
  `).run(credId, userId, credentialData);

  const link = `${baseOrigin}/#/magic-link/${token}`;

  return { token, link, expiresAt };
}

/**
 * Consume a magic link token.
 * Returns the userId if valid, throws if invalid/expired/consumed.
 */
export function consumeMagicLink(token) {
  const db = getDb();

  const creds = db.prepare(`
    SELECT c.*, u.id as uid
    FROM credentials c
    JOIN users u ON c.user_id = u.id
    WHERE c.type = 'magic_link' AND c.revoked_at IS NULL
    ORDER BY c.created_at DESC
    LIMIT 100
  `).all();

  for (const cred of creds) {
    try {
      const data = JSON.parse(cred.credential_data);
      const decryptedToken = decrypt(data.token);

      if (decryptedToken === token) {
        if (data.consumed) {
          throw new Error('Magic link has already been used.');
        }
        if (new Date(data.expiresAt) < new Date()) {
          throw new Error('Magic link has expired.');
        }

        // Mark as consumed
        const updated = { ...data, consumed: true };
        db.prepare('UPDATE credentials SET credential_data = ? WHERE id = ?')
          .run(JSON.stringify(updated), cred.id);

        return cred.uid;
      }
    } catch (e) {
      if (e.message.includes('already been used') || e.message.includes('expired')) {
        throw e;
      }
      continue; // Skip invalid decryption (different token)
    }
  }

  throw new Error('Magic link is invalid or not found.');
}
