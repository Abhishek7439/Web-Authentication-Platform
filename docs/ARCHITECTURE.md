# Architecture Overview — Commander Auth

## One-line design statement

> One adaptive auth core → generalized step-up approval primitive → configurable quorum policy engine → signed non-repudiable audit trail → explicit resilience/threat model

---

## System Layers

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser SPA (Vite + Vanilla JS)                                │
│  login │ register │ dashboard │ approvals │ audit               │
│                Socket.IO client (real-time events)              │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTPS / WS (same origin)
┌───────────────────────────▼─────────────────────────────────────┐
│  Express API Server (Node.js ESM)                               │
│                                                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │  Auth Layer │  │ Approval     │  │ Audit Trail            │ │
│  │             │  │ Engine       │  │                        │ │
│  │  WebAuthn   │  │ createReq    │  │ SHA-256 hash chain     │ │
│  │  TOTP       │  │ submitVote   │  │ append-only            │ │
│  │  Magic Link │  │ evaluateQ.   │  │ verifyIntegrity()      │ │
│  │  Step-Up    │  │ M-of-N quor. │  │                        │ │
│  └──────┬──────┘  └──────┬───────┘  └──────────┬─────────────┘ │
│         │                │                      │               │
│  ┌──────▼────────────────▼──────────────────────▼─────────────┐ │
│  │  Risk Engine (geoip-lite + device fingerprint + recovery)  │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  Socket.IO  (approval:new, approval:vote, approval:resolved)│ │
│  └─────────────────────────────────────────────────────────────┘ │
└───────────────────────────┬─────────────────────────────────────┘
                            │ better-sqlite3 (synchronous, WAL mode)
┌───────────────────────────▼─────────────────────────────────────┐
│  SQLite Database                                                │
│  users │ credentials │ sessions │ approval_policies             │
│  approval_requests │ approval_votes │ audit_log                 │
│  idempotency_keys │ recovery_requests                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Authentication Core

### Three Factors, One Interface

| Factor | Strength | Step-Up Eligible | Notes |
|---|---|---|---|
| WebAuthn (FIDO2) | Strong | ✅ Yes | Phishing-resistant, hardware-bound |
| TOTP (RFC 6238) | Medium | ❌ No | Encrypted at rest (AES-256-GCM) |
| Magic Link | Soft | ❌ No | 15-min TTL, one-use, encrypted token |

### Session Model

JWT issued on login with `sub` (userId), `role`, `email`, `iat`, `exp` (24h).

Step-up state is tracked in the session DB record via `last_verified_at`. `requireStepUp` middleware checks that this timestamp is within 5 minutes. If not → 403 with `step_up_required` error.

### Risk Engine Scoring

```
Base score = auth_method_score + recovery_bonus + device_bonus + geo_bonus

Auth method:    WebAuthn = 0,  TOTP = +10,  magic-link = +20
Recovery:       active   = +40, pending = +15
Recovery window: +30 (48h after recovery completion)
New device:     +15 (user-agent not seen in prior sessions)
New country:    +25 (geoip-lite, offline, no API call)

Low   = 0–30:   standard session
Medium = 31–65: recommend additional factor
High  = 66+:    always require step-up
```

---

## Approval Engine

### Primitives

**Policy** — defines the rules for a class of action:
- `quorum_threshold` (integer, weighted tally needed)
- `role_weights` (`{ admin: 3, senior: 2, member: 1 }`)
- `expiry_minutes` (TTL for pending requests)
- `escalation_policy` (`delegate` | `auto-deny` | `auto-approve`)

**Request** — an instance of a policy for a specific action:
- Created by any authenticated user
- Cannot be voted on by the requester themselves (enforced at engine level)
- Transitions: `pending` → `approved` | `denied` | `expired`

**Vote** — a single approver's decision on a request:
- Stored with `signature` field for WebAuthn-signed non-repudiation
- Weighted by the voter's role at vote time

### Quorum Algorithm

```
approveTally = Σ roleWeights[voter.role] for all approve votes
denyTally    = Σ roleWeights[voter.role] for all deny votes

if approveTally >= threshold → APPROVED
if denyTally   >= threshold → DENIED
else                         → still PENDING
```

### Idempotency

`POST /api/approvals` and `POST /api/approvals/:id/vote` both accept `Idempotency-Key` header. Replayed requests with the same key return the cached response without creating duplicates. Keys expire after 24h.

---

## Audit Trail

Every significant event is written to `audit_log` as a hash-chained entry:

```
entry_hash = SHA-256(prev_hash + payload_json + timestamp)
```

- `prev_hash` of the first entry is `"000...0"` (64 zeros)
- Any modification to a historical entry breaks the chain from that point
- `GET /api/audit/verify` checks the entire chain in O(n) time
- Written for: auth events, approval lifecycle, policy changes, credential ops, recovery

---

## Data Flow: High-Value Transfer Request

```
1. Alice logs in via WebAuthn  →  JWT issued, session created
2. Alice clicks "Transfer $10k" → requireStepUp → 403 step_up_required
3. Alice completes step-up ceremony → last_verified_at updated
4. Alice POSTs /api/approvals { policyName: "high-value-transaction" }
5. Engine creates request → audit_log entry → Socket.IO emits approval:new
6. Bob (senior) and Carol (member) see toast notification
7. Bob votes approve → weight 2, tally = 2/3 → Socket.IO emits approval:vote
8. Carol votes approve → weight 1, tally = 3/3 → threshold met
9. Engine sets status = approved → audit_log → Socket.IO emits approval:resolved
10. Action executes (demo: shown in UI)
```

---

## Deployment

- **Host**: Render free tier (single dyno)
- **WebAuthn RP**: `commander-auth.onrender.com` (must match `WEBAUTHN_RP_ID`)
- **Persistence**: SQLite file + auto-seed on startup (ephemeral disk mitigation)
- **Keep-alive**: UptimeRobot pings `GET /health` every 5 minutes
- **Single port**: Express serves both the API and the built SPA from port 3000

See `render.yaml` for the full deployment config.
