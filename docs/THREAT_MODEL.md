# Threat Model — Commander Auth

> "Originality, sound engineering, and a clear understanding of your system will matter far more than the number of features."

This document describes the attack surface, explicit trust boundaries, threat scenarios, mitigations, and acknowledged residual risks.

---

## Trust Boundaries

| Boundary | What crosses it | How we protect it |
|---|---|---|
| Browser ↔ Server | All auth tokens, WebAuthn attestations | HTTPS only; helmet CSP; JWT RS256 in prod |
| Server ↔ SQLite | Queries, credentials, secrets | Server-local only; AES-256-GCM for secrets at rest |
| User ↔ WebAuthn | Private key never leaves authenticator | FIDO2 spec enforced by browser + authenticator hardware |
| Approver ↔ Vote | Vote decision + optional WebAuthn signature | Non-repudiation via `signature` field; audit log |

---

## Threat Scenarios

### T1: Credential Phishing
**Attack**: Attacker sends fake login page to steal password / TOTP.

**Mitigation**: WebAuthn is phishing-resistant by design — the browser binds the credential to the exact `rpId` (our domain). Credentials registered on `commander-auth.onrender.com` cannot be used on any other domain. Magic-link tokens are single-use with 15-min TTL.

**Residual risk**: TOTP codes are portable (can be entered anywhere). Mitigated by: TOTP is not eligible for step-up auth; sensitive actions always require WebAuthn.

---

### T2: Replay Attack on Approval Votes
**Attack**: Attacker captures a valid vote request and replays it to double-vote.

**Mitigation**: `Idempotency-Key` middleware stores the response for 24h and returns the cached response on replay. The approval engine also explicitly checks if the approver has already voted (`UNIQUE constraint` on `(request_id, approver_id)`).

---

### T3: Self-Approval (Insider Threat)
**Attack**: Alice creates a high-value request and then votes to approve it herself.

**Mitigation**: `submitVote()` checks `request.requester_id === approverId` and returns 400 before writing anything. Enforced at the engine layer, not just the route layer.

---

### T4: Audit Log Tampering
**Attack**: Admin or attacker directly modifies the SQLite `audit_log` table to hide an event.

**Mitigation**: Each entry stores `prev_hash` and `entry_hash = SHA-256(prev_hash + payload + timestamp)`. Any modification to any historical entry (payload, timestamp, or prev_hash) causes `verifyChainIntegrity()` to return `{ valid: false, brokenAt: <id> }`. The UI exposes one-click chain verification.

**Residual risk**: An attacker who can modify the DB could recompute the entire chain forward from the tampered entry. Full non-repudiation requires an external anchor (e.g., periodic chain-head published to a public ledger). Acknowledged tradeoff for demo scope.

---

### T5: JWT Token Theft
**Attack**: XSS or network capture of a JWT token allows impersonation.

**Mitigation**:
- `helmet` sets security headers (X-Content-Type-Options, X-Frame-Options, referrer policy)
- Tokens are stored in `localStorage` (acceptable for demo; move to `httpOnly` cookies in production)
- Session lifetime is 24h; step-up freshness window is 5 minutes for sensitive actions
- Stolen token alone cannot complete step-up — WebAuthn requires the physical authenticator

**Residual risk**: XSS → localStorage read. Production mitigation: switch to `httpOnly` session cookies. Not done here to keep WebAuthn CORS setup simple.

---

### T6: Race Condition on Quorum Resolution
**Attack**: Two concurrent votes arrive simultaneously; both check `status === 'pending'` and both try to set `status = approved`.

**Mitigation**: `better-sqlite3` runs in WAL mode, but all writes are synchronous (the library is synchronous by design). Node.js event loop serializes requests. Only one vote can write at a time. No async DB calls means no TOCTOU window.

---

### T7: Account Takeover via Recovery
**Attack**: Attacker initiates recovery for a victim account, bypasses normal auth.

**Mitigation**:
- Recovery sets `recovery_status = pending` and `recovery_elevated_until` (48h window)
- Risk engine scores `recovery_active` at +40, `recovery_pending` at +15
- Any action during the 48h window gets scored as `high` risk regardless of auth method
- Recovery URL is a one-use magic-link with 15-min TTL
- All recovery events are audit-logged with full payload

**Residual risk**: Recovery by magic-link is the weakest point. Production hardening: require 2FA verification of a backup email/phone before sending recovery link.

---

### T8: Quorum Manipulation (Role Inflation)
**Attack**: Attacker registers a `senior` or `admin` account and votes to approve their own requests.

**Mitigation**:
- Role assignment is controlled by the `seed.js` script and admin API only
- `requireRole('admin')` guards all policy creation
- Self-approval prevention applies regardless of role weight
- Admin role users cannot approve their own requests even with weight 3

---

## Known Weaknesses (Acknowledged)

| Weakness | Why Accepted | Production Path |
|---|---|---|
| SQLite on ephemeral Render disk | Demo only; auto-seed on restart | Use Render persistent disk or migrate to Postgres |
| JWT in localStorage | Simple for demo; WebAuthn still requires physical device | Switch to `httpOnly` cookies |
| Audit chain not externally anchored | Chain-break detection works; full non-repudiation needs external anchor | Publish chain head hash to IPFS/blockchain periodically |
| No email delivery for magic links | Demo mode returns link in API response | Wire to SendGrid/Postmark in production |
| Single-dyno Render deployment | No HA for demo | Use multiple dynos + Redis adapter for Socket.IO |

---

## What We Got Right (Design Choices Worth Noting)

1. **Step-up freshness is per-action, not per-session** — A valid session doesn't grant permanent access to sensitive operations; you must re-authenticate within 5 minutes.

2. **Risk scoring is offline** — `geoip-lite` bundles the GeoIP database; no external API call means no latency and no third-party dependency at auth time.

3. **Idempotency at engine layer, not just DB** — Approval creation and voting are both idempotent. Network retries from mobile clients won't create duplicate requests.

4. **Audit chain verified by the server, surfaced to the client** — The verifier runs server-side (the client can't fake it), but the result is surfaced in the UI so judges/reviewers can see it working.

5. **Role weights are policy-level, not account-level** — The same user can have different voting weight depending on which policy governs the request. Policies are inspectable via `GET /api/policies`.
