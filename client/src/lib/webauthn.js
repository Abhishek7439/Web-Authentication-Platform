import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { post } from './api.js';

export { startRegistration, startAuthentication };

/**
 * Register a WebAuthn credential for a user.
 * Returns the attestation response to send to the server.
 */
export async function registerCredential(email) {
  // 1. Get registration options from server
  const options = await post('/auth/webauthn/register-options', { email });

  // 2. Start the browser WebAuthn ceremony
  const attestation = await startRegistration({ optionsJSON: options });

  // 3. Send attestation to server for verification
  const result = await post('/auth/webauthn/register-verify', { email, attestation });

  return result;
}

/**
 * Authenticate with a WebAuthn credential.
 * Returns the session token.
 */
export async function loginWithWebAuthn(email) {
  // 1. Get authentication options from server
  const options = await post('/auth/webauthn/login-options', { email: email || undefined });

  // 2. Start the browser WebAuthn ceremony
  const assertion = await startAuthentication({ optionsJSON: options });

  // 3. Send assertion to server for verification
  const result = await post('/auth/webauthn/login-verify', { assertion });

  return result;
}

/**
 * Step-up re-authentication.
 * Returns updated session info.
 */
export async function stepUpAuth(actionPayload = {}) {
  // 1. Get step-up options
  const options = await post('/auth/step-up/options', { actionPayload });

  // 2. Browser ceremony
  const assertion = await startAuthentication({ optionsJSON: options });

  // 3. Verify
  const result = await post('/auth/step-up/verify', { assertion });

  return result;
}
