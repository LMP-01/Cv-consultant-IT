/**
 * Device pairing.
 *
 * This is a single-person application, so there is no signup, no user table and
 * no email provider: you set one SYNC_SECRET on your own Worker and paste it
 * once per device. A device then holds an HMAC-signed token rather than the
 * secret itself, so a token leaking from one phone can be aged out without
 * changing the passphrase everywhere.
 */

const encoder = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(text: string): Uint8Array {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

/**
 * Compare two secrets without leaking their contents through timing.
 *
 * Both sides are HMAC'd under the same key first: that maps inputs of any
 * length onto fixed 32-byte digests, so the byte loop below always runs the
 * same number of iterations and an attacker learns nothing from how long a
 * wrong guess took. Plain `a === b` short-circuits on the first differing
 * character and would leak the secret one character at a time.
 */
export async function secretMatches(given: string, expected: string): Promise<boolean> {
  const key = await hmacKey(expected);
  const a = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(given)));
  const b = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(expected)));

  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length && i < b.length; i += 1) {
    diff |= (a[i] as number) ^ (b[i] as number);
  }
  return diff === 0;
}

export interface TokenPayload {
  /** Issued at, ms. */
  iat: number;
  /** Expires at, ms. */
  exp: number;
}

export async function issueToken(secret: string, ttlMinutes: number): Promise<string> {
  const now = Date.now();
  const payload: TokenPayload = { iat: now, exp: now + ttlMinutes * 60_000 };
  const body = b64url(encoder.encode(JSON.stringify(payload)));
  const mac = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(body));
  return `${body}.${b64url(mac)}`;
}

export async function verifyToken(secret: string, token: string): Promise<boolean> {
  const [body, mac] = token.split('.');
  if (!body || !mac) return false;

  const ok = await crypto.subtle.verify(
    'HMAC',
    await hmacKey(secret),
    unb64url(mac),
    encoder.encode(body),
  );
  if (!ok) return false;

  try {
    const payload = JSON.parse(new TextDecoder().decode(unb64url(body))) as TokenPayload;
    return typeof payload.exp === 'number' && payload.exp > Date.now();
  } catch {
    return false;
  }
}
