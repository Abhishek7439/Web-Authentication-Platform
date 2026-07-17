# Demo Script — Commander Auth

> For judges/reviewers evaluating the hackathon submission.
> The full flow takes approximately 8 minutes. Key engineering moments are marked with ⭐.

---

## Pre-Demo Setup (2 minutes before)

```bash
npm run reset-db    # Fresh seed, 5 demo accounts, 3 policies, genesis audit entry
node server/index.js   # Start server (serves built SPA on port 3000)
```

Open **three browser windows** (or profiles):
- **Window A**: Alice (member) — the requester
- **Window B**: Bob (senior, weight 2) — first approver
- **Window C**: Carol (member, weight 1) — second approver

All three go to `http://localhost:3000` (or your deployed URL).

---

## Scene 1: Passwordless Login (2 min)

**In Window A:**
1. Enter `alice@demo.local` in the email field
2. Click **Send Magic Link** — a link appears directly in the UI (demo mode)
3. Click the link → Alice is logged in, redirected to Dashboard

**Say:** *"No password. A one-use token, AES-encrypted at rest, expires in 15 minutes."*

**In Window B:**
1. Enter `bob@demo.local`, click **Send Magic Link**, follow it

**In Window C:**
1. Same for `carol@demo.local`

⭐ **Risk score visible on Dashboard**: Alice (magic-link) → `medium`, Bob → `medium`. WebAuthn would score `low`.

---

## Scene 2: Create an Approval Request (1 min)

**In Window A (Alice):**
1. Navigate to **Approvals**
2. Select Action: `💰 High Value Transfer ($10,000+)`
3. Policy: `high-value-transaction` (threshold = 3, weights: admin=3, senior=2, member=1)
4. Click **Submit Request**

⭐ **What to say:** *"The threshold is 3 weighted points. A senior approver is worth 2, a member is worth 1. Bob + Carol = 2 + 1 = 3. Exactly at threshold."*

**In Windows B and C:** Toast notification appears within ~1 second: *"📝 New request: transfer from Alice"*

---

## Scene 3: Mandatory Signing & Role-Weighted Quorum (2 min)

**In Window B (Bob — senior, weight 2):**
1. See the request in **Pending for Your Vote**
2. Click **✅ Approve (Unsigned)** first.
3. ⭐ **Error Alert:** *"Signature Required: This policy requires a cryptographically signed vote (WebAuthn passkey). Unsigned votes are forbidden."*
4. Now click **🔏 Sign & Approve**. The browser prompts for a passkey (if testing locally, this succeeds instantly using the dummy passkey or virtual authenticator).
5. Tally updates: `2/3 — still pending`, and the row shows "🔏".

**In Window C (Carol — member, weight 1):**
1. Click **🔏 Sign & Approve**
2. Tally hits `3/3` — **APPROVED** 🎉

**In all windows:** `approval:resolved` toast fires simultaneously via Socket.IO.

⭐ **What to say:** *"First, we saw the system explicitly reject an unsigned vote on a high-value transfer. The security policy demands a non-repudiable signature. Once Bob and Carol signed, the role-weighted tally crossed the threshold and resolved instantly — no polling, pushed in real time."*

---

## Scene 4: Verify Cryptographic Signatures (1 min)

**In Window A (Alice):**
1. Go to the approved request in **All Requests**
2. Click the request row to expand details.
3. Show the **Quorum Progress** bar hitting 100%.
4. Click the **🔏 Signed** badge next to Bob's vote.
5. ⭐ **Verify Modal:** The UI performs an independent check of the WebAuthn signature against the stored public key fingerprint, proving Bob's identity mathematically.

---

## Scene 4: Self-Approval Prevention (30 sec)

**In Window A (Alice):**
1. Go to the approved request
2. Try to vote approve on your own request
3. Error: *"Cannot vote on your own request."* — blocked at the engine layer, not just UI

---

## Scene 5: Audit Chain (2 min)

**In Window A:**
1. Navigate to **Audit Log**
2. Show the chain: each entry shows event icon, actor, timestamp, and a truncated hash
3. Click **🔗 Verify Chain Integrity**
4. Result: *"✅ Chain integrity verified! All N entries have valid hash links."*

⭐ **What to say:** *"Every event — login, approval created, each vote, approval resolved — is appended as a SHA-256 hash-chained entry. Modifying any historical record breaks the chain from that point. One-click verification."*

**The Reversible Tamper Test:**
1. Click **⚡ Break Chain (Tamper)**.
2. The UI intentionally corrupts an entry.
3. Click **🔗 Verify Chain** again → The chain turns RED. *"🚨 TAMPERING DETECTED at entry #N"*, showing the exact hash mismatch.
4. Click **⏪ Undo Tamper** to restore the backed-up payload.
5. Click **🔗 Verify Chain** → Green again! The chain mathematically self-heals when data integrity is restored.

---

## Scene 6: Recovery Flow (1 min)

**In Window A (Alice):**
1. Navigate to `http://localhost:3000/#/recovery` (or mention it conceptually)
2. Enter `alice@demo.local`, click **Initiate Recovery**
3. A recovery magic-link appears — clicking it puts Alice into **elevated risk mode**
4. Dashboard shows: *"⚠️ Elevated security mode — active for 48 hours"*

⭐ **What to say:** *"Recovery is the highest-risk operation. Any action during the 48-hour window is scored as high risk by the risk engine — regardless of auth method. All recovery events are hash-chained in the audit log."*

---

## What to Highlight to Judges

| Feature | Where to see it | Why it matters |
|---|---|---|
| Phishing-resistant auth | Login page + WebAuthn ceremony | Passkeys can't be phished — bound to domain |
| Step-up freshness | `requireStepUp` middleware (5 min window) | Session token alone ≠ authorization for sensitive ops |
| Role-weighted M-of-N quorum | Approvals page | Bob (weight 2) + Carol (weight 1) = exactly threshold 3 |
| Real-time via Socket.IO | Toast notifications across windows | All approvers notified instantly, no polling |
| Hash-chained audit + verification | Audit log page | Tamper-evident, verifiable with one click |
| Idempotency | Duplicate requests silently deduplicate | Network retries safe on mobile |
| Risk engine | Dashboard session info | Offline geo-IP + device fingerprint, no API call |
| Recovery elevated window | Dashboard warning | 48h post-recovery high-risk scoring |
| SQLite + auto-seed | Works on Render free tier | No cloud dependencies, cold restart safe |

---

## Credentials Quick Reference

| Email | Role | Weight |
|---|---|---|
| alice@demo.local | member | 1 |
| bob@demo.local | senior | 2 |
| carol@demo.local | member | 1 |
| dave@demo.local | member | 1 |
| admin@demo.local | admin | 3 |

All accounts use magic-link login for demo. For TOTP, use the seed script with `--show-totp` flag (shows TOTP URIs to scan).
