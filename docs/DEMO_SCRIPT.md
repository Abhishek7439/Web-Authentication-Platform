# Demo Script — Commander Auth

> For judges/reviewers evaluating the hackathon submission.
> The full flow takes approximately 10 minutes. Key engineering moments are marked with ⭐.

---

## Pre-Demo Setup (2 minutes before)

```bash
npm run reset-db    # Fresh seed, 5 demo accounts, 4 policies, genesis audit entry
node server/index.js   # Start server (serves built SPA on port 3000)
```

Open **three browser windows** (or profiles):
- **Window A**: Alice (member) — the requester
- **Window B**: Bob (senior, weight 2) — first approver
- **Window C**: Carol (member, weight 1) — second approver

All three go to `http://localhost:3000` (or your deployed URL).

---

## Scene 1: Risk-Adaptive Passwordless Login (2 min)

**In Window A:**
1. Enter `alice@demo.local` in the email field
2. Click **Continue** — the system performs a risk assessment
3. ⭐ **Risk banner appears**: "🟡 Medium risk" (first login from this device)
4. Both **Passkey** and **TOTP** are offered — but **magic link is absent**
5. Click **🔢 Sign in with TOTP**, enter the TOTP code → Alice is logged in

**Say:** *"Notice the risk assessment happened before we chose a method. The system evaluates device fingerprint, geographic context, and recovery status, then decides which factors to offer. Magic link is deliberately not available here — it's scoped to recovery only, our weakest channel reserved for the narrowest use case."*

**In Window B:**
1. Enter `bob@demo.local`, click **Continue**, use TOTP to log in

**In Window C:**
1. Same for `carol@demo.local`

⭐ **Key point:** *"We deliberately don't offer magic link as a convenience login — it's the weakest factor, reserved for recovery only. This aligns with the brief's language about minimizing reliance on vulnerable communication channels."*

---

## Scene 1b: High-Risk Adaptive Factor Restriction (Optional, 30 sec)

**Mention or show:** *"If Alice were logging in from a new device during an active recovery window, the risk engine would score her as 'high risk' and only offer WebAuthn — TOTP would be grayed out with a tooltip explaining why. The system adapts factor selection based on context, not just user preference."*

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

## Scene 3: Number-Matching Anti-Fatigue + Mandatory Signing (2 min)

**In Window B (Bob — senior, weight 2):**
1. See the request in **Pending for Your Vote**
2. Click **✅ Approve (Unsigned)** first.
3. ⭐ **Number-matching challenge appears**: A 2-digit number is displayed. Bob must type it to confirm — this prevents "tapping yes in a hurry."
4. After confirming: **Error Alert:** *"Signature Required: This policy requires a cryptographically signed vote."*
5. Now click **🔏 Sign & Approve** → number-matching challenge again → passkey prompt → signed vote submitted.
6. Tally updates: `2/3 — still pending`, and the row shows "🔏".

**In Window C (Carol — member, weight 1):**
1. Click **🔏 Sign & Approve** → confirm number match → sign
2. Tally hits `3/3` — **APPROVED** 🎉

⭐ **What to say:** *"Two anti-fatigue measures: first, the number-matching step forces conscious engagement before every vote — directly countering push-approval fatigue attacks. Second, the system explicitly rejects unsigned votes on sensitive policies, requiring cryptographic proof of identity."*

---

## Scene 4: Verify Cryptographic Signatures (1 min)

**In Window A (Alice):**
1. Go to the approved request in **All Requests**
2. Click the request row to expand details.
3. Show the **Quorum Progress** bar hitting 100%.
4. Click the **🔏 Signed** badge next to Bob's vote.
5. ⭐ **Verify Modal:** The UI performs an independent check of the WebAuthn signature against the stored public key fingerprint, proving Bob's identity mathematically.

---

## Scene 5: Persona-Driven Policy Differences (1 min)

**In Window A (Alice):**
1. Navigate to **Dashboard**
2. Click the **🎓 Student** persona toggle
3. ⭐ **Policy badge changes**: Shows "⏱️ 15 min step-up · TOTP accepted" — vs Bank's "⏱️ 5 min step-up · WebAuthn only"
4. Note the explanation: *"Students face tight deadlines. The `academic-submission` policy grants a 15-minute verification window and accepts TOTP — this is enforced server-side by a distinct policy, not a UI toggle."*

**Say:** *"These aren't cosmetic labels. The Student persona routes to the `academic-submission` policy (15-minute step-up, TOTP accepted), while the Bank persona routes to `high-value-transaction` (5-minute step-up, WebAuthn only). The leniency is baked into the policy on the server, not controlled by a client header."*

---

## Scene 6: Audit Chain (2 min)

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

## Scene 7: Degraded Network Demo (1 min)

**In Window A:**
1. On the **Dashboard**, click the **🔌 Simulate degraded network** toggle
2. Logout and return to login
3. ⭐ A yellow banner appears: *"Simulated degraded network — WebAuthn challenges will time out. Falling back to TOTP."*
4. Enter email, Continue → WebAuthn button shows "(may timeout)"
5. Use TOTP instead — login succeeds

**Say:** *"This isn't just a documented claim — judges can watch the graceful degradation happen live. When the primary factor is unavailable, the system falls back to the next-strongest factor with a clear explanation."*

6. Toggle off the degraded mode on the Dashboard.

---

## Scene 8: Recovery Flow (1 min)

**In Window A (Alice):**
1. Navigate to `http://localhost:3000/#/recovery` (or mention it conceptually)
2. Enter `alice@demo.local`, click **Initiate Recovery**
3. A recovery magic-link appears — clicking it puts Alice into **elevated risk mode**
4. Dashboard shows: *"⚠️ Elevated security mode — active for 48 hours"*

⭐ **What to say:** *"Recovery is the highest-risk operation — and it's the only place magic link appears. Any action during the 48-hour window is scored as high risk. If Alice re-assesses her login risk now, only WebAuthn will be offered."*

---

## What to Highlight to Judges

| Feature | Where to see it | Why it matters |
|---|---|---|
| Risk-adaptive login | Login page: risk assessment + factor gating | Factors are restricted by context, not just offered unconditionally |
| No magic link for login | Login page | Weakest factor reserved for recovery only |
| Number-matching anti-fatigue | Approvals: vote confirmation | Prevents reflexive "tap yes in a hurry" attacks |
| Mandatory signed votes | Approvals: unsigned vote rejection | Non-repudiable cryptographic proof of approval |
| Role-weighted M-of-N quorum | Approvals page | Bob (weight 2) + Carol (weight 1) = exactly threshold 3 |
| Per-policy step-up | Dashboard: persona toggle | Student: 15 min + TOTP; Bank: 5 min + WebAuthn only |
| Degraded network demo | Dashboard toggle + login flow | Graceful fallback, live, not just documented |
| Hash-chained audit + verification | Audit log page | Tamper-evident, verifiable with one click |
| No SMS by design | Login footer + Dashboard security card | Architectural decision visible in-product |
| Real-time via Socket.IO | Toast notifications across windows | All approvers notified instantly, no polling |

---

## Credentials Quick Reference

| Email | Role | Weight |
|---|---|---|
| alice@demo.local | member | 1 |
| bob@demo.local | senior | 2 |
| carol@demo.local | member | 1 |
| dave@demo.local | member | 1 |
| admin@demo.local | admin | 3 |

All accounts use TOTP login for demo. For TOTP codes, use the seed script with `--show-qr` flag (shows TOTP URIs to scan).
