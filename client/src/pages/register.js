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
      await post('/auth/register', { email, displayName });
      createdEmail = email;

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
      setToken(result.token);
      setCurrentUser(result.user);
      navigate('/dashboard');
    } catch (err) {
      showError(err.message || 'Passkey registration failed.');
    }
  });

  // Skip passkey (use TOTP/magic link later)
  document.getElementById('btn-skip-passkey')?.addEventListener('click', () => {
    navigate('/login');
  });
}
