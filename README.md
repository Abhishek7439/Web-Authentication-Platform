# Commander Auth

**Zero-password authentication platform with cryptographically signed multi-party approvals, role-weighted quorum consensus, and tamper-evident hash-chained audit trails.**

> Built by team **404Found**

---

## What Makes This Different

Most hackathon auth projects implement passkeys. **We go three layers deeper:**

| Differentiator | What it does | Where to see it |
|---|---|---|
| **Mandatory Signed Votes** | High-value policies reject unsigned votes with `403 signature_required`. Each vote is a WebAuthn assertion tied to the approver's public key — non-repudiable. | Approvals → try unsigned vote on `high-value-transaction` |
| **Role-Weighted Quorum** | M-of-N approval with configurable weights per role (`admin=3, senior=2, member=1`). Not just "2 people approve" — it's weighted consensus. | Approvals → watch tally climb as different roles vote |
| **Tamper-Evident Audit Chain** | Every event is SHA-256 hash-chained. Break one entry → the entire chain downstream turns red. One-click verify + reversible tamper demo. | Audit → ⚡ Break Chain → 🔗 Verify → ⏪ Undo |
| **Three-Persona Demo** | Dashboard adapts to Bank Customer / Student / Startup Developer — same engine, three real-world use cases from the problem statement. | Dashboard → persona toggle |
| **Independent Signature Verification** | Click any "🔏 Signed" badge to mathematically re-verify a vote against the stored public key fingerprint. | Approvals → expand a request → click badge |

---

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (ES modules) |
| Server | Express.js |
| **Database** | **SQLite (better-sqlite3)** |
| Real-time | Socket.IO |
| Frontend | Vite + Vanilla JS |
| WebAuthn | @simplewebauthn/server + browser |
| TOTP | otpauth (RFC 6238) |
| Geo-IP | geoip-lite (bundled, offline) |
| Deployment | Render (free tier) |

> **This project uses SQLite via better-sqlite3 as its sole data store. Firebase is not used anywhere.**

### Why not Firebase Auth?

Firebase Auth doesn't support WebAuthn/FIDO2 natively, doesn't give us control over the approval/quorum logic, and would make the entire platform dependent on a cloud service we can't inspect or customize. SQLite gives us:
- Full control over the auth pipeline
- Single-file database, trivial to inspect/reset for demos
- Zero cloud dependency — works offline, works anywhere
- No billing surprises, no API key management

---

## Quick Start

```bash
# Clone and install
git clone <repo-url>
cd 404Found
npm install

# Copy env and start
cp .env.example .env
npm run dev
```

This starts both the Express server (port 3000) and Vite dev server (port 5173).

### Demo Accounts

The database auto-seeds on first startup with these accounts:

| Account | Email | Role | Weight | Passkey |
|---|---|---|---|---|
| Alice | alice@demo.local | member | 1 | — |
| Bob | bob@demo.local | senior | 2 | ✅ Pre-registered |
| Carol | carol@demo.local | member | 1 | ✅ Pre-registered |
| Dave | dave@demo.local | member | 1 | — |
| Admin | admin@demo.local | admin | 3 | — |

All accounts have pre-configured TOTP secrets. Use `npm run seed -- --show-qr` to see the TOTP URIs for authenticator setup.

### Useful Commands

```bash
npm run dev         # Start dev servers (Express + Vite)
npm run seed        # Seed demo data (runs automatically on startup)
npm run reset-db    # Delete DB and re-seed (clean state for demos)
npm test            # Run E2E tests (32 checks: auth, quorum, audit, signing)
```

---

## Architecture

```
Adaptive Auth Core → Step-Up Approval Primitive
→ Role-Weighted Quorum Engine → Signed Non-Repudiable Votes
→ SHA-256 Hash-Chained Audit Trail → One-Click Tamper Detection
```

Three layers:
1. **Adaptive Auth Core** — WebAuthn + TOTP + magic-link with risk-based factor selection
2. **Step-Up Approval Engine** — Generic approval primitive for any action type, with idempotency keys
3. **Quorum Policy Engine** — M-of-N, role-weighted, with mandatory signing for sensitive policies

### Security Properties

| Property | Implementation |
|---|---|
| **Non-repudiation** | Votes on sensitive policies require WebAuthn assertion — cryptographic proof of identity |
| **Tamper evidence** | Audit log entries are SHA-256 hash-chained; modifying any entry breaks the chain |
| **Idempotency** | All write endpoints accept `Idempotency-Key` headers — safe for network retries |
| **Risk scoring** | Offline geo-IP + device fingerprint + auth method → per-session risk level |
| **Step-up freshness** | 5-minute verification window for sensitive operations |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full component diagram and data flow.

---

## Demo Setup (for Judging)

1. Run `npm run reset-db` for a clean state
2. Start the server: `node server/index.js` (serves built SPA on port 3000)
3. Open **three browser windows** for Alice, Bob, and Carol
4. Follow [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) for the click-by-click walkthrough

### Key Demo Beats

1. **Persona toggle** — switch between Bank/Student/Startup on Dashboard
2. **Unsigned vote rejected** — try approving a high-value transfer without passkey → `403`
3. **Signed quorum** — Bob + Carol sign & approve → weighted tally crosses threshold in real-time
4. **Signature verification** — click 🔏 badge → modal shows public key fingerprint
5. **Tamper & recover** — Break Chain → Verify (red) → Undo → Verify (green)

---

## Deployment

This project deploys to Render via `render.yaml`. Push to the connected repo and Render auto-deploys.

WebAuthn is configured for `commander-auth.onrender.com` — update `WEBAUTHN_RP_ID` and `WEBAUTHN_ORIGIN` in Render's env vars if using a different domain.

## Documentation

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) — Component diagram, data flow, trust boundaries
- [THREAT_MODEL.md](docs/THREAT_MODEL.md) — Attack surface, tradeoffs, mitigations
- [API_REFERENCE.md](docs/API_REFERENCE.md) — Full API spec for integrators
- [DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) — Click-by-click demo walkthrough with new signing + tamper beats

## Test Results

```
══════════════════════════════════════════════
  RESULTS: 32 passed, 0 failed
══════════════════════════════════════════════
```

Covers: frontend serving, magic-link auth, mandatory signing rejection, self-vote prevention, idempotency, role-weighted quorum, duplicate vote prevention, audit chain integrity, recovery flow, and SPA routing.
