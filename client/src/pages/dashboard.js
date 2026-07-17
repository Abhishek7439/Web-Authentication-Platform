import { get } from '../lib/api.js';
import { renderNav, attachNavHandlers, getCurrentUser } from '../main.js';

/**
 * Render the dashboard page.
 */
export function renderDashboardPage() {
  const user = getCurrentUser();
  if (!user) return '';

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
            <div class="persona-selector" style="display: flex; gap: 0.5rem; background: var(--color-surface); padding: 0.25rem; border-radius: 0.5rem; border: 1px solid var(--color-border);">
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
}

function loadPersonaContent(persona) {
  const container = document.getElementById('dynamic-dashboard-content');
  if (!container) return;

  let actionsHtml = '';
  
  if (persona === 'bank') {
    actionsHtml = `
      <div class="card mb-lg">
        <div class="card-header">
          <h3>Banking Actions</h3>
          <p>High-value transfers require 3-of-N quorum with signed approvals</p>
        </div>
        <div class="flex gap-md" style="flex-wrap: wrap;">
          <button class="btn btn-primary" id="btn-action-transfer">💰 Transfer $50,000</button>
          <button class="btn btn-primary" id="btn-action-beneficiary">🔐 Add Beneficiary</button>
        </div>
      </div>
    `;
  } else if (persona === 'student') {
    actionsHtml = `
      <div class="card mb-lg">
        <div class="card-header">
          <h3>Academic Actions</h3>
          <p>Academic submissions use 2-of-N peer review with audit trail</p>
        </div>
        <div class="flex gap-md" style="flex-wrap: wrap;">
          <button class="btn btn-primary" id="btn-action-publish">📢 Publish Research</button>
          <button class="btn btn-primary" id="btn-action-submit">📝 Submit Assignment</button>
        </div>
      </div>
    `;
  } else if (persona === 'startup') {
    actionsHtml = `
      <div class="card mb-lg">
        <div class="card-header">
          <h3>Developer Actions</h3>
          <p>Production deploys require multi-party approval with idempotent webhooks</p>
        </div>
        <div class="flex gap-md" style="flex-wrap: wrap;">
          <button class="btn btn-primary" id="btn-action-deploy">🚀 Deploy to Prod</button>
          <button class="btn btn-primary" id="btn-action-rotate">🔑 Rotate API Key</button>
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
