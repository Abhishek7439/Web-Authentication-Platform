# API Reference — Commander Auth

> Base URL: `http://localhost:3000/api`
> All authenticated endpoints require `Authorization: Bearer <token>` header.

---

## Authentication

### POST /api/auth/register
Create a new user account.

| Field | Type | Required |
|---|---|---|
| email | string | ✅ |
| displayName | string | ✅ |

**Response:** `201` — `{ user: { id, email, displayName, role } }`

---

### POST /api/auth/magic-link/send
Send a magic-link login email (in demo mode, the link is returned directly).

| Field | Type | Required |
|---|---|---|
| email | string | ✅ |

**Response:** `200` — `{ sent: true, demoLink: "..." }`

---

### GET /api/auth/magic-link/verify/:token
Verify a magic-link token and return a session.

**Response:** `200` — `{ token, user: { id, email, displayName, role } }`

---

### POST /api/auth/webauthn/register-options
Get WebAuthn registration options for the current user.

| Field | Type | Required |
|---|---|---|
| email | string | ✅ |

**Response:** `200` — PublicKeyCredentialCreationOptions

---

### POST /api/auth/webauthn/register-verify
Verify a WebAuthn registration response.

| Field | Type | Required |
|---|---|---|
| email | string | ✅ |
| credential | object | ✅ |

**Response:** `200` — `{ verified: true, token, user }`

---

### POST /api/auth/webauthn/login-options
Get WebAuthn authentication options.

| Field | Type | Required |
|---|---|---|
| email | string | ✅ |

**Response:** `200` — PublicKeyCredentialRequestOptions

---

### POST /api/auth/webauthn/login-verify
Verify a WebAuthn authentication response.

| Field | Type | Required |
|---|---|---|
| email | string | ✅ |
| credential | object | ✅ |

**Response:** `200` — `{ verified: true, token, user }`

---

### POST /api/auth/totp/setup 🔒
Set up TOTP for the authenticated user.

**Response:** `200` — `{ secret, uri, qrDataUrl }`

---

### POST /api/auth/totp/verify
Verify a TOTP code and issue a session.

| Field | Type | Required |
|---|---|---|
| email | string | ✅ |
| code | string | ✅ |

**Response:** `200` — `{ verified: true, token, user }`

---

### POST /api/auth/step-up/options 🔒
Get WebAuthn options for step-up authentication.

**Response:** `200` — PublicKeyCredentialRequestOptions

---

### POST /api/auth/step-up/verify 🔒
Verify a step-up WebAuthn assertion.

| Field | Type | Required |
|---|---|---|
| credential | object | ✅ |

**Response:** `200` — `{ verified: true, session }`

---

### GET /api/auth/me 🔒
Get the current user's profile, session, and credentials.

**Response:** `200` — `{ user, session, credentials[] }`

---

### DELETE /api/auth/session 🔒
Logout / destroy the current session.

**Response:** `200` — `{ success: true }`

---

## Approvals

### POST /api/approvals 🔒
Create a new approval request. Supports `Idempotency-Key` header.

| Field | Type | Required |
|---|---|---|
| policyName | string | ✅ |
| actionType | string | ✅ |
| actionPayload | object | ❌ |

**Response:** `201` — `{ id, status, policyName, quorumThreshold, ... }`

---

### GET /api/approvals/pending 🔒
List pending approvals the current user can vote on.

**Response:** `200` — `{ approvals[] }`

---

### GET /api/approvals/all 🔒
List all approval requests (paginated).

| Query | Type | Default |
|---|---|---|
| page | number | 1 |
| limit | number | 20 |

**Response:** `200` — `{ requests[], total, page, totalPages }`

---

### GET /api/approvals/:id 🔒
Get a specific approval request with full details including votes and quorum state.

**Response:** `200` — `{ id, status, votes[], quorum: { approveTally, threshold } }`

---

### POST /api/approvals/:id/vote/challenge 🔒
Generate a cryptographic challenge for signing a vote.

| Field | Type | Required |
|---|---|---|
| decision | string | ✅ (`approve` or `deny`) |

**Response:** `200` — `{ challenge, requestId, decision, timestamp }`

---

### POST /api/approvals/:id/vote 🔒
Submit a vote on an approval request. Supports `Idempotency-Key` header.

| Field | Type | Required |
|---|---|---|
| decision | string | ✅ (`approve` or `deny`) |
| assertion | object | ❌ (required for sensitive policies) |

> **⚠️ Sensitive policies** (`high-value-transaction`, `production-deploy`) require a WebAuthn assertion. Unsigned votes will be rejected with `403 signature_required`.

**Response:** `200` — `{ decision, quorumResult: { status, approveTally, threshold } }`

---

### GET /api/approvals/:id/votes/:voteId/verify 🔒
Independently verify a stored vote's cryptographic signature.

**Response:** `200` — `{ verified, signer, decision, timestamp, publicKeyFingerprint }`

---

## Audit

### GET /api/audit 🔒
Get paginated audit log entries (newest first).

| Query | Type | Default |
|---|---|---|
| page | number | 1 |
| limit | number | 50 (max 100) |

**Response:** `200` — `{ entries[], total, page, totalPages }`

---

### GET /api/audit/verify 🔒
Verify the integrity of the entire SHA-256 hash chain.

**Response:** `200` — `{ valid: boolean, entries: number, brokenAt: number|null, details[] }`

---

### POST /api/audit/tamper-test 🔒
Intentionally corrupt an audit log entry (demo only). Backs up original payload.

**Response:** `200` — `{ success: true, tamperedId }`

---

### POST /api/audit/tamper-test/undo 🔒
Restore the most recently tampered audit entry from backup.

**Response:** `200` — `{ success: true, restoredId }`

---

## Policies

### GET /api/policies 🔒
List all approval policies.

**Response:** `200` — `{ policies[] }`

---

### POST /api/policies 🔒 (admin only)
Create a new approval policy.

| Field | Type | Required |
|---|---|---|
| name | string | ✅ |
| quorumThreshold | number | ✅ |
| roleWeights | object | ✅ |
| expiryMinutes | number | ❌ |
| fallbackConfig | object | ❌ |
| escalationPolicy | string | ❌ |

**Response:** `201` — `{ id, name, ... }`

---

## Recovery

### POST /api/recovery/self-serve
Initiate account recovery via magic link.

| Field | Type | Required |
|---|---|---|
| email | string | ✅ |

**Response:** `200` — `{ initiated: true, demoLink }`

---

### POST /api/recovery/complete 🔒
Complete recovery by enrolling a new credential.

| Field | Type | Required |
|---|---|---|
| credential | object | ✅ |

**Response:** `200` — `{ success: true }`

---

### POST /api/recovery/credentials/revoke 🔒
Revoke a credential during recovery.

| Field | Type | Required |
|---|---|---|
| credentialId | string | ✅ |

**Response:** `200` — `{ revoked: true }`

---

### GET /api/recovery/requests 🔒 (admin only)
List all recovery requests.

**Response:** `200` — `{ requests[] }`

---

## Health

### GET /health
Health check endpoint.

**Response:** `200` — `{ status: "ok", uptime, version }`

---

## Common Headers

| Header | Purpose |
|---|---|
| `Authorization: Bearer <token>` | Session authentication |
| `Idempotency-Key: <string>` | Deduplicates POST requests (approvals, votes) |

## Error Format

All errors follow this structure:

```json
{
  "error": "error_code",
  "message": "Human-readable description"
}
```

| Code | HTTP | Meaning |
|---|---|---|
| `validation` | 400 | Missing or invalid request fields |
| `signature_required` | 403 | Sensitive policy requires WebAuthn-signed vote |
| `not_found` | 404 | Resource does not exist |
| `conflict` | 409 | Duplicate resource (user, vote) |
| `vote_failed` | 400/403/409 | Vote submission error (self-vote, duplicate, etc.) |
| `internal` | 500 | Server error |
