import Database from 'better-sqlite3';

const BASE = 'http://localhost:3000';
const db = new Database('./data/commander.db');

async function run() {
  console.log('--- STARTING TOTP / STUDENT TEST ---');
  
  // 1. Log in Alice to create requests
  const aliceLogin = await fetch(`${BASE}/api/auth/magic-link/send`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'alice@demo.local' })
  }).then(r => r.json());
  const alice = await fetch(`${BASE}/api/auth/magic-link/verify/${aliceLogin.token}`).then(r => r.json());
  
  // 2. Log in Bob to vote
  const bobLogin = await fetch(`${BASE}/api/auth/magic-link/send`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'bob@demo.local' })
  }).then(r => r.json());
  const bob = await fetch(`${BASE}/api/auth/magic-link/verify/${bobLogin.token}`).then(r => r.json());

  const nowISO = new Date().toISOString();
  db.prepare("UPDATE sessions SET last_verified_at = ? WHERE user_id = (SELECT id FROM users WHERE email = 'bob@demo.local')").run(nowISO);

  // Test A: Academic Submission (Fresh Session - 0 mins old)
  console.log('\n[Test A] Creating academic-submission request (Student Persona) - FRESH SESSION...');
  const reqStudent = await fetch(`${BASE}/api/approvals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${alice.token}`, 'Idempotency-Key': `req-student-${Date.now()}` },
    body: JSON.stringify({ policyName: 'academic-submission', actionType: 'submit', actionPayload: {} })
  }).then(r => r.json());
  
  console.log(`Created request ID: ${reqStudent.id}`);
  
  console.log('Bob (TOTP-only) voting on academic-submission...');
  const voteStudent = await fetch(`${BASE}/api/approvals/${reqStudent.id}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${bob.token}`, 'Idempotency-Key': `vote-student-${Date.now()}` },
    body: JSON.stringify({ decision: 'approve' })
  });
  
  console.log(`Status code: ${voteStudent.status}`);
  console.log(`Response:`, await voteStudent.json());


  // Test B: High Value Transaction (Bank Persona - strict step_up)
  console.log('\n[Test B] Creating high-value-transaction request (Bank Persona) - STRICT POLICY...');
  const reqBank = await fetch(`${BASE}/api/approvals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${alice.token}`, 'Idempotency-Key': `req-bank-${Date.now()}` },
    body: JSON.stringify({ policyName: 'high-value-transaction', actionType: 'transfer', actionPayload: {} })
  }).then(r => r.json());
  
  console.log(`Created request ID: ${reqBank.id}`);
  
  console.log('Bob (TOTP-only) voting on high-value-transaction...');
  const voteBank = await fetch(`${BASE}/api/approvals/${reqBank.id}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${bob.token}`, 'Idempotency-Key': `vote-bank-${Date.now()}` },
    body: JSON.stringify({ decision: 'approve' })
  });
  
  console.log(`Status code: ${voteBank.status}`);
  console.log(`Response:`, await voteBank.json());


  // Test C: Academic Submission (Stale Session - >15 mins old)
  console.log('\n[Test C] Testing STALE session (>15 mins) on lenient academic-submission...');
  
  const staleISO = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  db.prepare("UPDATE sessions SET last_verified_at = ? WHERE user_id = (SELECT id FROM users WHERE email = 'bob@demo.local')").run(staleISO);
  
  const reqStudentStale = await fetch(`${BASE}/api/approvals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${alice.token}`, 'Idempotency-Key': `req-student-stale-${Date.now()}` },
    body: JSON.stringify({ policyName: 'academic-submission', actionType: 'submit', actionPayload: {} })
  }).then(r => r.json());
  
  console.log('Bob (Stale TOTP-only) voting on academic-submission...');
  const voteStudentStale = await fetch(`${BASE}/api/approvals/${reqStudentStale.id}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${bob.token}`, 'Idempotency-Key': `vote-student-stale-${Date.now()}` },
    body: JSON.stringify({ decision: 'approve' })
  });
  
  console.log(`Status code: ${voteStudentStale.status}`);
  console.log(`Response:`, await voteStudentStale.json());
}

run().catch(console.error);
