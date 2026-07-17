import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { appendAuditLog, verifyChainIntegrity, getAuditLog } from '../server/audit/index.js';
import { getDb, closeDb } from '../server/db/index.js';
import { initializeSchema } from '../server/db/schema.js';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

// Use an in-memory DB for tests
const TEST_DB_PATH = ':memory:';

let originalEnv;

beforeEach(() => {
  originalEnv = process.env.DB_PATH;
  process.env.DB_PATH = TEST_DB_PATH;
  // Reset the singleton so it picks up the test DB
  closeDb();
  getDb(); // Re-init with in-memory
});

afterEach(() => {
  process.env.DB_PATH = originalEnv;
  closeDb();
});

describe('Audit Chain — append and verify', () => {
  it('should verify an empty chain as valid', () => {
    const result = verifyChainIntegrity();
    expect(result.valid).toBe(true);
    expect(result.entries).toBe(0);
  });

  it('should append a single entry and verify', () => {
    appendAuditLog('test_event', 'user-123', { msg: 'hello' });
    const result = verifyChainIntegrity();
    expect(result.valid).toBe(true);
    expect(result.entries).toBe(1);
  });

  it('should build a valid multi-entry chain', () => {
    appendAuditLog('event_a', 'user-1', { x: 1 });
    appendAuditLog('event_b', 'user-2', { x: 2 });
    appendAuditLog('event_c', 'user-3', { x: 3 });

    const result = verifyChainIntegrity();
    expect(result.valid).toBe(true);
    expect(result.entries).toBe(3);
    expect(result.brokenAt).toBeNull();
  });

  it('should detect chain break when entry is tampered', () => {
    appendAuditLog('event_a', 'user-1', { x: 1 });
    appendAuditLog('event_b', 'user-2', { x: 2 });
    appendAuditLog('event_c', 'user-3', { x: 3 });

    // Tamper with entry 2
    const db = getDb();
    db.prepare("UPDATE audit_log SET payload = ? WHERE id = 2")
      .run(JSON.stringify({ x: 999, TAMPERED: true }));

    const result = verifyChainIntegrity();
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(2);
  });

  it('should detect chain break when prev_hash is manipulated', () => {
    appendAuditLog('event_a', 'user-1', {});
    appendAuditLog('event_b', 'user-2', {});

    const db = getDb();
    db.prepare("UPDATE audit_log SET prev_hash = ? WHERE id = 2")
      .run('0000000000000000000000000000000000000000000000000000000000000000');

    const result = verifyChainIntegrity();
    expect(result.valid).toBe(false);
  });

  it('each entry should have a unique hash', () => {
    appendAuditLog('event_a', 'user-1', { a: 1 });
    appendAuditLog('event_b', 'user-2', { b: 2 });
    appendAuditLog('event_c', 'user-3', { c: 3 });

    const db = getDb();
    const entries = db.prepare('SELECT entry_hash FROM audit_log').all();
    const hashes = entries.map(e => e.entry_hash);
    const uniqueHashes = new Set(hashes);
    expect(uniqueHashes.size).toBe(hashes.length);
  });
});

describe('Audit Chain — pagination', () => {
  it('should return paginated results', () => {
    for (let i = 0; i < 10; i++) {
      appendAuditLog(`event_${i}`, 'user-1', { i });
    }

    const page1 = getAuditLog(1, 5);
    expect(page1.entries.length).toBe(5);
    expect(page1.total).toBe(10);
    expect(page1.totalPages).toBe(2);

    const page2 = getAuditLog(2, 5);
    expect(page2.entries.length).toBe(5);
  });
});
