import { post, setToken } from '../lib/api.js';
import { navigate, setCurrentUser } from '../main.js';
import { registerCredential } from '../lib/webauthn.js';

/**
 * Render the registration page.
 */
export function renderRegisterPage() {
  const container = document.createElement('div');
  container.className = 'auth-container';

  container.innerHTML = `
    <div class="auth-card">
      <div class="card">
        <h1>Create account</h1>
        <p class="subtitle">Register with Commander Auth</p>

        <div id="register-error" class="alert alert-error" style="display: none;"></div>
        <div id="register-success" class="alert alert-success" style="display: none;"></div>

        <!-- Step 1: Account details -->
        <div id="step-1">
          <div class="form-group">
            <label for="reg-email">Email address</label>
            <input type="email" id="reg-email" class="form-input" placeholder="you@example.com" autocomplete="email" />
          </div>
          <div class="form-group">
            <label for="reg-name">Display name</label>
            <input type="text" id="reg-name" class="form-input" placeholder="Your name" />
          </div>
          <button class="btn btn-primary btn-block" id="btn-create-account">Create Account</button>
        </div>

        <!-- Step 2: WebAuthn registration -->
        <div id="step-2" style="display: none;">
          <div class="alert alert-info">
            Account created! Now register a passkey to secure your account.
          </div>
          <button class="btn btn-primary btn-block mt-md" id="btn-register-passkey">
            🔐 Register Passkey
          </button>
          <button class="btn btn-outline btn-block mt-sm" id="btn-skip-passkey">
            Skip for now
          </button>
        </div>

        <!-- Step 3: TOTP registration -->
        <div id="step-3" style="display: none;">
          <div class="alert alert-info">
            Scan this QR code with your Authenticator App (e.g. Google Authenticator).
          </div>
          <div id="totp-qr-container" style="text-align: center; margin: 20px 0;">
            <img id="totp-qr-image" src="" alt="QR Code" style="border-radius: 8px; max-width: 200px;" />
          </div>
          <div class="form-group">
            <label>Or enter this secret manually:</label>
            <code id="totp-secret-text" style="display: block; padding: 10px; background: rgba(255,255,255,0.05); text-align: center; letter-spacing: 2px;"></code>
          </div>
          <button class="btn btn-primary btn-block mt-md" id="btn-finish-setup">
            Done
          </button>
        </div>

        <div class="mt-lg text-center">
          <span class="text-muted">Already have an account? </span>
          <a href="#/login">Sign in</a>
        </div>
      </div>
    </div>
  `;

  setTimeout(() => attachRegisterHandlers(), 0);

  return container;
}

function attachRegisterHandlers() {
  const errorEl = document.getElementById('register-error');
  let createdEmail = null;

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.style.display = 'block';
  }

  function hideError() {
    errorEl.style.display = 'none';
  }

  // Step 1: Create account
  document.getElementById('btn-create-account')?.addEventListener('click', async () => {
    hideError();
    const email = document.getElementById('reg-email')?.value?.trim();
    const displayName = document.getElementById('reg-name')?.value?.trim();

    if (!email || !displayName) {
      return showError('Email and display name are required.');
    }

    try {
      const response = await post('/auth/register', { email, displayName });
      createdEmail = email;
      
      // Store token immediately to allow TOTP setup
      setToken(response.token);
      setCurrentUser(response.user);

      // Show step 2
      document.getElementById('step-1').style.display = 'none';
      document.getElementById('step-2').style.display = 'block';
    } catch (err) {
      showError(err.message || 'Registration failed.');
    }
  });

  // Step 2: Register passkey
  document.getElementById('btn-register-passkey')?.addEventListener('click', async () => {
    hideError();
    if (!createdEmail) return showError('No account found. Please start over.');

    try {
      const result = await registerCredential(createdEmail);
      setToken(result.token); // update with the fully verified token
      setCurrentUser(result.user);
      navigate('/dashboard');
    } catch (err) {
      showError(err.message || 'Passkey registration failed.');
    }
  });

  // Skip passkey -> Show TOTP Setup
  document.getElementById('btn-skip-passkey')?.addEventListener('click', async () => {
    hideError();
    try {
      const result = await post('/auth/totp/setup');
      document.getElementById('totp-qr-image').src = result.qrCode;
      document.getElementById('totp-secret-text').textContent = result.secret;
      
      document.getElementById('step-2').style.display = 'none';
      document.getElementById('step-3').style.display = 'block';
    } catch (err) {
      showError(err.message || 'Failed to generate TOTP setup.');
    }
  });

  // Finish TOTP Setup -> Go to Dashboard
  document.getElementById('btn-finish-setup')?.addEventListener('click', () => {
    navigate('/dashboard');
  });
}
