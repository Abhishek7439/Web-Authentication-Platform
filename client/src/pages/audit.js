import { get } from '../lib/api.js';
import { renderNav, attachNavHandlers } from '../main.js';

/**
 * Render the audit log page.
 */
export function renderAuditPage() {
  const container = document.createElement('div');

  container.innerHTML = `
    ${renderNav()}
    <div class="page">
      <div class="container">
        <div class="page-header">
          <div class="flex justify-between items-center">
            <div>
              <h1>Audit Log</h1>
              <p>Cryptographic hash-chained event log — tamper-evident by design</p>
            </div>
            <div class="flex gap-sm">
              <button class="btn btn-sm" id="btn-tamper" style="background: rgba(241,196,15,0.1); color: var(--color-alert); border: 1px solid rgba(241,196,15,0.2);">
                ⚡ Break Chain (Tamper)
              </button>
              <button class="btn btn-sm" id="btn-undo-tamper" style="background: rgba(46,204,113,0.1); color: var(--color-verify); border: 1px solid rgba(46,204,113,0.2); display: none;">
                ⏪ Undo Tamper
              </button>
              <button class="btn btn-primary btn-sm" id="btn-verify-chain">
                🔗 Verify Chain
              </button>
            </div>
          </div>
        </div>

        <!-- Verification result -->
        <div id="verify-result" style="display: none;" class="mb-lg"></div>

        <!-- Audit log entries -->
        <div class="card">
          <div id="audit-entries">
            <span class="text-muted">Loading audit log...</span>
          </div>
        </div>
      </div>
    </div>
  `;

  setTimeout(() => {
    attachNavHandlers();
    attachAuditHandlers();
    loadAuditLog();
  }, 0);

  return container;
}

function attachAuditHandlers() {
  document.getElementById('btn-verify-chain')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-verify-chain');
    const resultEl = document.getElementById('verify-result');

    btn.disabled = true;
    btn.textContent = '⏳ Verifying...';

    try {
      const result = await get('/audit/verify');

      if (result.valid) {
        resultEl.className = 'alert alert-success mb-lg';
        resultEl.innerHTML = `
          <strong>✅ Cryptographic Proof Verified!</strong><br>
          Computed ${result.entries} SHA-256 links. Chain state is mathematically valid and contiguous.
        `;
      } else {
        const detailsHtml = result.details ? `
          <div style="background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 0.25rem; margin-top: 1rem; font-family: monospace; font-size: 0.8125rem;">
            <div>...</div>
            <div style="color: var(--color-verify);">Valid   [#${result.brokenAt - 1}] Hash: ${result.details[result.brokenAt - 2]?.hash || 'N/A'}</div>
            <div style="color: var(--color-alert); margin: 0.5rem 0;">BROKEN  [#${result.brokenAt}] Expected: ${result.details[result.brokenAt - 2]?.entry_hash || '...'}</div>
            <div style="color: var(--color-alert);">        Actual:   ${result.details[result.brokenAt - 1]?.hash || '...'}</div>
          </div>
        ` : '';

        resultEl.className = 'alert alert-error mb-lg';
        resultEl.innerHTML = `
          <strong>🚨 TAMPERING DETECTED at entry #${result.brokenAt}!</strong><br>
          The payload or timestamp of entry #${result.brokenAt} was modified. The computed SHA-256 hash no longer matches the expected hash.
          ${detailsHtml}
        `;
        document.getElementById('btn-undo-tamper').style.display = 'inline-block';
      }

      resultEl.style.display = 'block';
    } catch (err) {
      resultEl.className = 'alert alert-error mb-lg';
      resultEl.innerHTML = `Failed to verify: ${err.message}`;
      resultEl.style.display = 'block';
    }

    btn.disabled = false;
    btn.textContent = '🔗 Verify Chain';
  });

  document.getElementById('btn-tamper')?.addEventListener('click', async () => {
    try {
      const { post } = await import('../lib/api.js');
      await post('/audit/tamper-test', {});
      document.getElementById('btn-undo-tamper').style.display = 'inline-block';
      loadAuditLog();
      
      const resultEl = document.getElementById('verify-result');
      resultEl.className = 'alert alert-warning mb-lg';
      resultEl.innerHTML = '<strong>⚡ Entry Tampered</strong><br>Run verification to see the broken cryptographic proof.';
      resultEl.style.display = 'block';
    } catch (err) {
      alert(`Tamper failed: ${err.message}`);
    }
  });

  document.getElementById('btn-undo-tamper')?.addEventListener('click', async () => {
    try {
      const { post } = await import('../lib/api.js');
      await post('/audit/tamper-test/undo', {});
      document.getElementById('btn-undo-tamper').style.display = 'none';
      loadAuditLog();
      
      const resultEl = document.getElementById('verify-result');
      resultEl.className = 'alert alert-success mb-lg';
      resultEl.innerHTML = '<strong>⏪ Tamper Reversed</strong><br>Run verification again to ensure the chain is restored.';
      resultEl.style.display = 'block';
    } catch (err) {
      alert(`Undo failed: ${err.message}`);
    }
  });
}

async function loadAuditLog() {
  const el = document.getElementById('audit-entries');
  if (!el) return;

  try {
    const data = await get('/audit');

    if (data.entries.length === 0) {
      el.innerHTML = '<span class="text-muted">No audit entries yet.</span>';
      return;
    }

    // Render as chain-link visualization
    el.innerHTML = data.entries.map((entry, i) => {
      const eventIcons = {
        system_initialized: '🏁',
        policy_created: '📋',
        approval_requested: '📝',
        vote_submitted: '🗳️',
        approval_approved: '✅',
        approval_denied: '❌',
        approval_expired: '⏰',
        user_registered: '👤',
        login_success: '🔓',
        step_up_verified: '🔐',
        recovery_initiated: '🔑',
        credential_revoked: '🚫',
        credential_enrolled: '🆕',
        recovery_completed: '✅',
      };

      const icon = eventIcons[entry.eventType] || '📌';
      const isNew = i === 0;

      return `
        <div class="chain-entry ${isNew ? 'new' : ''}">
          <div class="chain-dot verified">⛓</div>
          <div class="chain-content">
            <div class="flex justify-between items-center">
              <strong>${icon} ${entry.eventType.replace(/_/g, ' ')}</strong>
              <span class="text-muted" style="font-size: 0.75rem;">
                ${new Date(entry.timestamp).toLocaleString()}
              </span>
            </div>
            ${entry.actorName ? `<span class="text-muted" style="font-size: 0.8125rem;">by ${entry.actorName} (${entry.actorEmail})</span>` : ''}
            <div class="chain-hash">
              ${entry.entryHash.substring(0, 16)}...${entry.entryHash.substring(entry.entryHash.length - 8)}
            </div>
            ${Object.keys(entry.payload).length > 0 ? `
              <details style="margin-top: 0.25rem;">
                <summary class="text-muted" style="font-size: 0.75rem; cursor: pointer;">Payload</summary>
                <pre style="font-size: 0.75rem; margin-top: 0.25rem; color: var(--color-text-muted); white-space: pre-wrap; word-break: break-all;">${JSON.stringify(entry.payload, null, 2)}</pre>
              </details>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    el.innerHTML = `<span class="text-muted">Failed to load audit log: ${err.message}</span>`;
  }
}
