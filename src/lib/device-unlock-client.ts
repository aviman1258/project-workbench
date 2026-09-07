// The one WebAuthn device-unlock sequence for every local-editor surface:
// check the cookie-backed status endpoint first, then run the
// register-or-authenticate ceremony and verify it.
//
// Returns the unlock token to send as X-Portfolio-Unlock — or '' when a recent
// unlock cookie is still valid (the server accepts the cookie by itself).

import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser';

async function postAuth(url: string, payload: unknown): Promise<Record<string, any>> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({})) as Record<string, any>;
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Device unlock failed.');
  return result;
}

export async function deviceUnlock(options: { onPrompt?: () => void } = {}): Promise<string> {
  const status = await fetch('/api/local/device-auth/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (status.ok) return ''; // a recent unlock cookie is still valid

  if (!window.isSecureContext || !browserSupportsWebAuthn()) {
    throw new Error('Device unlock requires HTTPS (or localhost) and a browser that supports passkeys.');
  }
  options.onPrompt?.();
  const challenge = await postAuth('/api/local/device-auth/options', {});
  const credential = challenge.mode === 'registration'
    ? await startRegistration({ optionsJSON: challenge.options })
    : await startAuthentication({ optionsJSON: challenge.options });
  const verification = await postAuth('/api/local/device-auth/verify', {
    ceremonyId: challenge.ceremonyId,
    mode: challenge.mode,
    response: credential,
  });
  if (!verification.verified || !verification.token) throw new Error('The device could not verify your identity.');
  return String(verification.token);
}
