import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import QRCode from 'qrcode';
import { getDb } from '../db/index.js';
import {
  getRegistrationOptions,
  verifyRegistration,
  getAuthenticationOptions,
  verifyAuthentication,
  getStepUpOptions,
} from '../auth/webauthn.js';
import { createSessionToken, requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rate-limiter.js';
import { encrypt, decrypt, randomToken } from '../utils/crypto.js';
import { assessRisk, getPreviousSessions } from '../auth/risk-engine.js';
import * as OTPAuth from 'otpauth';

const router = Router();

// ──────────────────────────────────────────
// Risk Assessment (Pre-Login)
// ──────────────────────────────────────────

/**
 * POST /api/auth/risk-assess
 * Evaluate risk before login method selection.
 * Returns which auth factors are allowed given the user's risk context.
 */
router.post('/risk-assess', authLimiter, (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'validation', message: 'Email is required.' });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    // Don't leak user existence — return a generic low-risk response
    if (!user) {
      return res.json({
        riskLevel: 'low',
        score: 0,
        requiredFactors: ['webauthn', 'totp'],
        disabledFactors: [
          { method: 'magic_link', reason: 'Recovery-only. Not available for standard login.' },
        ],
        reason: 'Standard login context',
        hasPasskey: false,
        hasTotp: false,
      });
    }

    // Get previous sessions for risk comparison
    const previousSessions = getPreviousSessions(db, user.id);

    // Assess risk
    const risk = assessRisk({
      ip: req.ip,
      userAgent: req.headers['user-agent'] || '',
      user,
      authMethod: 'unknown',
      previousSessions,
    });

    // Check what credentials the user has registered
    const hasPasskey = !!db.prepare(
      "SELECT 1 FROM credentials WHERE user_id = ? AND type = 'webauthn' AND revoked_at IS NULL"
    ).get(user.id);
    const hasTotp = !!db.prepare(
      "SELECT 1 FROM credentials WHERE user_id = ? AND type = 'totp' AND revoked_at IS NULL"
    ).get(user.id);

    // Determine allowed factors based on risk level
    const requiredFactors = [];
    const disabledFactors = [];

    // Magic link is ALWAYS disabled for login (recovery-only)
    disabledFactors.push({
      method: 'magic_link',
      reason: 'Recovery-only. Not available for standard login.',
    });

    if (risk.level === 'high') {
      // High risk: only WebAuthn allowed
      requiredFactors.push('webauthn');
      const reasons = [];
      if (risk.factors.includes('new-device')) reasons.push('new device detected');
      if (risk.factors.some(f => f.startsWith('new-country'))) reasons.push('new geographic location');
      if (risk.factors.includes('recovery-active') || risk.factors.includes('within-recovery-elevation-window')) {
        reasons.push('post-recovery elevated security');
      }
      const reasonStr = reasons.length > 0 ? reasons.join(', ') : 'elevated risk context';

      disabledFactors.push({
        method: 'totp',
        reason: `${reasonStr.charAt(0).toUpperCase() + reasonStr.slice(1)} — passkey verification required.`,
      });
    } else {
      // Low/medium risk: WebAuthn and TOTP both allowed
      requiredFactors.push('webauthn');
      if (hasTotp) requiredFactors.push('totp');
    }

    const reason = risk.level === 'low'
      ? 'Known device, standard context'
      : risk.level === 'medium'
      ? 'Moderate risk factors detected'
      : 'Elevated risk — restricted to highest-assurance factor';

    res.json({
      riskLevel: risk.level,
      score: risk.score,
      requiredFactors,
      disabledFactors,
      reason,
      factors: risk.factors,
      hasPasskey,
      hasTotp,
    });
  } catch (err) {
    console.error('[auth/risk-assess]', err);
    res.status(500).json({ error: 'internal', message: 'Risk assessment failed.' });
  }
});

// ──────────────────────────────────────────
// User Registration
// ──────────────────────────────────────────

/**
 * POST /api/auth/register
 * Create a new user account.
 */
router.post('/register', authLimiter, (req, res) => {
  try {
    const { email, displayName } = req.body;

    if (!email || !displayName) {
      return res.status(400).json({ error: 'validation', message: 'Email and display name are required.' });
    }

    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: 'conflict', message: 'An account with this email already exists.' });
    }

    const userId = uuidv4();
    db.prepare(`
      INSERT INTO users (id, email, display_name, role)
      VALUES (?, ?, ?, 'member')
    `).run(userId, email, displayName);

    const user = { id: userId, email, displayName, role: 'member' };
    
    // Create initial session for onboarding (TOTP/WebAuthn setup)
    const sessionId = uuidv4();
    db.prepare(`
      INSERT INTO sessions (id, user_id, device_fingerprint, ip_address, risk_level, expires_at)
      VALUES (?, ?, ?, ?, 'low', datetime('now', '+24 hours'))
    `).run(sessionId, userId, req.headers['user-agent'] || '', req.ip);
    
    const token = createSessionToken({ id: userId, email, display_name: displayName, role: 'member' }, sessionId);

    res.status(201).json({
      user,
      token
    });
  } catch (err) {
    console.error('[auth/register]', err);
    res.status(500).json({ error: 'internal', message: 'Registration failed.' });
  }
});

// ──────────────────────────────────────────
// WebAuthn Registration
// ──────────────────────────────────────────

/**
 * POST /api/auth/webauthn/register-options
 * Generate WebAuthn registration challenge.
 */
router.post('/webauthn/register-options', authLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'validation', message: 'Email is required.' });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      return res.status(404).json({ error: 'not_found', message: 'User not found.' });
    }

    const options = await getRegistrationOptions(user);
    res.json(options);
  } catch (err) {
    console.error('[auth/webauthn/register-options]', err);
    res.status(500).json({ error: 'internal', message: 'Failed to generate registration options.' });
  }
});

/**
 * POST /api/auth/webauthn/register-verify
 * Verify WebAuthn registration response and store credential.
 */
router.post('/webauthn/register-verify', authLimiter, async (req, res) => {
  try {
    const { email, attestation } = req.body;
    if (!email || !attestation) {
      return res.status(400).json({ error: 'validation', message: 'Email and attestation are required.' });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      return res.status(404).json({ error: 'not_found', message: 'User not found.' });
    }

    const result = await verifyRegistration(user, attestation);

    // Create a session for the user after successful registration
    const sessionId = uuidv4();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO sessions (id, user_id, device_fingerprint, ip_address, risk_level, last_verified_at, expires_at)
      VALUES (?, ?, ?, ?, 'low', ?, datetime('now', '+24 hours'))
    `).run(sessionId, user.id, req.headers['user-agent'] || '', req.ip, now);

    const token = createSessionToken(user, sessionId);

    res.json({
      verified: result.verified,
      token,
      user: { id: user.id, email: user.email, displayName: user.display_name, role: user.role },
    });
  } catch (err) {
    console.error('[auth/webauthn/register-verify]', err);
    res.status(400).json({ error: 'verification_failed', message: err.message });
  }
});

// ──────────────────────────────────────────
// WebAuthn Authentication
// ──────────────────────────────────────────

/**
 * POST /api/auth/webauthn/login-options
 * Generate WebAuthn authentication challenge.
 */
router.post('/webauthn/login-options', authLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    const options = await getAuthenticationOptions(email);
    res.json(options);
  } catch (err) {
    console.error('[auth/webauthn/login-options]', err);
    res.status(500).json({ error: 'internal', message: 'Failed to generate login options.' });
  }
});

/**
 * POST /api/auth/webauthn/login-verify
 * Verify WebAuthn authentication response.
 */
router.post('/webauthn/login-verify', authLimiter, async (req, res) => {
  try {
    const { assertion } = req.body;
    if (!assertion) {
      return res.status(400).json({ error: 'validation', message: 'Assertion is required.' });
    }

    const user = await verifyAuthentication(assertion);

    // Create session with last_verified_at = now
    const db = getDb();
    const sessionId = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO sessions (id, user_id, device_fingerprint, ip_address, risk_level, last_verified_at, expires_at)
      VALUES (?, ?, ?, ?, 'low', ?, datetime('now', '+24 hours'))
    `).run(sessionId, user.id, req.headers['user-agent'] || '', req.ip, now);

    const token = createSessionToken(user, sessionId);

    res.json({
      token,
      user: { id: user.id, email: user.email, displayName: user.display_name, role: user.role },
    });
  } catch (err) {
    console.error('[auth/webauthn/login-verify]', err);
    res.status(400).json({ error: 'authentication_failed', message: err.message });
  }
});

// ──────────────────────────────────────────
// Step-Up Authentication
// ──────────────────────────────────────────

/**
 * POST /api/auth/step-up/options
 * Generate a step-up WebAuthn challenge.
 */
router.post('/step-up/options', requireAuth, async (req, res) => {
  try {
    const options = await getStepUpOptions(req.user, req.body.actionPayload || {});
    res.json(options);
  } catch (err) {
    console.error('[auth/step-up/options]', err);
    res.status(500).json({ error: 'internal', message: 'Failed to generate step-up options.' });
  }
});

/**
 * POST /api/auth/step-up/verify
 * Verify a step-up WebAuthn assertion and update last_verified_at.
 */
router.post('/step-up/verify', requireAuth, async (req, res) => {
  try {
    const { assertion } = req.body;
    if (!assertion) {
      return res.status(400).json({ error: 'validation', message: 'Assertion is required.' });
    }

    const user = await verifyAuthentication(assertion);

    if (user.id !== req.user.id) {
      return res.status(403).json({ error: 'forbidden', message: 'Step-up credential does not match session user.' });
    }

    // Update last_verified_at on current session
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE sessions SET last_verified_at = ?, is_step_up = 1 WHERE id = ?
    `).run(now, req.session.id);

    res.json({ verified: true, lastVerifiedAt: now });
  } catch (err) {
    console.error('[auth/step-up/verify]', err);
    res.status(400).json({ error: 'step_up_failed', message: err.message });
  }
});

// ──────────────────────────────────────────
// Magic Link (Demo Mode)
// ──────────────────────────────────────────

/**
 * POST /api/auth/magic-link/send
 * Generate a magic link. In demo mode, returns the link directly.
 */
router.post('/magic-link/send', authLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'validation', message: 'Email is required.' });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      // Don't leak user existence — return success anyway
      return res.json({ sent: true, message: 'If an account exists, a magic link has been sent.' });
    }

    const token = randomToken(32);

    // Store encrypted token as a credential
    const credId = uuidv4();
    const credentialData = JSON.stringify({
      token: encrypt(token),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      consumed: false,
    });

    db.prepare(`
      INSERT INTO credentials (id, user_id, type, credential_data, is_backup)
      VALUES (?, ?, 'magic_link', ?, 0)
    `).run(credId, user.id, credentialData);

    const origin = `${req.protocol}://${req.get('host')}`;
    const magicLink = `${origin}/#/magic-link/${token}`;

    // Demo mode: return the link directly
    res.json({
      sent: true,
      message: 'Magic link generated.',
      demoLink: magicLink,
      token: token,
    });
  } catch (err) {
    console.error('[auth/magic-link/send]', err);
    res.status(500).json({ error: 'internal', message: 'Failed to generate magic link.' });
  }
});

/**
 * GET /api/auth/magic-link/verify/:token
 * Consume a magic link and create a session.
 */
router.get('/magic-link/verify/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const db = getDb();

    // Find the matching magic link credential
    const allMagicLinks = db.prepare(`
      SELECT c.*, u.id as uid, u.email, u.display_name, u.role
      FROM credentials c
      JOIN users u ON c.user_id = u.id
      WHERE c.type = 'magic_link' AND c.revoked_at IS NULL
      ORDER BY c.created_at DESC
      LIMIT 100
    `).all();

    let matched = null;
    for (const ml of allMagicLinks) {
      try {
        const data = JSON.parse(ml.credential_data);
        const decryptedToken = decrypt(data.token);
        if (decryptedToken === token && !data.consumed && new Date(data.expiresAt) > new Date()) {
          matched = { cred: ml, data };
          break;
        }
      } catch (e) {
        continue; // Skip invalid entries
      }
    }

    if (!matched) {
      return res.status(400).json({ error: 'invalid_token', message: 'Magic link is invalid or expired.' });
    }

    // Mark as consumed
    const updatedData = { ...matched.data, consumed: true };
    db.prepare('UPDATE credentials SET credential_data = ? WHERE id = ?')
      .run(JSON.stringify(updatedData), matched.cred.id);

    // Create session (no last_verified_at — magic link is not WebAuthn)
    const sessionId = uuidv4();
    db.prepare(`
      INSERT INTO sessions (id, user_id, device_fingerprint, ip_address, risk_level, expires_at)
      VALUES (?, ?, ?, ?, 'medium', datetime('now', '+24 hours'))
    `).run(sessionId, matched.cred.uid, req.headers['user-agent'] || '', req.ip);

    const user = {
      id: matched.cred.uid,
      email: matched.cred.email,
      display_name: matched.cred.display_name,
      role: matched.cred.role,
    };

    const tokenJwt = createSessionToken(user, sessionId);

    res.json({
      token: tokenJwt,
      user: { id: user.id, email: user.email, displayName: user.display_name, role: user.role },
    });
  } catch (err) {
    console.error('[auth/magic-link/verify]', err);
    res.status(500).json({ error: 'internal', message: 'Failed to verify magic link.' });
  }
});

// ──────────────────────────────────────────
// TOTP
// ──────────────────────────────────────────

/**
 * POST /api/auth/totp/setup
 * Generate a TOTP secret and return the QR URI.
 */
router.post('/totp/setup', requireAuth, async (req, res) => {
  try {
    const db = getDb();

    const totp = new OTPAuth.TOTP({
      issuer: 'Commander Auth',
      label: req.user.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: new OTPAuth.Secret({ size: 20 }),
    });

    const credId = uuidv4();
    const credentialData = JSON.stringify({
      secret: encrypt(totp.secret.base32),
      uri: totp.toString(),
    });

    db.prepare(`
      INSERT INTO credentials (id, user_id, type, credential_data, is_backup)
      VALUES (?, ?, 'totp', ?, 0)
    `).run(credId, req.user.id, credentialData);

    const qrCode = await QRCode.toDataURL(totp.toString());

    res.json({
      uri: totp.toString(),
      secret: totp.secret.base32, // Shown once for manual entry
      qrCode,
    });
  } catch (err) {
    console.error('[auth/totp/setup]', err);
    res.status(500).json({ error: 'internal', message: 'Failed to set up TOTP.' });
  }
});

/**
 * POST /api/auth/totp/verify
 * Validate a TOTP code. Can be used for login or step-up.
 */
router.post('/totp/verify', authLimiter, async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ error: 'validation', message: 'Email and code are required.' });
    }

    const db = getDb();

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      return res.status(401).json({ error: 'authentication_failed', message: 'Invalid credentials.' });
    }

    const totpCred = db.prepare(`
      SELECT * FROM credentials
      WHERE user_id = ? AND type = 'totp' AND revoked_at IS NULL
      ORDER BY created_at DESC LIMIT 1
    `).get(user.id);

    if (!totpCred) {
      return res.status(400).json({ error: 'no_totp', message: 'TOTP not set up for this account.' });
    }

    const credData = JSON.parse(totpCred.credential_data);
    const secret = decrypt(credData.secret);

    const totp = new OTPAuth.TOTP({
      issuer: 'Commander Auth',
      label: user.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });

    const delta = totp.validate({ token: code, window: 1 });

    if (delta === null) {
      return res.status(401).json({ error: 'invalid_code', message: 'Invalid TOTP code.' });
    }

    // Update last_used
    db.prepare('UPDATE credentials SET last_used = datetime(\'now\') WHERE id = ?').run(totpCred.id);

    // Create session (no last_verified_at — TOTP is not WebAuthn)
    const sessionId = uuidv4();
    db.prepare(`
      INSERT INTO sessions (id, user_id, device_fingerprint, ip_address, risk_level, expires_at)
      VALUES (?, ?, ?, ?, 'low', datetime('now', '+24 hours'))
    `).run(sessionId, user.id, req.headers['user-agent'] || '', req.ip);

    const token = createSessionToken(user, sessionId);

    res.json({
      token,
      user: { id: user.id, email: user.email, displayName: user.display_name, role: user.role },
    });
  } catch (err) {
    console.error('[auth/totp/verify]', err);
    res.status(500).json({ error: 'internal', message: 'TOTP verification failed.' });
  }
});

// ──────────────────────────────────────────
// Session Management
// ──────────────────────────────────────────

/**
 * GET /api/auth/me
 * Get current user info + session details.
 */
router.get('/me', requireAuth, (req, res) => {
  const db = getDb();

  // Get user's credentials (types only, not secrets)
  const credentials = db.prepare(`
    SELECT id, type, is_backup, created_at, last_used, revoked_at
    FROM credentials WHERE user_id = ? AND revoked_at IS NULL
  `).all(req.user.id);

  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      displayName: req.user.display_name,
      role: req.user.role,
      recoveryStatus: req.user.recovery_status,
      recoveryElevatedUntil: req.user.recovery_elevated_until,
    },
    session: {
      id: req.session.id,
      riskLevel: req.session.risk_level,
      isStepUp: !!req.session.is_step_up,
      lastVerifiedAt: req.session.last_verified_at,
      expiresAt: req.session.expires_at,
    },
    credentials: credentials.map((c) => ({
      id: c.id,
      type: c.type,
      isBackup: !!c.is_backup,
      createdAt: c.created_at,
      lastUsed: c.last_used,
    })),
  });
});

/**
 * DELETE /api/auth/session
 * Logout — destroy current session.
 */
router.delete('/session', requireAuth, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM sessions WHERE id = ?').run(req.session.id);
  res.json({ loggedOut: true });
});

export default router;
