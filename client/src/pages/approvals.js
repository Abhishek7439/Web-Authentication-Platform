import { get, post } from '../lib/api.js';
import { renderNav, attachNavHandlers, getCurrentUser } from '../main.js';
import { connectRealtime, onRealtimeEvent, showToast } from '../lib/realtime.js';

/**
 * Render the approvals page.
 */
export function renderApprovalsPage() {
  const user = getCurrentUser();
  if (!user) return '';

  const container = document.createElement('div');

  container.innerHTML = `
    ${renderNav()}
    <div class="page">
      <div class="container">
        <div class="page-header">
          <h1>Approvals</h1>
          <p>Manage approval requests and submit your votes</p>
        </div>

        <!-- Create new request -->
        <div class="card mb-lg">
          <div class="card-header">
            <h3>Create Approval Request</h3>
            <p>Initiate a new action that requires approval</p>
          </div>
          <div id="create-error" class="alert alert-error" style="display: none;"></div>
          <div id="create-success" class="alert alert-success" style="display: none;"></div>
          <div class="flex gap-md" style="flex-wrap: wrap; align-items: flex-end;">
            <div class="form-group" style="flex: 1; min-width: 200px; margin-bottom: 0;">
              <label for="action-type">Action Type</label>
              <select id="action-type" class="form-input">
                <option value="high-value-transfer">💰 High Value Transfer ($10,000+)</option>
                <option value="production-deploy">🚀 Production Deploy</option>
                <option value="account-recovery">🔑 Account Recovery</option>
              </select>
            </div>
            <div class="form-group" style="flex: 1; min-width: 200px; margin-bottom: 0;">
              <label for="policy-select">Policy</label>
              <select id="policy-select" class="form-input">
                <option value="high-value-transaction">high-value-transaction (threshold 3)</option>
                <option value="production-deploy">production-deploy (threshold 2)</option>
                <option value="account-recovery">account-recovery (threshold 2)</option>
              </select>
            </div>
            <button class="btn btn-primary" id="btn-create-request">Submit Request</button>
          </div>
        </div>

        <!-- Pending approvals for current user -->
        <div class="card mb-lg">
          <div class="card-header">
            <h3>Pending for Your Vote</h3>
            <p>Approval requests waiting for your decision</p>
          </div>
          <div id="pending-list">
            <span class="text-muted">Loading...</span>
          </div>
        </div>

        <!-- All approvals -->
        <div class="card">
          <div class="card-header">
            <h3>All Requests</h3>
            <p>Full history of approval requests</p>
          </div>
          <div id="all-approvals">
            <span class="text-muted">Loading...</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Verify Signature Modal -->
    <div id="verify-modal" class="modal-overlay" style="display: none;">
      <div class="modal">
        <div class="modal-header">
          <h3>Verify Cryptographic Signature</h3>
          <button class="btn btn-sm" onclick="document.getElementById('verify-modal').style.display='none'">✕</button>
        </div>
        <div id="verify-modal-content" class="modal-body">
          <span class="text-muted">Verifying...</span>
        </div>
      </div>
    </div>
  `;

  setTimeout(() => {
    attachNavHandlers();
    attachApprovalHandlers();
    loadPendingApprovals();
    loadAllApprovals();

    // Connect real-time and listen for live events
    const rt = connectRealtime();
    if (rt) {
      const unsubNew = onRealtimeEvent('approval:new', (data) => {
        const user = getCurrentUser();
        if (data.requester?.id !== user?.id) {
          showToast(`📝 New request: ${data.actionType} from ${data.requester?.displayName}`, 'info', 5000);
          loadPendingApprovals();
          loadAllApprovals();
        }
      });

      const unsubVote = onRealtimeEvent('approval:vote', (data) => {
        const statusMsg = data.status === 'approved' ? '🎉 APPROVED!' : data.status === 'denied' ? '🚫 DENIED' : `Tally: ${data.tally.approve}/${data.tally.threshold}`;
        showToast(`🗳️ ${data.approver?.displayName} voted ${data.decision} — ${statusMsg}`, data.status === 'approved' ? 'success' : data.status === 'denied' ? 'error' : 'info', 4000);
        loadAllApprovals();
      });

      const unsubResolved = onRealtimeEvent('approval:resolved', (data) => {
        if (data.status === 'approved') {
          showToast(`✅ ${data.actionType} was APPROVED`, 'success');
        } else if (data.status === 'denied') {
          showToast(`❌ ${data.actionType} was DENIED`, 'error');
        }
        loadPendingApprovals();
        loadAllApprovals();
      });

      // Cleanup when navigating away
      window._realtimeCleanup = () => { unsubNew(); unsubVote(); unsubResolved(); };
    }
  }, 0);

  return container;
}

function attachApprovalHandlers() {
  document.getElementById('btn-create-request')?.addEventListener('click', async () => {
    const errorEl = document.getElementById('create-error');
    const successEl = document.getElementById('create-success');
    errorEl.style.display = 'none';
    successEl.style.display = 'none';

    const actionType = document.getElementById('action-type')?.value;
    const policyName = document.getElementById('policy-select')?.value;

    try {
      const result = await post('/approvals', {
        policyName,
        actionType,
        actionPayload: { amount: 10000, description: `Demo ${actionType}` },
      });

      successEl.textContent = `✅ Request created! ID: ${result.id.substring(0, 8)}... Status: ${result.status} | Threshold: ${result.quorumThreshold}`;
      successEl.style.display = 'block';

      // Refresh lists
      loadPendingApprovals();
      loadAllApprovals();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  });
}

async function loadPendingApprovals() {
  const el = document.getElementById('pending-list');
  if (!el) return;

  try {
    const data = await get('/approvals/pending');

    if (data.approvals.length === 0) {
      el.innerHTML = '<span class="text-muted">No pending approvals for you.</span>';
      return;
    }

    el.innerHTML = data.approvals.map((a) => `
      <div class="card" style="margin-top: 0.75rem; padding: 1rem;">
        <div class="flex justify-between items-center">
          <div>
            <strong>${a.actionType}</strong>
            <span class="badge badge-pending" style="margin-left: 0.5rem;">pending</span>
            <br>
            <span class="text-muted" style="font-size: 0.8125rem;">
              Policy: ${a.policyName} | By: ${a.requester.displayName} | Threshold: ${a.quorumThreshold}
            </span>
          </div>
          <div class="flex gap-sm">
            <button class="btn btn-success btn-sm vote-btn" data-id="${a.id}" data-decision="approve">✅ Approve (Unsigned)</button>
            <button class="btn btn-primary btn-sm vote-signed-btn" data-id="${a.id}" data-decision="approve">🔏 Sign & Approve</button>
            <button class="btn btn-danger btn-sm vote-btn" data-id="${a.id}" data-decision="deny">❌ Deny</button>
          </div>
        </div>
      </div>
    `).join('');

    // Unsigned vote handler
    el.querySelectorAll('.vote-btn').forEach((btn) => {
      btn.addEventListener('click', async () => handleVoteSubmit(btn, false));
    });

    // Signed vote handler
    el.querySelectorAll('.vote-signed-btn').forEach((btn) => {
      btn.addEventListener('click', async () => handleVoteSubmit(btn, true));
    });
  } catch (err) {
    el.innerHTML = `<div class="empty-state">Failed to load: ${err.message}</div>`;
  }
}

/**
 * Show a number-matching challenge before proceeding with the vote.
 * Prevents MFA/approval fatigue attacks by requiring conscious engagement.
 */
function showNumberMatchChallenge(decision) {
  return new Promise((resolve, reject) => {
    const matchNumber = Math.floor(Math.random() * 90) + 10; // 10-99

    const overlay = document.createElement('div');
    overlay.className = 'number-match-overlay';
    overlay.innerHTML = `
      <div class="number-match-card">
        <h3>Confirm Your ${decision === 'approve' ? 'Approval' : 'Denial'}</h3>
        <p class="match-instruction">
          To prevent accidental approvals, type the number shown below:
        </p>
        <div class="match-number">${matchNumber}</div>
        <input type="text" id="match-input" class="form-input" placeholder="—" maxlength="2" autocomplete="off" />
        <div class="number-match-actions">
          <button class="btn btn-outline btn-sm" id="match-cancel">Cancel</button>
          <button class="btn btn-primary btn-sm" id="match-confirm">Confirm ${decision === 'approve' ? 'Approval' : 'Denial'}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const input = overlay.querySelector('#match-input');
    input.focus();

    const cleanup = () => {
      if (document.body.contains(overlay)) {
        document.body.removeChild(overlay);
      }
    };

    overlay.querySelector('#match-cancel').addEventListener('click', () => {
      cleanup();
      reject(new Error('Vote cancelled by user.'));
    });

    overlay.querySelector('#match-confirm').addEventListener('click', () => {
      const entered = input.value.trim();
      if (entered === String(matchNumber)) {
        cleanup();
        resolve(true);
      } else {
        input.style.borderColor = 'var(--color-alert)';
        input.value = '';
        input.placeholder = 'Try again';
        input.focus();
      }
    });

    // Also allow Enter key to confirm
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        overlay.querySelector('#match-confirm').click();
      }
    });
  });
}

async function handleVoteSubmit(btn, useSignature) {
  const requestId = btn.dataset.id;
  const decision = btn.dataset.decision;
  const originalText = btn.textContent;

  try {
    // Number-matching anti-fatigue step
    await showNumberMatchChallenge(decision);

    btn.disabled = true;
    btn.textContent = 'Voting...';

    let assertion = null;

    if (useSignature) {
      btn.textContent = 'Awaiting Passkey...';
      const challengeRes = await post(`/approvals/${requestId}/vote/challenge`, { decision });
      
      const publicKey = {
        challenge: Uint8Array.from(atob(challengeRes.challenge.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)),
        rpId: window.location.hostname,
        userVerification: "preferred",
      };

      const credential = await navigator.credentials.get({ publicKey });
      
      assertion = {
        id: credential.id,
        rawId: btoa(String.fromCharCode.apply(null, new Uint8Array(credential.rawId))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''),
        type: credential.type,
        response: {
          authenticatorData: btoa(String.fromCharCode.apply(null, new Uint8Array(credential.response.authenticatorData))),
          clientDataJSON: btoa(String.fromCharCode.apply(null, new Uint8Array(credential.response.clientDataJSON))),
          signature: btoa(String.fromCharCode.apply(null, new Uint8Array(credential.response.signature))),
        }
      };
      btn.textContent = 'Submitting...';
    }

    const result = await post(`/approvals/${requestId}/vote`, { decision, assertion });

    const statusText = result.quorumResult.status === 'approved'
      ? '🎉 APPROVED!'
      : result.quorumResult.status === 'denied'
      ? '🚫 DENIED'
      : `Tally: ${result.quorumResult.approveTally}/${result.quorumResult.threshold}`;

    btn.closest('.card').innerHTML = `
      <div class="flex justify-between items-center">
        <span>Vote recorded: <strong>${decision}</strong> ${useSignature ? '🔏' : ''}</span>
        <span class="badge ${result.quorumResult.status === 'approved' ? 'badge-approved' : result.quorumResult.status === 'denied' ? 'badge-denied' : 'badge-pending'}">${statusText}</span>
      </div>
    `;

    loadAllApprovals();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = originalText;
    
    if (err.message === 'Vote cancelled by user.') {
      return; // silently return on cancel
    }

    if (err.message.includes('signature_required')) {
      alert("❌ Signature Required:\n\n" + err.message);
    } else {
      alert(err.message);
    }
  }
}

async function loadAllApprovals() {
  const el = document.getElementById('all-approvals');
  if (!el) return;

  try {
    const data = await get('/approvals/all');

    if (data.requests.length === 0) {
      el.innerHTML = '<div class="empty-state">No approval requests found.</div>';
      return;
    }

    el.innerHTML = `
      <div class="list-group">
        ${data.requests.map((r) => {
          // Calculate quorum progress (mocked purely for UI since /all doesn't return tallies, but wait, we need actual tallies)
          // Actually, let's just make the row clickable to load full details
          return `
            <div class="list-item approval-row" data-id="${r.id}" style="cursor: pointer; padding: 1rem; border-bottom: 1px solid var(--color-border); transition: background 0.2s;">
              <div class="flex justify-between items-center">
                <div>
                  <strong>${r.actionType}</strong>
                  <span class="badge badge-${r.status}" style="margin-left: 0.5rem;">${r.status}</span>
                  <div class="text-muted mt-sm" style="font-size: 0.8125rem;">
                    Policy: ${r.policyName} | Requester: ${r.requester.displayName}
                  </div>
                </div>
                <div class="text-muted" style="font-size: 0.8125rem;">
                  ${new Date(r.createdAt).toLocaleString()}
                </div>
              </div>
              <div class="approval-details" id="details-${r.id}" style="display: none; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--color-border);">
                <span class="text-muted">Loading details...</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    // Attach click handlers to expand rows
    el.querySelectorAll('.approval-row').forEach(row => {
      row.addEventListener('click', async (e) => {
        // Prevent toggling if clicking on a badge/button inside
        if (e.target.closest('.signed-badge')) return;
        
        const detailsEl = document.getElementById(`details-${row.dataset.id}`);
        if (detailsEl.style.display === 'block') {
          detailsEl.style.display = 'none';
          return;
        }

        detailsEl.style.display = 'block';
        
        try {
          const reqData = await get(`/approvals/${row.dataset.id}`);
          const quorum = reqData.quorum;
          const percent = Math.min(100, Math.round((quorum.approveTally / quorum.threshold) * 100));
          
          let detailsHtml = `
            <div class="mb-md">
              <div class="flex justify-between mb-sm" style="font-size: 0.8125rem;">
                <strong>Quorum Progress</strong>
                <span>${quorum.approveTally} / ${quorum.threshold} weight</span>
              </div>
              <div class="quorum-bar">
                <div class="quorum-fill" style="width: ${percent}%;"></div>
              </div>
            </div>
            
            <strong>Votes (${reqData.votes.length})</strong>
            <div class="mt-sm flex flex-col gap-sm">
          `;
          
          if (reqData.votes.length === 0) {
            detailsHtml += `<span class="text-muted" style="font-size: 0.8125rem;">No votes yet.</span>`;
          } else {
            reqData.votes.forEach(v => {
              const badge = v.signed 
                ? `<span class="signed-badge" onclick="verifySignature('${reqData.id}', '${v.id}')">🔏 Signed</span>`
                : `<span class="unsigned-badge">⚠️ Unsigned</span>`;
              
              detailsHtml += `
                <div class="flex justify-between items-center" style="font-size: 0.8125rem; background: var(--color-background); padding: 0.5rem; border-radius: 0.25rem;">
                  <div>
                    <strong>${v.approver.displayName}</strong> (${v.approver.role}, w=${v.weight})
                    <span style="margin-left: 0.5rem; color: ${v.decision === 'approve' ? 'var(--color-verify)' : 'var(--color-alert)'}">${v.decision.toUpperCase()}</span>
                  </div>
                  ${badge}
                </div>
              `;
            });
          }
          
          detailsHtml += `</div>`;
          detailsEl.innerHTML = detailsHtml;
        } catch (err) {
          detailsEl.innerHTML = `<span class="text-muted">Failed to load details: ${err.message}</span>`;
        }
      });
    });

  } catch (err) {
    el.innerHTML = `<div class="empty-state">Failed to load: ${err.message}</div>`;
  }
}

window.verifySignature = async function(requestId, voteId) {
  const modal = document.getElementById('verify-modal');
  const content = document.getElementById('verify-modal-content');
  
  modal.style.display = 'flex';
  content.innerHTML = '<span class="text-muted">Verifying signature independently...</span>';
  
  try {
    const result = await get(`/approvals/${requestId}/votes/${voteId}/verify`);
    
    if (result.verified) {
      content.innerHTML = `
        <div class="alert alert-success mb-md">
          ✅ <strong>Signature Valid</strong>
        </div>
        <div class="flex flex-col gap-sm" style="font-size: 0.875rem;">
          <div class="flex justify-between"><span class="text-muted">Signer</span> <strong>${result.signer.displayName} (${result.signer.email})</strong></div>
          <div class="flex justify-between"><span class="text-muted">Role</span> <span>${result.signer.role}</span></div>
          <div class="flex justify-between"><span class="text-muted">Decision</span> <strong>${result.decision.toUpperCase()}</strong></div>
          <div class="flex justify-between"><span class="text-muted">Timestamp</span> <span>${new Date(result.timestamp).toLocaleString()}</span></div>
          <div class="flex flex-col mt-sm">
            <span class="text-muted">Public Key Fingerprint (SHA-256)</span>
            <code style="background: var(--color-background); padding: 0.25rem; border-radius: 0.25rem; margin-top: 0.25rem;">${result.publicKeyFingerprint}</code>
          </div>
        </div>
      `;
    } else {
      content.innerHTML = `
        <div class="alert alert-error mb-md">
          ❌ <strong>Verification Failed</strong>
        </div>
        <p>${result.reason}</p>
        <div class="flex flex-col gap-sm mt-md" style="font-size: 0.875rem;">
          <div class="flex justify-between"><span class="text-muted">Signer</span> <strong>${result.signer.displayName}</strong></div>
          <div class="flex justify-between"><span class="text-muted">Decision</span> <span>${result.decision.toUpperCase()}</span></div>
          <div class="flex justify-between"><span class="text-muted">Timestamp</span> <span>${new Date(result.timestamp).toLocaleString()}</span></div>
        </div>
      `;
    }
  } catch (err) {
    content.innerHTML = `<div class="alert alert-error">Error: ${err.message}</div>`;
  }
}
