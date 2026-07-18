import { get } from '../lib/api.js';
import { renderNav, attachNavHandlers, getCurrentUser } from '../main.js';

/**
 * Render the dashboard page.
 */
export function renderDashboardPage() {
  const user = getCurrentUser();
  if (!user) return '';

  const degraded = localStorage.getItem('commander_degrade') === '1';

  const container = document.createElement('div');

  container.innerHTML = `
    ${renderNav()}
    <div class="page">
      <div class="container">
        <div class="page-header">
          <div class="flex justify-between items-end">
            <div>
              <h1>Dashboard</h1>
              <p>Welcome back, ${user.displayName || user.email}</p>
            </div>
            <!-- Persona Selector -->
            <div class="persona-selector" style="display: flex; gap: 0.5rem; background: var(--color-surface); padding: 0.25rem; border-radius: 20px; border: 1px solid var(--color-border);">
              <button class="btn btn-sm persona-btn" data-persona="bank">🏦 Bank Customer</button>
              <button class="btn btn-sm persona-btn" data-persona="student">🎓 Student</button>
              <button class="btn btn-sm persona-btn" data-persona="startup">🚀 Startup Developer</button>
            </div>
          </div>
        </div>
        ${user.recoveryElevatedUntil ? `
          <div class="alert alert-warning mb-lg">
            ⚠️ <strong>Elevated security mode</strong> — Your account is in recovery. Additional verification required for all actions.
            Elevated until: ${new Date(user.recoveryElevatedUntil).toLocaleString()}
          </div>
        ` : ''}

        <div class="grid-2 mb-lg">
          <div class="card">
            <div class="card-header">
              <h3>Account Info</h3>
            </div>
            <div class="flex flex-col gap-sm">
              <div class="flex justify-between">
                <span class="text-muted">Email</span>
                <span>${user.email}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted">Role</span>
                <span class="role-badge ${user.role === 'senior' ? 'senior' : user.role === 'admin' ? 'admin' : ''}">${user.role}</span>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <h3>Session</h3>
            </div>
            <div id="session-info" class="flex flex-col gap-sm">
              <span class="text-muted">Loading session info...</span>
            </div>
          </div>
        </div>

        <div class="card mb-lg">
          <div class="card-header">
            <h3>Credentials</h3>
            <p>Authentication factors registered to your account</p>
          </div>
          <div id="credentials-list">
            <span class="text-muted">Loading...</span>
          </div>
        </div>

        <div id="dynamic-dashboard-content">
          <!-- Quick actions injected here by loadPersonaContent() -->
        </div>

        <!-- Security Design Card -->
        <div class="card mb-lg">
          <div class="card-header">
            <h3>Security Architecture</h3>
            <p>Key design decisions enforced by this platform</p>
          </div>
          <div class="security-design-card">
            <div class="security-design-item">
              <span class="icon">🚫</span>
              <div>
                <span class="label">No SMS/Phone OTP</span><br>
                <span class="desc">SIM-swapping and SS7 interception make phone-based factors unsuitable. We use WebAuthn (phishing-resistant) and TOTP (offline) instead.</span>
              </div>
            </div>
            <div class="security-design-item">
              <span class="icon">🔐</span>
              <div>
                <span class="label">Phishing-Resistant Primary Factor</span><br>
                <span class="desc">WebAuthn passkeys are bound to the exact domain — credentials registered here cannot be used on any other origin.</span>
              </div>
            </div>
            <div class="security-design-item">
              <span class="icon">⏱️</span>
              <div>
                <span class="label">Step-Up Freshness per Policy</span><br>
                <span class="desc">Sensitive actions require re-verification within a policy-defined window — not a blanket session setting.</span>
              </div>
            </div>
            <div class="security-design-item">
              <span class="icon">✉️</span>
              <div>
                <span class="label">Magic Link: Recovery Only</span><br>
                <span class="desc">Our weakest factor is not offered as a convenience login option — it exists solely as a narrow recovery path when a passkey device is lost.</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Degraded Network Toggle (Demo) -->
        <div class="card mb-lg">
          <div class="card-header">
            <h3>Demo Controls</h3>
            <p>Simulate adverse conditions for judges to observe resilience</p>
          </div>
          <div class="flex gap-md items-center" style="flex-wrap: wrap;">
            <button class="degraded-toggle ${degraded ? 'active' : ''}" id="btn-toggle-degrade">
              🔌 Simulate degraded network
              ${degraded ? ' (ACTIVE)' : ''}
            </button>
            <span class="text-muted" style="font-size: 0.75rem;">
              ${degraded
                ? 'WebAuthn challenges will fail on login, forcing TOTP fallback. Toggle off to restore.'
                : 'When active, WebAuthn login will timeout — demonstrating graceful fallback to TOTP.'}
            </span>
          </div>
        </div>
      </div>
    </div>
  `;

  setTimeout(() => {
    attachNavHandlers();
    attachDashboardHandlers();
    loadSessionInfo();
  }, 0);

  return container;
}

function attachDashboardHandlers() {
  const defaultPersona = localStorage.getItem('commander_persona') || 'bank';
  
  // Set active persona button
  document.querySelectorAll('.persona-btn').forEach(btn => {
    if (btn.dataset.persona === defaultPersona) {
      btn.classList.add('btn-primary');
    }
    
    btn.addEventListener('click', (e) => {
      const p = e.target.dataset.persona;
      localStorage.setItem('commander_persona', p);
      
      // Update active state
      document.querySelectorAll('.persona-btn').forEach(b => b.classList.remove('btn-primary'));
      e.target.classList.add('btn-primary');
      
      loadPersonaContent(p);
    });
  });

  loadPersonaContent(defaultPersona);

  // Degraded network toggle
  document.getElementById('btn-toggle-degrade')?.addEventListener('click', () => {
    const current = localStorage.getItem('commander_degrade') === '1';
    localStorage.setItem('commander_degrade', current ? '0' : '1');
    // Re-render to show updated state
    const app = document.getElementById('app');
    app.innerHTML = '';
    app.appendChild(renderDashboardPage());
  });
}

function loadPersonaContent(persona) {
  const container = document.getElementById('dynamic-dashboard-content');
  if (!container) return;

  let actionsHtml = '';
  
  if (persona === 'bank') {
    actionsHtml = `
      <div class="card mb-lg">
        <div class="card-header">
          <div class="flex justify-between items-center">
            <div>
              <h3>Banking Actions</h3>
              <p>High-value transfers require 3-of-N quorum with signed approvals</p>
            </div>
            <span class="policy-badge strict">⏱️ 5 min step-up · WebAuthn only</span>
          </div>
        </div>
        <div class="flex gap-md" style="flex-wrap: wrap;">
          <button class="btn btn-primary" id="btn-action-transfer">💰 Transfer $50,000</button>
          <button class="btn btn-primary" id="btn-action-beneficiary">🔐 Add Beneficiary</button>
        </div>
        <div class="mt-md" style="font-size: 0.75rem; color: var(--color-text-muted);">
          Policy: <code>high-value-transaction</code> · Threshold: 3 · Step-up: 5 min freshness, WebAuthn required
        </div>
      </div>
    `;
  } else if (persona === 'student') {
    actionsHtml = `
      <div class="card mb-lg">
        <div class="card-header">
          <div class="flex justify-between items-center">
            <div>
              <h3>Academic Actions</h3>
              <p>Submissions use 2-of-N peer review with urgency-aware step-up</p>
            </div>
            <span class="policy-badge lenient">⏱️ 15 min step-up · TOTP accepted</span>
          </div>
        </div>
        <div class="flex gap-md" style="flex-wrap: wrap;">
          <button class="btn btn-primary" id="btn-action-publish">📢 Publish Research</button>
          <button class="btn btn-primary" id="btn-action-submit">📝 Submit Assignment</button>
        </div>
        <div class="mt-md" style="font-size: 0.75rem; color: var(--color-text-muted);">
          Policy: <code>academic-submission</code> · Threshold: 2 · Step-up: 15 min freshness, TOTP accepted (urgency-aware)
        </div>
        <div class="alert alert-info mt-md" style="font-size: 0.8125rem;">
          💡 <strong>Why a longer step-up window?</strong> Students often face tight deadlines. This policy grants a 15-minute verification window (vs. 5 min for banking) and accepts TOTP — balancing security with the "5 minutes before a deadline" urgency scenario. This is enforced server-side by the <code>academic-submission</code> policy, not a UI toggle.
        </div>
      </div>
    `;
  } else if (persona === 'startup') {
    actionsHtml = `
      <div class="card mb-lg">
        <div class="card-header">
          <div class="flex justify-between items-center">
            <div>
              <h3>Developer Actions</h3>
              <p>Production deploys require multi-party approval with idempotent webhooks</p>
            </div>
            <span class="policy-badge strict">⏱️ 5 min step-up · WebAuthn only</span>
          </div>
        </div>
        <div class="flex gap-md" style="flex-wrap: wrap;">
          <button class="btn btn-primary" id="btn-action-deploy">🚀 Deploy to Prod</button>
          <button class="btn btn-primary" id="btn-action-rotate">🔑 Rotate API Key</button>
        </div>
        <div class="mt-md" style="font-size: 0.75rem; color: var(--color-text-muted);">
          Policy: <code>production-deploy</code> · Threshold: 2 · Step-up: 5 min freshness, WebAuthn required
        </div>
      </div>
      
      <div class="card mb-lg">
        <div class="card-header">
          <h3>API & Webhooks (Illustrative)</h3>
          <p>Example curl calls for integrating the approval engine</p>
        </div>
        <div class="flex flex-col gap-sm">
          <strong>Create Approval Request (Idempotent)</strong>
          <pre style="background: var(--color-background); padding: 1rem; border-radius: 0.5rem; overflow-x: auto; font-size: 0.8125rem;">curl -X POST https://api.commander.local/v1/approvals \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Idempotency-Key: req-deploy-12345" \\
  -d '{"policyName":"production-deploy", "actionType":"deploy"}'</pre>

          <strong class="mt-sm">Verify Webhook Signature</strong>
          <pre style="background: var(--color-background); padding: 1rem; border-radius: 0.5rem; overflow-x: auto; font-size: 0.8125rem;">const sig = req.headers['x-commander-signature'];
const expected = crypto.createHmac('sha256', WEBHOOK_SECRET)
                       .update(req.rawBody)
                       .digest('hex');
if (sig !== expected) throw new Error('Invalid signature');</pre>
        </div>
      </div>
    `;
  }

  container.innerHTML = actionsHtml;
}

async function loadSessionInfo() {
  try {
    const data = await get('/auth/me');

    // Update session info
    const sessionEl = document.getElementById('session-info');
    if (sessionEl) {
      sessionEl.innerHTML = `
        <div class="flex justify-between">
          <span class="text-muted">Risk Level</span>
          <span class="badge ${data.session.riskLevel === 'low' ? 'badge-approved' : data.session.riskLevel === 'high' ? 'badge-denied' : 'badge-pending'}">${data.session.riskLevel}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-muted">Step-Up</span>
          <span>${data.session.isStepUp ? '✅ Verified' : '—'}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-muted">Last Verified</span>
          <span>${data.session.lastVerifiedAt ? new Date(data.session.lastVerifiedAt).toLocaleTimeString() : 'Never (WebAuthn needed for step-up)'}</span>
        </div>
      `;
    }

    // Update credentials list
    const credsEl = document.getElementById('credentials-list');
    if (credsEl && data.credentials) {
      if (data.credentials.length === 0) {
        credsEl.innerHTML = '<span class="text-muted">No credentials registered.</span>';
      } else {
        credsEl.innerHTML = data.credentials.map((c) => `
          <div class="flex justify-between items-center" style="padding: 0.5rem 0; border-bottom: 1px solid var(--color-border);">
            <div>
              <span>${c.type === 'webauthn' ? '🔐' : c.type === 'totp' ? '🔢' : '✉️'} ${c.type.toUpperCase()}</span>
              ${c.isBackup ? '<span class="badge badge-pending" style="margin-left: 0.5rem;">backup</span>' : ''}
            </div>
            <span class="text-muted" style="font-size: 0.8125rem;">
              ${c.lastUsed ? `Last used: ${new Date(c.lastUsed).toLocaleDateString()}` : 'Never used'}
            </span>
          </div>
        `).join('');
      }
    }
  } catch (err) {
    console.error('[dashboard] Failed to load session:', err);
  }
}
