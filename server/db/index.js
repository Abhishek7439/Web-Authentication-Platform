import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { initializeSchema } from './schema.js';

let db = null;

/**
 * Get or create the SQLite database connection singleton.
 */
export function getDb() {
  if (db) return db;

  const dbPath = process.env.DB_PATH || './data/commander.db';
  const dbDir = path.dirname(dbPath);

  // Ensure data directory exists
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(dbPath);

  // Enable WAL mode for concurrent reads
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Run schema migrations
  initializeSchema(db);

  return db;
}

/**
 * Close the database connection (for clean shutdown).
 */
export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
