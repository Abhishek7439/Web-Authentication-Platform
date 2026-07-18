/**
 * SQLite schema for Commander Auth.
 * All tables created idempotently (IF NOT EXISTS).
 */
export function initializeSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('admin', 'senior', 'member')),
      risk_profile TEXT DEFAULT '{}',
      recovery_status TEXT NOT NULL DEFAULT 'none' CHECK(recovery_status IN ('none', 'pending', 'active')),
      recovery_elevated_until TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS credentials (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      type TEXT NOT NULL CHECK(type IN ('webauthn', 'totp', 'magic_link')),
      credential_data TEXT NOT NULL,
      is_backup INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_used TEXT,
      revoked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      device_fingerprint TEXT,
      ip_address TEXT,
      risk_level TEXT DEFAULT 'low',
      is_step_up INTEGER NOT NULL DEFAULT 0,
      last_verified_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS approval_policies (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      quorum_threshold INTEGER NOT NULL,
      role_weights TEXT NOT NULL DEFAULT '{}',
      expiry_minutes INTEGER NOT NULL DEFAULT 60,
      step_up_freshness_minutes INTEGER NOT NULL DEFAULT 5,
      totp_satisfies_step_up INTEGER NOT NULL DEFAULT 0,
      fallback_config TEXT NOT NULL DEFAULT '{}',
      escalation_policy TEXT NOT NULL DEFAULT 'delegate' CHECK(escalation_policy IN ('delegate', 'lower_threshold', 'admin_override')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS approval_requests (
      id TEXT PRIMARY KEY,
      policy_id TEXT NOT NULL REFERENCES approval_policies(id),
      action_type TEXT NOT NULL,
      action_hash TEXT NOT NULL,
      requester_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'denied', 'expired', 'escalated')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS approval_votes (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL REFERENCES approval_requests(id),
      approver_id TEXT NOT NULL REFERENCES users(id),
      decision TEXT NOT NULL CHECK(decision IN ('approve', 'deny')),
      signature TEXT,
      signed_payload TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(request_id, approver_id)
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prev_hash TEXT,
      entry_hash TEXT NOT NULL,
      event_type TEXT NOT NULL,
      actor_id TEXT,
      payload TEXT NOT NULL DEFAULT '{}',
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tamper_backups (
      audit_id INTEGER PRIMARY KEY,
      original_payload TEXT NOT NULL,
      FOREIGN KEY (audit_id) REFERENCES audit_log(id)
    );

    CREATE TABLE IF NOT EXISTS idempotency_keys (
      key TEXT PRIMARY KEY,
      route TEXT NOT NULL,
      response_status INTEGER NOT NULL,
      response_body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recovery_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      method TEXT NOT NULL CHECK(method IN ('self_serve', 'admin_assisted')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'completed', 'denied')),
      initiated_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT,
      approved_by TEXT REFERENCES users(id)
    );

    -- Indexes for common queries
    CREATE INDEX IF NOT EXISTS idx_credentials_user_id ON credentials(user_id);
    CREATE INDEX IF NOT EXISTS idx_credentials_type ON credentials(user_id, type);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests(status);
    CREATE INDEX IF NOT EXISTS idx_approval_requests_requester ON approval_requests(requester_id);
    CREATE INDEX IF NOT EXISTS idx_approval_votes_request ON approval_votes(request_id);
    CREATE INDEX IF NOT EXISTS idx_audit_log_event ON audit_log(event_type);
    CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_id);
    CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys(expires_at);
    CREATE INDEX IF NOT EXISTS idx_recovery_user ON recovery_requests(user_id);
  `);
}
