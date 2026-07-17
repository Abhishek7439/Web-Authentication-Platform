import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypt plaintext using AES-256-GCM.
 * Returns "iv:ciphertext:authTag" as a single hex-encoded string.
 */
export function encrypt(plaintext) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${encrypted}:${authTag}`;
}

/**
 * Decrypt a string produced by encrypt().
 * Throws if tampered (GCM auth tag validation fails).
 */
export function decrypt(encryptedString) {
  const key = getEncryptionKey();
  const [ivHex, ciphertext, authTagHex] = encryptedString.split(':');

  if (!ivHex || !ciphertext || !authTagHex) {
    throw new Error('Invalid encrypted string format');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * HMAC-SHA256 sign a payload string.
 */
export function hmacSign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Constant-time HMAC verification.
 */
export function hmacVerify(payload, signature, secret) {
  const expected = hmacSign(payload, secret);
  const sigBuf = Buffer.from(signature, 'hex');
  const expBuf = Buffer.from(expected, 'hex');

  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

/**
 * Generate a SHA-256 hash of the input string.
 */
export function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Generate a cryptographically secure random string.
 */
export function randomToken(byteLength = 32) {
  return crypto.randomBytes(byteLength).toString('hex');
}

function getEncryptionKey() {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be exactly 32 bytes (64 hex chars)');
  }
  return key;
}
