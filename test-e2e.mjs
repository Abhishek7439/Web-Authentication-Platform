// Full browser-equivalent test: fetches actual pages + exercises every API endpoint
const BASE = 'http://localhost:3000';

async function fullTest() {
  let pass = 0, fail = 0;
  function check(name, ok, detail = '') {
    if (ok) { pass++; console.log(`  ✅ ${name}${detail ? ' — ' + detail : ''}`); }
    else    { fail++; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
  }

  console.log('══════════════════════════════════════════════');
  console.log('  COMMANDER AUTH — FULL SYSTEM TEST');
  console.log('══════════════════════════════════════════════\n');

  // ── 1. Frontend Serves ────────────────────────────
  console.log('▸ FRONTEND');
  const html = await fetch(`${BASE}/`).then(r => r.text());
  check('index.html serves', html.includes('Commander Auth'));
  check('CSS bundle loaded', html.includes('assets/index-') && html.includes('.css'));
  check('JS bundle loaded', html.includes('assets/index-') && html.includes('.js'));

  // ── 2. Health endpoint ────────────────────────────
  console.log('\n▸ HEALTH');
  const health = await fetch(`${BASE}/health`).then(r => r.json());
  check('GET /health', health.status === 'ok', `uptime: ${Math.round(health.uptime)}s`);

  // ── 3. Login: Alice, Bob, Carol ───────────────────
  console.log('\n▸ AUTH — Magic Link Login');
  async function login(email) {
    const send = await fetch(`${BASE}/api/auth/magic-link/send`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    }).then(r => r.json());
    const session = await fetch(`${BASE}/api/auth/magic-link/verify/${send.token}`).then(r => r.json());
    return session;
  }
  const alice = await login('alice@demo.local');
  check('Alice login', alice.user?.email === 'alice@demo.local', `role: ${alice.user?.role}`);
  const bob = await login('bob@demo.local');
  check('Bob login', !!bob.token, 'role: senior');
  
  const carol = await login('carol@demo.local');
  check('Carol login', !!carol.token, 'role: member');

  const admin = await login('admin@demo.local');
  check('Admin login', !!admin.token, 'role: admin');

  // ── 4. Policies ───────────────────────────────────
  console.log('\n▸ POLICIES');
  const policies = await fetch(`${BASE}/api/policies`, {
    headers: { 'Authorization': `Bearer ${alice.token}` }
  }).then(r => r.json());
  check('GET /api/policies', policies.policies?.length >= 3, `${policies.policies?.length} policies`);
  const hvt = policies.policies?.find(p => p.name === 'high-value-transaction');
  check('high-value-transaction policy exists', !!hvt, `threshold: ${hvt?.quorumThreshold}`);

  // ── 8. Create approval request (Sensitive Policy) ──
  console.log('\n▸ APPROVAL — Mandatory Signing Check');
  const reqSensitive = await fetch(`${BASE}/api/approvals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${alice.token}`, 'Idempotency-Key': `req-sens-${Date.now()}` },
    body: JSON.stringify({ policyName: 'high-value-transaction', actionType: 'high-value-transfer', actionPayload: { amount: 10000 } })
  }).then(r => r.json());
  
  const vSensitive = await fetch(`${BASE}/api/approvals/${reqSensitive.id}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${bob.token}` },
    body: JSON.stringify({ decision: 'approve' })
  });
  check('Unsigned vote on sensitive policy is rejected (403)', vSensitive.status === 403);
  const vSensitiveData = await vSensitive.json();
  check('Error is signature_required', vSensitiveData.error === 'signature_required');

  console.log('\n▸ APPROVAL — Standard Flow (account-recovery)');
  const req = await fetch(`${BASE}/api/approvals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${alice.token}`, 'Idempotency-Key': `req-${Date.now()}` },
    body: JSON.stringify({ policyName: 'account-recovery', actionType: 'account-recovery', actionPayload: { user: 'alice' } })
  }).then(r => r.json());
  check('Request created successfully', !!req.id, `ID: ${req.id}`);
  check('Status is pending', req.status === 'pending');
  check('Threshold is 2', req.quorumThreshold === 2);

  // ── 6. Self-vote prevention ───────────────────────
  console.log('\n▸ APPROVAL — Self-Vote Prevention');
  const selfVote = await fetch(`${BASE}/api/approvals/${req.id}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${alice.token}` },
    body: JSON.stringify({ decision: 'approve' })
  });
  check('Alice cannot vote on own request', selfVote.status === 400 || selfVote.status === 409);

  // ── 7. Idempotency ───────────────────────────────
  console.log('\n▸ IDEMPOTENCY');
  const idemKey = 'test-idem-' + Date.now();
  const i1 = await fetch(`${BASE}/api/approvals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${alice.token}`, 'Idempotency-Key': idemKey },
    body: JSON.stringify({ policyName: 'production-deploy', actionType: 'deploy', actionPayload: {} })
  }).then(r => r.json());
  const i2 = await fetch(`${BASE}/api/approvals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${alice.token}`, 'Idempotency-Key': idemKey },
    body: JSON.stringify({ policyName: 'production-deploy', actionType: 'deploy', actionPayload: {} })
  }).then(r => r.json());
  check('Idempotent replay returns same ID', i1.id === i2.id);

  // ── 9. Vote as Bob (weight 1 on account-recovery) ──
  console.log('\n▸ APPROVAL — Vote (Bob)');
  const v1 = await fetch(`${BASE}/api/approvals/${req.id}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${bob.token}` },
    body: JSON.stringify({ decision: 'approve' })
  }).then(r => r.json());
  check('Bob voted', v1.decision === 'approve', `tally: ${v1.quorumResult?.approveTally}/${v1.quorumResult?.threshold}`);
  check('Still pending (1 < 2)', v1.quorumResult?.status === 'pending');

  // ── 10. Vote as Admin (weight 2 on account-recovery) ──
  console.log('\n▸ APPROVAL — Vote (Admin)');
  const v2 = await fetch(`${BASE}/api/approvals/${req.id}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${admin.token}` },
    body: JSON.stringify({ decision: 'approve' })
  }).then(r => r.json());
  check('Admin voted', v2.decision === 'approve', `tally: ${v2.quorumResult?.approveTally}/${v2.quorumResult?.threshold}`);
  check('APPROVED (3 >= 2)', v2.quorumResult?.status === 'approved');

  // ── 10. Final request state ───────────────────────
  console.log('\n▸ APPROVAL — Final State');
  const final = await fetch(`${BASE}/api/approvals/${req.id}`, {
    headers: { 'Authorization': `Bearer ${alice.token}` }
  }).then(r => r.json());
  check('Final status = approved', final.status === 'approved');
  check('2 votes recorded', final.votes?.length === 2);

  // ── 11. Duplicate vote prevention ─────────────────
  console.log('\n▸ DUPLICATE VOTE PREVENTION');
  const dup = await fetch(`${BASE}/api/approvals/${req.id}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${bob.token}` },
    body: JSON.stringify({ decision: 'approve' })
  });
  check('Bob cannot vote twice', dup.status !== 200);

  // ── 12. Audit chain ───────────────────────────────
  console.log('\n▸ AUDIT — Chain Integrity');
  const chain = await fetch(`${BASE}/api/audit/verify`, {
    headers: { 'Authorization': `Bearer ${alice.token}` }
  }).then(r => r.json());
  check('Chain is valid', chain.valid === true, `${chain.entries} entries checked`);

  // ── 13. Audit log entries ─────────────────────────
  console.log('\n▸ AUDIT — Log Entries');
  const log = await fetch(`${BASE}/api/audit?limit=20`, {
    headers: { 'Authorization': `Bearer ${alice.token}` }
  }).then(r => r.json());
  check('Audit log has entries', log.total > 0, `${log.total} total`);
  const events = log.entries.map(e => e.eventType);
  check('Contains approval_approved', events.includes('approval_approved'));
  check('Contains vote_submitted', events.includes('vote_submitted'));
  check('Contains approval_requested', events.includes('approval_requested'));

  // ── 14. Recovery flow ─────────────────────────────
  console.log('\n▸ RECOVERY — Self-Serve');
  const recovery = await fetch(`${BASE}/api/recovery/self-serve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'alice@demo.local' })
  }).then(r => r.json());
  check('Recovery initiated', recovery.initiated === true);
  check('Recovery link generated', !!recovery.demoLink);

  // ── 15. SPA routing (fallback) ────────────────────
  console.log('\n▸ SPA ROUTING');
  const spa = await fetch(`${BASE}/some-random-path`);
  const spaHtml = await spa.text();
  check('SPA fallback serves index.html', spaHtml.includes('Commander Auth'));

  // ── Summary ───────────────────────────────────────
  console.log('\n══════════════════════════════════════════════');
  console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
  console.log('══════════════════════════════════════════════\n');

  if (fail > 0) process.exit(1);
}

fullTest().catch(err => { console.error('FATAL:', err); process.exit(1); });
