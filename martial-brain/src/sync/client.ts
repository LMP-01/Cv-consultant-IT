/** HTTP transport to the sync Worker, plus device pairing. */
import type { SyncTransport } from './engine';
import type { Changeset, PullResponse, PushResponse } from './protocol';

export class SyncError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'SyncError';
  }
}

/**
 * The app and the API ship from the same deployment, so an empty URL means
 * "same origin as this page" — which is the normal case and needs no setup.
 */
const base = (url: string): string => `${url.replace(/\/+$/, '')}/api`;

async function readError(res: Response): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  throw new SyncError(res.status, body.error ?? `HTTP ${res.status}`);
}

/** Exchange the shared passphrase for a device token. */
export async function pairDevice(url: string, secret: string): Promise<string> {
  const res = await fetch(`${base(url)}/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret }),
  });
  if (!res.ok) await readError(res);
  const body = (await res.json()) as { token?: string };
  if (!body.token) throw new SyncError(500, 'Le serveur n’a pas renvoyé de jeton.');
  return body.token;
}

export function httpTransport(url: string, token: string): SyncTransport {
  const root = base(url);
  const auth = { Authorization: `Bearer ${token}` };

  return {
    async pull(since: number): Promise<PullResponse> {
      const res = await fetch(`${root}/sync/pull?since=${since}`, { headers: auth });
      if (!res.ok) await readError(res);
      return (await res.json()) as PullResponse;
    },

    async push(body: Changeset & { since: number }): Promise<PushResponse> {
      const res = await fetch(`${root}/sync/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify(body),
      });
      if (!res.ok) await readError(res);
      return (await res.json()) as PushResponse;
    },
  };
}

/** Server-side counts, for the settings screen. */
export async function fetchStatus(
  url: string,
  token: string,
): Promise<{ entities: number; links: number; cursor: number }> {
  const res = await fetch(`${base(url)}/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) await readError(res);
  return (await res.json()) as { entities: number; links: number; cursor: number };
}
