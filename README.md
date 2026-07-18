# 🛡️ Commander Auth – Zero-Password Auth & Approval Platform

<div align="center">

![Commander Auth Banner](https://img.shields.io/badge/Commander%20Auth-Zero%20Password-red?style=for-the-badge&logo=webauthn)
![Node](https://img.shields.io/badge/Node.js-Express%20%7C%20Socket.IO-339933?style=for-the-badge&logo=node.js)
![SQLite](https://img.shields.io/badge/SQLite-better--sqlite3-003B57?style=for-the-badge&logo=sqlite)
![Status](https://img.shields.io/badge/Status-Live%20🟢-green?style=for-the-badge)

**One adaptive authorization core — the same engine that decides who can log in also decides who can approve what — deployed across three real-world personas (bank customer, student, startup integrator), not three separate flows. Zero-password authentication with cryptographically signed multi-party approvals, role-weighted quorum consensus, and a tamper-evident hash-chained audit trail.**

> Built by team **404Found**

[🌐 Live Demo](https://commander-auth.onrender.com) · [📖 Architecture](docs/ARCHITECTURE.md)

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
- [Security Properties](#-security-properties)
- [Test Results](#-test-results)

---

## 🌟 Overview

Commander Auth is a hackathon platform built around one thesis: **authentication and approval are the same underlying primitive** — *is this specific event sufficiently authorized, given its risk, in a way that can be proven and cannot be credibly denied?*

Instead of treating "login" and "approve this action" as separate features, Commander Auth runs both through one **Adaptive Auth Core → Step-Up Approval Engine → Quorum Policy Engine → Signed, Hash-Chained Audit Trail** pipeline. It ships with a three-persona demo (Bank Customer, Student, Startup Developer) pulled directly from the brief's own risk profiles, so the same engine can be shown solving three different threat models live.

> **Design principle:** SMS/phone-based OTP is intentionally excluded — SIM-swapping and SS7 interception make phone-based factors unsuitable for a platform whose entire thesis is non-repudiation.

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
| **Magic Link** | Recovery path only — deliberately not offered as a convenience login factor. Used solely when a passkey device is lost. |
| **Risk-Adaptive Factor Selection** | Before login method selection, the system evaluates device fingerprint, geographic context, and recovery status, then restricts which factors are offered. High risk → WebAuthn only; low risk → WebAuthn or TOTP. |
| **Per-Policy Step-Up Freshness** | Each approval policy defines its own step-up window and accepted factors (e.g., `academic-submission`: 15 min + TOTP; `high-value-transaction`: 5 min + WebAuthn only) |
| **Number-Matching Anti-Fatigue** | Before any approval vote, a 2-digit number challenge forces conscious engagement — countering push-approval fatigue attacks |

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

<div align="center">
  <img src="screenshots/architecture.png" alt="System Architecture Diagram" width="100%"/>
</div>

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

<div align="center">
  <img src="screenshots/data-model.png" alt="Data Model Diagram" width="100%"/>
</div>

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



## 🔐 Security Properties

| Property | Implementation |
|---|---|
| **Non-repudiation** | Votes on sensitive policies require WebAuthn assertion — cryptographic proof of identity |
| **Tamper evidence** | Audit log entries are SHA-256 hash-chained; modifying any entry breaks the chain |
| **Idempotency** | All write endpoints accept `Idempotency-Key` headers — safe for network retries |
| **Risk-adaptive login** | Pre-login risk assessment restricts available factors by context — high risk forces WebAuthn only |
| **Per-policy step-up** | Each policy defines its own freshness window and accepted step-up factors, enforced server-side |
| **MFA-fatigue resistance** | Number-matching challenge on every vote prevents reflexive "tap yes in a hurry" |
| **Graceful degradation** | Degraded-network toggle demonstrates live fallback from WebAuthn to TOTP |
| **No SMS by design** | Phone-based OTP intentionally excluded — SIM-swapping and SS7 make it unsuitable |

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
