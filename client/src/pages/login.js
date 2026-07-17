import { post } from '../lib/api.js';
import { setToken } from '../lib/api.js';
import { navigate, setCurrentUser } from '../main.js';
import { loginWithWebAuthn } from '../lib/webauthn.js';

/**
 * Render the login page.
 */
export function renderLoginPage() {
  const container = document.createElement('div');
  container.className = 'auth-container';

  container.innerHTML = `
    <div class="auth-card">
      <div class="card">
        <h1>Welcome back</h1>
        <p class="subtitle">Sign in to Commander Auth</p>

        <div id="login-error" class="alert alert-error" style="display: none;"></div>

        <div class="form-group">
          <label for="login-email">Email address</label>
          <input type="email" id="login-email" class="form-input" placeholder="alice@demo.local" autocomplete="email" />
        </div>

        <button class="btn btn-primary btn-block" id="btn-webauthn-login">
          🔐 Sign in with Passkey
        </button>

        <div class="auth-divider">or</div>

        <div class="flex flex-col gap-sm">
          <button class="btn btn-outline btn-block" id="btn-totp-login">
            🔢 Sign in with TOTP
          </button>
          <button class="btn btn-outline btn-block" id="btn-magic-login">
            ✉️ Send Magic Link
          </button>
        </div>

        <!-- TOTP form (hidden by default) -->
        <div id="totp-section" style="display: none;" class="mt-lg">
          <div class="form-group">
            <label for="totp-code">6-digit code from authenticator app</label>
            <input type="text" id="totp-code" class="form-input" placeholder="123456" maxlength="6" autocomplete="one-time-code" />
          </div>
          <button class="btn btn-primary btn-block" id="btn-totp-verify">Verify Code</button>
        </div>

        <!-- Magic link result (hidden by default) -->
        <div id="magic-section" style="display: none;" class="mt-lg">
          <div class="alert alert-info" id="magic-link-result"></div>
        </div>

        <div class="mt-lg text-center">
          <span class="text-muted">Don't have an account? </span>
          <a href="#/register">Register</a>
        </div>
      </div>
    </div>
  `;

  // Attach handlers after DOM insertion
  setTimeout(() => attachLoginHandlers(), 0);

  return container;
}

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

  // WebAuthn login
  document.getElementById('btn-webauthn-login')?.addEventListener('click', async () => {
    hideError();
    const email = emailInput?.value?.trim();

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
    document.getElementById('magic-section').style.display = 'none';
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

  // Magic link
  document.getElementById('btn-magic-login')?.addEventListener('click', async () => {
    hideError();
    const email = emailInput?.value?.trim();

    if (!email) {
      return showError('Email is required for magic link.');
    }

    try {
      const result = await post('/auth/magic-link/send', { email });
      document.getElementById('totp-section').style.display = 'none';
      const magicSection = document.getElementById('magic-section');
      magicSection.style.display = 'block';

      if (result.demoLink) {
        document.getElementById('magic-link-result').innerHTML = `
          Magic link generated (demo mode):<br>
          <a href="${result.demoLink}" style="word-break: break-all;">${result.demoLink}</a>
        `;
      } else {
        document.getElementById('magic-link-result').textContent = result.message;
      }
    } catch (err) {
      showError(err.message || 'Failed to send magic link.');
    }
  });
}
