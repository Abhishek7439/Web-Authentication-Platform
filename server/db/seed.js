import { v4 as uuidv4 } from 'uuid';
import { getDb } from './index.js';
import { encrypt } from '../utils/crypto.js';
import { sha256 } from '../utils/crypto.js';
import * as OTPAuth from 'otpauth';

/**
 * Seed demo data into an empty database.
 * Guard: skips if any users already exist (idempotent).
 */
export function seedDatabase() {
  const db = getDb();
  const count = db.prepare('SELECT COUNT(*) as count FROM users').get().count;

  if (count > 0) {
    console.log('[seed] Database already has data, skipping seed.');
    return;
  }

  console.log('[seed] Empty database detected. Seeding demo data...');

  const users = [
    { id: uuidv4(), email: 'alice@demo.local', display_name: 'Alice Requester', role: 'member' },
    { id: uuidv4(), email: 'bob@demo.local', display_name: 'Bob Senior', role: 'senior' },
    { id: uuidv4(), email: 'carol@demo.local', display_name: 'Carol Junior', role: 'member' },
    { id: uuidv4(), email: 'dave@demo.local', display_name: 'Dave Junior', role: 'member' },
    { id: uuidv4(), email: 'admin@demo.local', display_name: 'Admin', role: 'admin' },
  ];

  const insertUser = db.prepare(`
    INSERT INTO users (id, email, display_name, role)
    VALUES (?, ?, ?, ?)
  `);

  const insertCredential = db.prepare(`
    INSERT INTO credentials (id, user_id, type, credential_data, is_backup)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertPolicy = db.prepare(`
    INSERT INTO approval_policies (id, name, quorum_threshold, role_weights, expiry_minutes, fallback_config, escalation_policy)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAuditLog = db.prepare(`
    INSERT INTO audit_log (prev_hash, entry_hash, event_type, actor_id, payload, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const seedTransaction = db.transaction(() => {
    // Insert users
    for (const user of users) {
      insertUser.run(user.id, user.email, user.display_name, user.role);
    }

    // Create TOTP secrets for each user (encrypted at rest)
    for (const user of users) {
      const totp = new OTPAuth.TOTP({
        issuer: 'Commander Auth',
        label: user.email,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: new OTPAuth.Secret({ size: 20 }),
      });

      const credentialData = JSON.stringify({
        secret: encrypt(totp.secret.base32),
        uri: totp.toString(),
      });

      insertCredential.run(uuidv4(), user.id, 'totp', credentialData, 0);
    }

    // Seed dummy WebAuthn passkeys for Bob and Carol (for demo signature validation)
    const dummyWebAuthnData = JSON.stringify({
      credentialID: 'dummy-credential-id-' + Date.now(),
      credentialPublicKey: Buffer.from('dummy-public-key').toString('base64'),
      counter: 0,
      transports: ['internal'],
    });
    
    insertCredential.run(uuidv4(), users[1].id, 'webauthn', dummyWebAuthnData, 0); // Bob
    insertCredential.run(uuidv4(), users[2].id, 'webauthn', dummyWebAuthnData, 0); // Carol

    // Seed approval policies
    const policies = [
      {
        id: uuidv4(),
        name: 'high-value-transaction',
        quorum_threshold: 3,
        role_weights: JSON.stringify({ admin: 3, senior: 2, member: 1 }),
        expiry_minutes: 30,
        fallback_config: JSON.stringify({ fallback_approvers: [] }),
        escalation_policy: 'lower_threshold',
      },
      {
        id: uuidv4(),
        name: 'production-deploy',
        quorum_threshold: 2,
        role_weights: JSON.stringify({ admin: 2, senior: 2, member: 1 }),
        expiry_minutes: 60,
        fallback_config: JSON.stringify({ fallback_approvers: [] }),
        escalation_policy: 'delegate',
      },
      {
        id: uuidv4(),
        name: 'account-recovery',
        quorum_threshold: 2,
        role_weights: JSON.stringify({ admin: 2, senior: 1, member: 0 }),
        expiry_minutes: 120,
        fallback_config: JSON.stringify({ fallback_approvers: [] }),
        escalation_policy: 'admin_override',
      },
    ];

    for (const policy of policies) {
      insertPolicy.run(
        policy.id, policy.name, policy.quorum_threshold,
        policy.role_weights, policy.expiry_minutes,
        policy.fallback_config, policy.escalation_policy
      );
    }

    // Seed a few audit log entries to populate the chain-link UI
    const auditEntries = [
      { event_type: 'system_initialized', actor_id: users[4].id, payload: { message: 'Commander Auth platform initialized' } },
      { event_type: 'policy_created', actor_id: users[4].id, payload: { policy: 'high-value-transaction', threshold: 3 } },
      { event_type: 'policy_created', actor_id: users[4].id, payload: { policy: 'production-deploy', threshold: 2 } },
      { event_type: 'policy_created', actor_id: users[4].id, payload: { policy: 'account-recovery', threshold: 2 } },
    ];

    let prevHash = '0'.repeat(64); // Genesis block
    const baseTime = new Date();

    for (let i = 0; i < auditEntries.length; i++) {
      const entry = auditEntries[i];
      const timestamp = new Date(baseTime.getTime() + i * 1000).toISOString();
      const payloadStr = JSON.stringify(entry.payload);
      const entryHash = sha256(prevHash + payloadStr + timestamp);

      insertAuditLog.run(
        prevHash, entryHash, entry.event_type,
        entry.actor_id, payloadStr, timestamp
      );

      prevHash = entryHash;
    }
  });

  seedTransaction();

  // Print seeded account info
  console.log('[seed] Demo accounts created:');
  console.log('  alice@demo.local  (member)  - Primary requester');
  console.log('  bob@demo.local    (senior)  - Senior approver (weight 2)');
  console.log('  carol@demo.local  (member)  - Junior approver (weight 1)');
  console.log('  dave@demo.local   (member)  - Junior approver (weight 1)');
  console.log('  admin@demo.local  (admin)   - Admin');
  console.log('[seed] 3 approval policies created.');
  console.log('[seed] 4 audit log entries seeded.');

  // Show TOTP URIs if --show-qr flag is passed
  if (process.argv.includes('--show-qr')) {
    console.log('\n[seed] TOTP URIs for authenticator setup:');
    const creds = db.prepare(`
      SELECT u.email, c.credential_data
      FROM credentials c JOIN users u ON c.user_id = u.id
      WHERE c.type = 'totp'
    `).all();

    for (const cred of creds) {
      const data = JSON.parse(cred.credential_data);
      console.log(`  ${cred.email}: ${data.uri}`);
    }
  }

  console.log('[seed] Done.');
}

// Allow running standalone: node server/db/seed.js
if (process.argv[1]?.endsWith('seed.js')) {
  const { config } = await import('dotenv');
  config();
  seedDatabase();
}
