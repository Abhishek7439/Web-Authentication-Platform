import { getDb } from '../db/index.js';
import { sha256 } from '../utils/crypto.js';

/**
 * Append an entry to the hash-chained audit log.
 * Each entry's hash = SHA-256(prev_hash + payload + timestamp).
 */
export function appendAuditLog(eventType, actorId, payload = {}) {
  const db = getDb();

  // Get the last entry's hash (or genesis hash)
  const lastEntry = db.prepare(
    'SELECT entry_hash FROM audit_log ORDER BY id DESC LIMIT 1'
  ).get();
  const prevHash = lastEntry?.entry_hash || '0'.repeat(64);

  const timestamp = new Date().toISOString();
  const payloadStr = JSON.stringify(payload);
  const entryHash = sha256(prevHash + payloadStr + timestamp);

  db.prepare(`
    INSERT INTO audit_log (prev_hash, entry_hash, event_type, actor_id, payload, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(prevHash, entryHash, eventType, actorId, payloadStr, timestamp);

  return { prevHash, entryHash, eventType, timestamp };
}

/**
 * Verify the integrity of the entire audit chain.
 * Returns { valid: boolean, entries: number, brokenAt: number | null }
 */
export function verifyChainIntegrity() {
  const db = getDb();
  const entries = db.prepare('SELECT * FROM audit_log ORDER BY id ASC').all();

  if (entries.length === 0) {
    return { valid: true, entries: 0, brokenAt: null, details: [] };
  }

  let expectedPrevHash = '0'.repeat(64);
  const details = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const isValid =
      entry.prev_hash === expectedPrevHash &&
      entry.entry_hash === sha256(entry.prev_hash + entry.payload + entry.timestamp);

    details.push({
      id: entry.id,
      eventType: entry.event_type,
      timestamp: entry.timestamp,
      valid: isValid,
      hash: entry.entry_hash.substring(0, 12) + '...',
    });

    if (!isValid) {
      return {
        valid: false,
        entries: entries.length,
        brokenAt: entry.id,
        details,
      };
    }

    expectedPrevHash = entry.entry_hash;
  }

  return { valid: true, entries: entries.length, brokenAt: null, details };
}

/**
 * Get paginated audit log entries (newest first).
 */
export function getAuditLog(page = 1, limit = 50) {
  const db = getDb();
  const offset = (page - 1) * limit;

  const entries = db.prepare(`
    SELECT al.*, u.display_name as actor_name, u.email as actor_email
    FROM audit_log al
    LEFT JOIN users u ON al.actor_id = u.id
    ORDER BY al.id DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);

  const total = db.prepare('SELECT COUNT(*) as count FROM audit_log').get().count;

  return {
    entries: entries.map((e) => ({
      id: e.id,
      prevHash: e.prev_hash,
      entryHash: e.entry_hash,
      eventType: e.event_type,
      actorId: e.actor_id,
      actorName: e.actor_name,
      actorEmail: e.actor_email,
      payload: JSON.parse(e.payload),
      timestamp: e.timestamp,
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}
