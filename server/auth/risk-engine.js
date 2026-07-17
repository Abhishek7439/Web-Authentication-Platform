import geoip from 'geoip-lite';

/**
 * Compute a risk score (0-100) for a given auth context.
 * Inputs: IP address, user-agent (device fingerprint), user's recovery status.
 *
 * Risk levels:
 *  low    (0-30)  — known device, known region, no recovery
 *  medium (31-65) — new device OR new region OR TOTP/magic-link login
 *  high   (66-100) — recovery active, multiple risk factors, or suspicious context
 */
export function assessRisk({ ip, userAgent, user, authMethod = 'webauthn', previousSessions = [] }) {
  let score = 0;
  const factors = [];

  // ── Auth method factor ─────────────────────
  // WebAuthn = 0 (strongest), TOTP = 10, magic-link = 20
  const methodScores = { webauthn: 0, totp: 10, magic_link: 20 };
  score += methodScores[authMethod] ?? 15;
  if (authMethod !== 'webauthn') {
    factors.push(`auth-method:${authMethod}`);
  }

  // ── Recovery status ────────────────────────
  if (user?.recovery_status === 'active') {
    score += 40;
    factors.push('recovery-active');
  } else if (user?.recovery_status === 'pending') {
    score += 15;
    factors.push('recovery-pending');
  }

  // ── Recovery elevated window ───────────────
  if (user?.recovery_elevated_until) {
    const until = new Date(user.recovery_elevated_until);
    if (until > new Date()) {
      score += 30;
      factors.push('within-recovery-elevation-window');
    }
  }

  // ── New device (user-agent not seen before) ─
  const knownAgents = previousSessions.map(s => s.device_fingerprint).filter(Boolean);
  const isKnownDevice = userAgent && knownAgents.includes(userAgent);
  if (!isKnownDevice && previousSessions.length > 0) {
    score += 15;
    factors.push('new-device');
  }

  // ── Geo-IP: new country/region ─────────────
  if (ip && ip !== '::1' && ip !== '127.0.0.1') {
    const geo = geoip.lookup(ip);
    if (geo) {
      const knownCountries = new Set(previousSessions.map(s => {
        try {
          const profile = JSON.parse(s.risk_profile || '{}');
          return profile.country;
        } catch { return null; }
      }).filter(Boolean));

      if (knownCountries.size > 0 && !knownCountries.has(geo.country)) {
        score += 25;
        factors.push(`new-country:${geo.country}`);
      }
    }
  }

  const level = score <= 30 ? 'low' : score <= 65 ? 'medium' : 'high';

  return {
    score: Math.min(score, 100),
    level,
    factors,
    requiresStepUp: level === 'high' || user?.recovery_elevated_until
      ? new Date(user?.recovery_elevated_until) > new Date()
      : false,
    recommendedFactors: getRecommendedFactors(level, authMethod),
  };
}

/**
 * Given risk level and current auth method, recommend which factors to require.
 */
function getRecommendedFactors(level, currentMethod) {
  if (level === 'low') {
    return currentMethod === 'webauthn' ? ['webauthn'] : ['webauthn', currentMethod];
  }
  if (level === 'medium') {
    return ['webauthn', 'totp'];
  }
  // high
  return ['webauthn', 'totp', 'step-up'];
}

/**
 * Get a user's previous sessions for risk comparison.
 */
export function getPreviousSessions(db, userId, limit = 10) {
  return db.prepare(`
    SELECT device_fingerprint, ip_address, risk_profile, created_at
    FROM sessions
    WHERE user_id = ? AND id != (SELECT id FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1)
    ORDER BY created_at DESC
    LIMIT ?
  `).all(userId, userId, limit);
}
