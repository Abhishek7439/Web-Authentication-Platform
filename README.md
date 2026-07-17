# 🛡️ Commander Auth – Zero-Password Auth & Approval Platform

<div align="center">

![Commander Auth Banner](https://img.shields.io/badge/Commander%20Auth-Zero%20Password-red?style=for-the-badge&logo=webauthn)
![Node](https://img.shields.io/badge/Node.js-Express%20%7C%20Socket.IO-339933?style=for-the-badge&logo=node.js)
![SQLite](https://img.shields.io/badge/SQLite-better--sqlite3-003B57?style=for-the-badge&logo=sqlite)
![Status](https://img.shields.io/badge/Status-Live%20🟢-green?style=for-the-badge)

**A zero-password authentication platform with cryptographically signed multi-party approvals, role-weighted quorum consensus, and a tamper-evident hash-chained audit trail.**

> Built by team **404Found**

[🌐 Live Demo](https://commander-auth.onrender.com) · [📖 Architecture](docs/ARCHITECTURE.md) · [🎬 Demo Script](docs/DEMO_SCRIPT.md)

</div>

---

## 📸 Screenshots

<table>
  <tr>
    <td align="center">
      <img src="screenshots/dashboard.png" alt="Persona Dashboard" width="100%"/>
      <br/><b>🖥️ Persona Dashboard</b>
      <br/><sub>Bank / Student / Startup toggle, live risk score</sub>
    </td>
    <td align="center">
      <img src="screenshots/approvals.png" alt="Approval Queue" width="100%"/>
      <br/><b>✅ Approval Queue</b>
      <br/><sub>Role-weighted quorum tally climbing in real time</sub>
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="screenshots/signed-vote.png" alt="Signed Vote Modal" width="100%"/>
      <br/><b>🔏 Signed Vote Verification</b>
      <br/><sub>WebAuthn assertion + public-key fingerprint</sub>
    </td>
    <td align="center">
      <img src="screenshots/audit-chain.png" alt="Audit Chain" width="100%"/>
      <br/><b>🔗 Tamper-Evident Audit Chain</b>
      <br/><sub>Break Chain → Verify (red) → Undo → Verify (green)</sub>
    </td>
  </tr>
</table>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [What Makes This Different](#-what-makes-this-different)
- [Key Features](#-key-features)
- [Security & Trust Engine](#-security--trust-engine)
- [System Architecture](#-system-architecture)
- [Tech Stack](#-tech-stack)
- [Data Model](#-data-model)
- [Project Structure](#-project-structure)
- [Setup & Deployment](#-setup--deployment)
- [Demo Setup (for Judging)](#-demo-setup-for-judging)
- [Security Properties](#-security-properties)
- [Test Results](#-test-results)

---

## 🌟 Overview

Commander Auth is a hackathon platform built around one thesis: **authentication and approval are the same underlying primitive** — *is this specific event sufficiently authorized, given its risk, in a way that can be proven and cannot be credibly denied?*

Instead of treating "login" and "approve this action" as separate features, Commander Auth runs both through one **Adaptive Auth Core → Step-Up Approval Engine → Quorum Policy Engine → Signed, Hash-Chained Audit Trail** pipeline. It ships with a three-persona demo (Bank Customer, Student, Startup Developer) pulled directly from the brief's own risk profiles, so the same engine can be shown solving three different threat models live.

---

## 🚀 What Makes This Different

Most hackathon auth projects stop at passkeys. Commander Auth goes three layers deeper:

| Differentiator | What it does | Where to see it |
|---|---|---|
| **Mandatory Signed Votes** | High-value policies reject unsigned votes with `403 signature_required`. Each vote is a WebAuthn assertion tied to the approver's public key — non-repudiable. | Approvals → try unsigned vote on `high-value-transaction` |
| **Role-Weighted Quorum** | M-of-N approval with configurable weights per role (`admin=3, senior=2, member=1`) — weighted consensus, not a headcount. | Approvals → watch tally climb as different roles vote |
| **Tamper-Evident Audit Chain** | Every event is SHA-256 hash-chained. Break one entry → the entire chain downstream turns red. One-click verify + reversible tamper demo. | Audit → ⚡ Break Chain → 🔗 Verify → ⏪ Undo |
| **Three-Persona Demo** | Dashboard adapts to Bank Customer / Student / Startup Developer — same engine, three real-world use cases from the problem statement. | Dashboard → persona toggle |
| **Independent Signature Verification** | Click any "🔏 Signed" badge to mathematically re-verify a vote against the stored public-key fingerprint. | Approvals → expand a request → click badge |

---

## ✨ Key Features

### 🔑 Adaptive Auth Core
| Feature | Description |
|---|---|
| **WebAuthn / Passkeys** | Primary factor for supported devices, no password ever stored |
| **TOTP (RFC 6238)** | Fallback factor for accounts without a registered passkey |
| **Magic Link** | Recovery path when a passkey device is lost — recovery is first-class, not an afterthought |
| **Risk-Based Step-Up** | New device + new geo-IP + weak factor → auth itself is scored and can trigger approval-like step-up |
| **Step-Up Freshness Window** | 5-minute verification window for sensitive operations |

### ✅ Approval & Quorum Engine
| Feature | Description |
|---|---|
| **Generic Policy Primitive** | Any action type — not hardcoded per feature — can be gated behind an approval policy |
| **N-of-M, Role-Weighted** | Quorum thresholds configurable per policy; weights vary by role |
| **Succession-Aware** | Policies can be designed so a missing approver doesn't create a permanent dead-end |
| **Idempotency Keys** | All write endpoints accept `Idempotency-Key` headers — safe for network retries mid-demo |

### 🔗 Audit & Non-Repudiation
| Feature | Description |
|---|---|
| **SHA-256 Hash Chain** | Every audit event links to the previous event's hash |
| **One-Click Tamper Demo** | Break any entry → downstream chain flags red instantly |
| **Signature Verification Modal** | Re-derive and compare a vote's public-key fingerprint on demand |
| **Reversible Demo State** | Undo a tamper for repeat walkthroughs without reseeding |

---

## 🤖 Security & Trust Engine

> The hardest requirement in the brief isn't login — it's proving, after the fact, that a specific person authorized a specific action in a way even they can't deny. Commander Auth is built around that sentence.

### Components

```
🛡️ trust-engine/
├── 🔑 Adaptive Auth Core
│   ├── WebAuthn / passkey verification
│   ├── TOTP fallback (RFC 6238)
│   ├── Magic-link recovery flow
│   └── Risk scorer (geo-IP + device fingerprint + auth method)
│
├── ✅ Step-Up Approval Engine
│   ├── Generic approval primitive (any action type)
│   ├── Idempotency-key deduplication
│   └── Freshness window enforcement (5 min)
│
├── ⚖️ Quorum Policy Engine
│   ├── M-of-N threshold evaluation
│   ├── Role-weight aggregation (admin=3, senior=2, member=1)
│   └── Mandatory-signing flag per policy
│
└── 🔗 Audit Chain
    ├── SHA-256 hash-chained event log
    ├── Chain verification (walk + compare)
    └── Tamper injection + recovery (demo-only)
```

### Risk Score Model
```
Risk Score = (newDeviceWeight × 30) + (geoDistanceWeight × 25)
           + (authMethodWeight × 25) + (velocityWeight × 20)
```
- **Low risk** → standard single-factor auth accepted
- **Medium risk** → step-up TOTP/passkey re-assertion required
- **High risk** → routes into the same Approval Engine used for sensitive actions

---

## 🏗️ System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         CLIENT (Vite SPA)                        │
│   Persona Dashboard → Approval Queue → Audit Explorer → Signing  │
└───────────────────────────┬────────────────────────────────────┘
                            │  REST + Socket.IO (real-time tally/audit push)
┌───────────────────────────▼────────────────────────────────────┐
│                    EXPRESS.JS API SERVER                         │
│                                                                    │
│   Adaptive Auth Core                                              │
│   ├── /auth/webauthn/*   (passkey register + assert)             │
│   ├── /auth/totp/*       (RFC 6238 verify)                       │
│   └── /auth/magic-link/* (recovery)                              │
│                                                                    │
│   Step-Up Approval Engine                                        │
│   ├── /approvals          (create policy-gated request)          │
│   ├── /approvals/:id/vote (signed / unsigned vote)                │
│   └── /approvals/:id      (status + tally)                       │
│                                                                    │
│   Quorum Policy Engine — evaluates M-of-N + role weights          │
│   Audit Service — appends + hash-chains every state change        │
└───────────────────────────┬────────────────────────────────────┘
                            │  better-sqlite3 (sync, single-file)
┌───────────────────────────▼────────────────────────────────────┐
│                     SQLITE DATA STORE                            │
│   users · credentials · policies · approval_requests             │
│   votes · audit_log · sessions                                   │
└──────────────────────────────────────────────────────────────────┘
```

Three architectural layers, top to bottom:

1. **Adaptive Auth Core** — WebAuthn + TOTP + magic-link with risk-based factor selection
2. **Step-Up Approval Engine** — generic approval primitive for any action type, with idempotency keys
3. **Quorum Policy Engine → Signed, Hash-Chained Audit Trail** — M-of-N, role-weighted, mandatory signing for sensitive policies, every event chained

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full component diagram, trust boundaries, and data flow.

---

## 🛠️ Tech Stack

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
Firebase Auth doesn't support WebAuthn/FIDO2 natively, doesn't expose control over approval/quorum logic, and would make the whole platform dependent on a cloud service that can't be inspected or customized. SQLite gives us full control over the auth pipeline, a single-file database that's trivial to inspect or reset for demos, zero cloud dependency, and no billing surprises.

---

## 📊 Data Model

```
users
  ├── id            TEXT PK
  ├── email          TEXT UNIQUE
  ├── name           TEXT
  ├── role           TEXT   -- 'admin' | 'senior' | 'member'
  ├── weight         INTEGER -- quorum vote weight
  └── created_at     DATETIME

credentials
  ├── id             TEXT PK
  ├── user_id        TEXT FK → users.id
  ├── type           TEXT   -- 'webauthn' | 'totp'
  ├── public_key     TEXT    -- WebAuthn public key (base64)
  ├── totp_secret    TEXT    -- encrypted, TOTP only
  └── registered_at  DATETIME

policies
  ├── id                 TEXT PK
  ├── action_type        TEXT   -- e.g. 'high-value-transaction'
  ├── threshold_weight   INTEGER -- quorum weight required
  ├── mandatory_signing  BOOLEAN
  └── freshness_window_s INTEGER  -- default 300

approval_requests
  ├── id              TEXT PK
  ├── policy_id       TEXT FK → policies.id
  ├── requested_by    TEXT FK → users.id
  ├── idempotency_key TEXT UNIQUE
  ├── status          TEXT   -- 'pending' | 'approved' | 'denied'
  ├── tally_weight    INTEGER
  └── created_at      DATETIME

votes
  ├── id               TEXT PK
  ├── approval_id      TEXT FK → approval_requests.id
  ├── voter_id         TEXT FK → users.id
  ├── decision         TEXT   -- 'approve' | 'deny'
  ├── signed           BOOLEAN
  ├── webauthn_sig     TEXT    -- nullable, present when signed
  └── voted_at         DATETIME

audit_log
  ├── id            TEXT PK
  ├── event_type    TEXT   -- 'auth' | 'vote' | 'approval' | 'admin'
  ├── payload       TEXT    -- JSON snapshot of the event
  ├── prev_hash     TEXT    -- hash of previous entry
  ├── hash          TEXT    -- SHA-256(prev_hash + payload)
  └── created_at    DATETIME

sessions
  ├── id            TEXT PK
  ├── user_id       TEXT FK → users.id
  ├── risk_score    INTEGER
  ├── auth_method   TEXT
  └── expires_at    DATETIME
```

---

## 📁 Project Structure

```
404Found/
├── server/
│   ├── index.js               # Express entry point, serves built SPA
│   ├── routes/
│   │   ├── auth.js             # WebAuthn / TOTP / magic-link
│   │   ├── approvals.js        # Approval + quorum endpoints
│   │   └── audit.js            # Audit chain + verify/tamper (demo)
│   ├── engine/
│   │   ├── riskScorer.js       # Adaptive risk scoring
│   │   ├── quorum.js           # M-of-N + role-weight evaluation
│   │   └── hashChain.js        # SHA-256 chain build + verify
│   └── db/
│       ├── schema.sql
│       └── seed.js             # Demo account + policy seeding
│
├── client/                     # Vite + Vanilla JS SPA
│   ├── dashboard/               # Persona toggle, risk view
│   ├── approvals/                # Queue, signed vote modal
│   └── audit/                    # Chain explorer, tamper demo
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── THREAT_MODEL.md
│   ├── API_REFERENCE.md
│   └── DEMO_SCRIPT.md
│
├── render.yaml
├── .env.example
└── package.json
```

---

## 🚀 Setup & Deployment

### Prerequisites
- Node.js 18+
- npm

### 1. Clone & Install
```bash
git clone <repo-url>
cd 404Found
npm install
```

### 2. Configure & Run
```bash
cp .env.example .env
npm run dev
```
This starts both the Express server (port 3000) and Vite dev server (port 5173).

### Demo Accounts

The database auto-seeds on first startup:

| Account | Email | Role | Weight | Passkey |
|---|---|---|---|---|
| Alice | alice@demo.local | member | 1 | — |
| Bob | bob@demo.local | senior | 2 | ✅ Pre-registered |
| Carol | carol@demo.local | member | 1 | ✅ Pre-registered |
| Dave | dave@demo.local | member | 1 | — |
| Admin | admin@demo.local | admin | 3 | — |

All accounts have pre-configured TOTP secrets. Use `npm run seed -- --show-qr` to see TOTP URIs for authenticator setup.

### Useful Commands
```bash
npm run dev         # Start dev servers (Express + Vite)
npm run seed        # Seed demo data (runs automatically on startup)
npm run reset-db    # Delete DB and re-seed (clean state for demos)
npm test            # Run E2E tests (32 checks: auth, quorum, audit, signing)
```

### Deployment
This project deploys to Render via `render.yaml`. Push to the connected repo and Render auto-deploys. WebAuthn is configured for `commander-auth.onrender.com` — update `WEBAUTHN_RP_ID` and `WEBAUTHN_ORIGIN` in Render's env vars if using a different domain.

---

## 🎬 Demo Setup (for Judging)

1. Run `npm run reset-db` for a clean state
2. Start the server: `node server/index.js` (serves built SPA on port 3000)
3. Open **three browser windows** for Alice, Bob, and Carol
4. Follow [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) for the click-by-click walkthrough

### Key Demo Beats
1. **Persona toggle** — switch between Bank/Student/Startup on Dashboard
2. **Unsigned vote rejected** — try approving a high-value transfer without passkey → `403`
3. **Signed quorum** — Bob + Carol sign & approve → weighted tally crosses threshold in real time
4. **Signature verification** — click 🔏 badge → modal shows public-key fingerprint
5. **Tamper & recover** — Break Chain → Verify (red) → Undo → Verify (green)

---

## 🔐 Security Properties

| Property | Implementation |
|---|---|
| **Non-repudiation** | Votes on sensitive policies require WebAuthn assertion — cryptographic proof of identity |
| **Tamper evidence** | Audit log entries are SHA-256 hash-chained; modifying any entry breaks the chain |
| **Idempotency** | All write endpoints accept `Idempotency-Key` headers — safe for network retries |
| **Risk scoring** | Offline geo-IP + device fingerprint + auth method → per-session risk level |
| **Step-up freshness** | 5-minute verification window for sensitive operations |
| **Graceful degradation** | Magic-link recovery ensures no hard dead-end when a passkey device is lost |

See [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) for attack surface, tradeoffs, and mitigations, and [docs/API_REFERENCE.md](docs/API_REFERENCE.md) for the full integrator-facing API spec.

---

## ✅ Test Results

```
══════════════════════════════════════════════
  RESULTS: 32 passed, 0 failed
══════════════════════════════════════════════
```

Covers: frontend serving, magic-link auth, mandatory signing rejection, self-vote prevention, idempotency, role-weighted quorum, duplicate vote prevention, audit chain integrity, recovery flow, and SPA routing.

---

## 📄 License

MIT License — Free to use for educational, research, and non-commercial purposes.

---

<div align="center">

Built with 🔐 for a world with fewer passwords and better proof.

**Commander Auth** — *Prove it happened. Prove who approved it. Prove it can't be denied.*

</div>
