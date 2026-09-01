import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';

const authStorePath = path.resolve('.portfolio-auth.json');
const ceremonyLifetimeMs = 5 * 60 * 1000;
const unlockLifetimeMs = 10 * 60 * 1000;
const unlockCookieName = 'portfolio_unlock';

type StoredCredential = {
  rpID: string;
  id: string;
  publicKey: string;
  counter: number;
  transports?: AuthenticatorTransportFuture[];
};

type AuthStore = {
  version: 1;
  credentials: StoredCredential[];
};

type Ceremony = {
  mode: 'registration' | 'authentication';
  challenge: string;
  origin: string;
  rpID: string;
  expiresAt: number;
};

const ceremonies = new Map<string, Ceremony>();
const unlockTokens = new Map<string, { rpID: string; expiresAt: number }>();

export class DeviceAuthError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

async function readStore(): Promise<AuthStore> {
  try {
    const parsed = JSON.parse(await readFile(authStorePath, 'utf8')) as Partial<AuthStore>;
    return {
      version: 1,
      credentials: Array.isArray(parsed.credentials) ? parsed.credentials : [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, credentials: [] };
    throw error;
  }
}

async function saveStore(store: AuthStore) {
  await writeFile(authStorePath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

function requestContext(request: { headers: { origin?: string } }) {
  if (!request.headers.origin) throw new DeviceAuthError('Device unlock requires a browser origin.', 400);
  let url: URL;
  try {
    url = new URL(request.headers.origin);
  } catch {
    throw new DeviceAuthError('Device unlock received an invalid browser origin.', 400);
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  if (url.protocol !== 'https:' && !local) {
    throw new DeviceAuthError('Device unlock requires HTTPS when the app is opened from a phone or another computer.', 400);
  }
  return { origin: url.origin, rpID: url.hostname };
}

function requestRPID(request: { headers: { origin?: string; host?: string } }) {
  if (request.headers.origin) return requestContext(request).rpID;
  if (!request.headers.host) throw new DeviceAuthError('Device unlock could not identify this browser.', 401);
  try {
    return new URL(`http://${request.headers.host}`).hostname;
  } catch {
    throw new DeviceAuthError('Device unlock received an invalid browser address.', 401);
  }
}

function cookieValue(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return undefined;
}

function pruneExpired() {
  const now = Date.now();
  for (const [id, ceremony] of ceremonies) if (ceremony.expiresAt <= now) ceremonies.delete(id);
  for (const [token, unlock] of unlockTokens) if (unlock.expiresAt <= now) unlockTokens.delete(token);
}

export async function createDeviceAuthOptions(request: { headers: { origin?: string } }) {
  pruneExpired();
  const context = requestContext(request);
  const store = await readStore();
  const credential = store.credentials.find((item) => item.rpID === context.rpID);
  const ceremonyId = randomBytes(18).toString('base64url');

  if (credential) {
    const options = await generateAuthenticationOptions({
      rpID: context.rpID,
      allowCredentials: [{ id: credential.id, transports: credential.transports }],
      userVerification: 'required',
      timeout: 60_000,
    });
    ceremonies.set(ceremonyId, {
      mode: 'authentication',
      challenge: options.challenge,
      ...context,
      expiresAt: Date.now() + ceremonyLifetimeMs,
    });
    return { mode: 'authentication' as const, ceremonyId, options };
  }

  const options = await generateRegistrationOptions({
    rpName: "Avishek's Portfolio",
    rpID: context.rpID,
    userName: 'avishek',
    userDisplayName: 'Avishek',
    attestationType: 'none',
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      residentKey: 'preferred',
      userVerification: 'required',
    },
    preferredAuthenticatorType: 'localDevice',
    supportedAlgorithmIDs: [-7, -257],
    timeout: 60_000,
  });
  ceremonies.set(ceremonyId, {
    mode: 'registration',
    challenge: options.challenge,
    ...context,
    expiresAt: Date.now() + ceremonyLifetimeMs,
  });
  return { mode: 'registration' as const, ceremonyId, options };
}

export async function verifyDeviceAuth(
  request: { headers: { origin?: string } },
  rawInput: unknown,
) {
  pruneExpired();
  if (!rawInput || typeof rawInput !== 'object') throw new DeviceAuthError('Device unlock response is invalid.');
  const input = rawInput as Record<string, unknown>;
  if (typeof input.ceremonyId !== 'string' || typeof input.mode !== 'string' || !input.response) {
    throw new DeviceAuthError('Device unlock response is incomplete.');
  }
  const context = requestContext(request);
  const ceremony = ceremonies.get(input.ceremonyId);
  ceremonies.delete(input.ceremonyId);
  if (!ceremony || ceremony.expiresAt <= Date.now()) throw new DeviceAuthError('Device unlock expired. Try again.', 401);
  if (ceremony.mode !== input.mode || ceremony.origin !== context.origin || ceremony.rpID !== context.rpID) {
    throw new DeviceAuthError('Device unlock did not match this browser.', 401);
  }

  const store = await readStore();
  if (ceremony.mode === 'registration') {
    if (store.credentials.some((credential) => credential.rpID === context.rpID)) {
      throw new DeviceAuthError('A device passkey is already registered for this address.', 409);
    }
    const verification = await verifyRegistrationResponse({
      response: input.response as RegistrationResponseJSON,
      expectedChallenge: ceremony.challenge,
      expectedOrigin: context.origin,
      expectedRPID: context.rpID,
      requireUserVerification: true,
      supportedAlgorithmIDs: [-7, -257],
    });
    if (!verification.verified || !verification.registrationInfo) {
      throw new DeviceAuthError('The device could not verify your identity.', 401);
    }
    const credential = verification.registrationInfo.credential;
    store.credentials.push({
      rpID: context.rpID,
      id: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString('base64'),
      counter: credential.counter,
      transports: credential.transports,
    });
    await saveStore(store);
  } else {
    const response = input.response as AuthenticationResponseJSON;
    const credential = store.credentials.find(
      (item) => item.rpID === context.rpID && item.id === response.id,
    );
    if (!credential) throw new DeviceAuthError('This device passkey is not registered.', 401);
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: ceremony.challenge,
      expectedOrigin: context.origin,
      expectedRPID: context.rpID,
      credential: {
        id: credential.id,
        publicKey: new Uint8Array(Buffer.from(credential.publicKey, 'base64')),
        counter: credential.counter,
        transports: credential.transports,
      },
      requireUserVerification: true,
    });
    if (!verification.verified) throw new DeviceAuthError('The device could not verify your identity.', 401);
    credential.counter = verification.authenticationInfo.newCounter;
    await saveStore(store);
  }

  const token = randomBytes(32).toString('base64url');
  unlockTokens.set(token, { rpID: context.rpID, expiresAt: Date.now() + unlockLifetimeMs });
  return { verified: true, token, expiresInSeconds: unlockLifetimeMs / 1000 };
}

export function deviceUnlockCookie(request: { headers: { origin?: string } }, token: string) {
  const secure = request.headers.origin?.startsWith('https:') ?? false;
  return `${unlockCookieName}=${encodeURIComponent(token)}; Path=/; Max-Age=${unlockLifetimeMs / 1000}; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`;
}

export function requireDeviceUnlock(request: { headers: { origin?: string; host?: string; cookie?: string; [key: string]: string | string[] | undefined } }) {
  pruneExpired();
  const rpID = requestRPID(request);
  const rawToken = request.headers['x-portfolio-unlock'];
  const headerToken = Array.isArray(rawToken) ? rawToken[0] : rawToken;
  const token = headerToken ?? cookieValue(request.headers.cookie, unlockCookieName);
  const unlock = token ? unlockTokens.get(token) : undefined;
  if (!unlock || unlock.rpID !== rpID || unlock.expiresAt <= Date.now()) {
    throw new DeviceAuthError('Unlock this private project with your device before opening it.', 401);
  }
}
