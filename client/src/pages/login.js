import { post } from '../lib/api.js';
import { setToken } from '../lib/api.js';
import { navigate, setCurrentUser } from '../main.js';
import { loginWithWebAuthn } from '../lib/webauthn.js';

/**
 * Check if degraded network simulation is active.
 */
function isDegradedMode() {
  return localStorage.getItem('commander_degrade') === '1' ||
    new URLSearchParams(window.location.search).get('degrade') === '1';
}

/**
 * Render the login page with floating-label inputs and risk-adaptive factor display.
 */
export function renderLoginPage() {
  const container = document.createElement('div');
  container.className = 'auth-container'; // use global centering container

  const degraded = isDegradedMode();

  container.innerHTML = `
    <div class="auth-card">
      <div class="card" style="text-align: center;">
        <!-- Brand Lockup -->
        <div class="auth-brand">
          <div class="auth-brand-icon" style="color: var(--color-verify); border-color: var(--color-verify);">⛓</div>
          <h1 class="welcome-text">Welcome Back</h1>
          <p class="subtitle" style="color: var(--color-text-muted);">Zero-password authentication</p>
        </div>

        ${degraded ? `
          <div class="degraded-banner alert-warning" style="margin-bottom: 20px;">
            🔌 <strong>Simulated degraded network</strong> — WebAuthn challenges will time out. Falling back to TOTP.
          </div>
        ` : ''}

        <div id="login-error" class="alert alert-error" style="display: none; margin-bottom: 20px;"></div>

        <!-- Inputs -->
        <div class="form-group">
          <input type="email" id="login-email" class="form-input" placeholder="you@example.com" autocomplete="email" />
        </div>

        <!-- Risk assessment result (shown after email entry) -->
        <div id="risk-assessment" style="display: none; margin-bottom: 20px;"></div>

        <!-- Auth method buttons (shown after risk assessment) -->
        <div id="auth-methods" style="display: none;">
          <div id="webauthn-wrapper" class="btn-auth-wrapper">
            <button class="btn btn-primary" id="btn-webauthn-login" style="width: 100%;">
              🔐 Sign in with Passkey
            </button>
            <span class="btn-auth-tooltip" id="webauthn-tooltip"></span>
          </div>

          <div class="auth-divider" style="color: var(--color-text-muted);">or</div>

          <div id="totp-wrapper" class="btn-auth-wrapper">
            <button class="btn btn-outline" id="btn-totp-login" style="width: 100%;">
              🔢 Sign in with TOTP
            </button>
            <span class="btn-auth-tooltip" id="totp-tooltip"></span>
          </div>

          <!-- TOTP form (hidden by default) -->
          <div id="totp-section" style="display: none;" class="mt-lg">
            <div class="form-group">
              <input type="text" id="totp-code" class="form-input" placeholder="6-digit authenticator code" maxlength="6" autocomplete="one-time-code" />
            </div>
            <button class="btn btn-primary" id="btn-totp-verify" style="width: 100%;">Verify Code</button>
          </div>
        </div>

        <!-- Pre-assessment prompt -->
        <div id="pre-assess-hint">
          <button class="btn btn-primary" id="btn-assess-risk" style="width: 100%;">
            Continue
          </button>
        </div>

        <!-- Footer links -->
        <div class="auth-footer" style="margin-top: 20px;">
          <div style="color: var(--color-text-muted);">
            Don't have an account? 
            <a href="#/register" style="color: var(--color-verify);">Register</a>
          </div>
          <div class="recovery-link" style="color: var(--color-text-muted); margin-top: 10px;">
            Lost your passkey? <a href="#/recovery" style="color: var(--color-verify);">Account Recovery</a>
          </div>
        </div>

        <div class="security-note" style="color: var(--color-text-muted); font-size: 0.75rem; margin-top: 30px;">
          🚫 SMS/phone-based OTP is intentionally not used. SIM-swapping and SS7 interception
          make phone-based factors unsuitable for high-assurance authentication.
        </div>
      </div>
    </div>
  `;

  // Attach handlers after DOM insertion
  setTimeout(() => {
    attachLoginHandlers();
  }, 0);

  return container;
}


// Store risk assessment result for use by handlers
let currentRiskAssessment = null;

function attachLoginHandlers() {
  const emailInput = document.getElementById('login-email');
  const errorEl = document.getElementById('login-error');

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.style.display = 'block';
  }

  function hideError() {
    errorEl.style.display = 'none';
  }

  // Assess risk on "Continue" click
  document.getElementById('btn-assess-risk')?.addEventListener('click', async () => {
    hideError();
    const email = emailInput?.value?.trim();
    if (!email) {
      return showError('Email is required.');
    }

    try {
      await performRiskAssessment(email);
    } catch (err) {
      showError(err.message || 'Risk assessment failed.');
    }
  });

  // Also assess on Enter key in email field
  emailInput?.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      hideError();
      const email = emailInput.value.trim();
      if (!email) return showError('Email is required.');
      try {
        await performRiskAssessment(email);
      } catch (err) {
        showError(err.message || 'Risk assessment failed.');
      }
    }
  });

  // WebAuthn login
  document.getElementById('btn-webauthn-login')?.addEventListener('click', async () => {
    hideError();
    const email = emailInput?.value?.trim();

    if (isDegradedMode()) {
      showError('⚡ WebAuthn timed out (degraded network simulation). Use TOTP instead.');
      return;
    }

    try {
      const result = await loginWithWebAuthn(email);
      setToken(result.token);
      setCurrentUser(result.user);
      navigate('/dashboard');
    } catch (err) {
      showError(err.message || 'WebAuthn login failed.');
    }
  });

  // TOTP toggle
  document.getElementById('btn-totp-login')?.addEventListener('click', () => {
    hideError();
    const totpSection = document.getElementById('totp-section');
    totpSection.style.display = totpSection.style.display === 'none' ? 'block' : 'none';
  });

  // TOTP verify
  document.getElementById('btn-totp-verify')?.addEventListener('click', async () => {
    hideError();
    const email = emailInput?.value?.trim();
    const code = document.getElementById('totp-code')?.value?.trim();

    if (!email || !code) {
      return showError('Email and TOTP code are required.');
    }

    try {
      const result = await post('/auth/totp/verify', { email, code });
      setToken(result.token);
      setCurrentUser(result.user);
      navigate('/dashboard');
    } catch (err) {
      showError(err.message || 'TOTP verification failed.');
    }
  });
}

async function performRiskAssessment(email) {
  const assessEl = document.getElementById('risk-assessment');
  const methodsEl = document.getElementById('auth-methods');
  const preAssessEl = document.getElementById('pre-assess-hint');

  assessEl.style.display = 'none';
  assessEl.innerHTML = '<span class="text-muted">Assessing risk...</span>';
  assessEl.style.display = 'block';

  const result = await post('/auth/risk-assess', { email });
  currentRiskAssessment = result;

  // Render risk banner
  const riskIcon = result.riskLevel === 'low' ? '🟢' : result.riskLevel === 'medium' ? '🟡' : '🔴';
  const riskLabel = result.riskLevel.charAt(0).toUpperCase() + result.riskLevel.slice(1);

  assessEl.innerHTML = `
    <div class="risk-banner risk-${result.riskLevel}">
      <span>${riskIcon}</span>
      <span><strong>${riskLabel} risk</strong> (score: <span class="risk-score">${result.score}</span>) — ${result.reason}</span>
    </div>
  `;

  // Hide pre-assess button, show auth methods
  preAssessEl.style.display = 'none';
  methodsEl.style.display = 'block';

  // Configure button states based on risk assessment
  const webauthnWrapper = document.getElementById('webauthn-wrapper');
  const totpWrapper = document.getElementById('totp-wrapper');
  const webauthnTooltip = document.getElementById('webauthn-tooltip');
  const totpTooltip = document.getElementById('totp-tooltip');

  // Check disabled factors
  const disabledMap = {};
  for (const df of result.disabledFactors) {
    disabledMap[df.method] = df.reason;
  }

  // WebAuthn
  if (disabledMap.webauthn) {
    webauthnWrapper.classList.add('disabled');
    webauthnTooltip.textContent = disabledMap.webauthn;
  } else {
    webauthnWrapper.classList.remove('disabled');
  }

  // TOTP
  if (disabledMap.totp) {
    totpWrapper.classList.add('disabled');
    totpTooltip.textContent = disabledMap.totp;
  } else {
    totpWrapper.classList.remove('disabled');
  }

  // In degraded mode, auto-expand TOTP and add visual cue to WebAuthn
  if (isDegradedMode()) {
    const totpSection = document.getElementById('totp-section');
    if (totpSection && !disabledMap.totp) {
      totpSection.style.display = 'block';
    }
    // Make WebAuthn button show degraded state
    const webauthnBtn = document.getElementById('btn-webauthn-login');
    if (webauthnBtn) {
      webauthnBtn.textContent = '🔐 Sign in with Passkey (may timeout)';
    }
  }
}
