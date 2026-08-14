/**
 * Device pairing.
 *
 * Single-person application: no signup, no user table, no email provider. You
 * set one SYNC_SECRET on your own deployment and paste it once per device. The
 * device then holds an HMAC-signed token rather than the secret itself, so a
 * token leaking from a lost phone ages out without changing the passphrase
 * everywhere.
 *
 * Plain Web Crypto — nothing here is runtime-specific.
 */

const encoder = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(text: string): Uint8Array<ArrayBuffer> {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  // Allocated rather than Uint8Array.from(): the latter is typed over
  // ArrayBufferLike, which Web Crypto's BufferSource will not accept.
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function hmacKey(secret: string): Promise<CryptoKey> {
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
 * Both sides are HMAC'd under the same key first, mapping inputs of any length
 * onto fixed 32-byte digests, so the loop below always runs the same number of
 * iterations. Plain `a === b` short-circuits on the first differing character
 * and would leak the secret one character at a time.
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

interface TokenPayload {
  iat: number;
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
