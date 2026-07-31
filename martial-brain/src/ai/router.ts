/**
 * Provider routing with a fallback chain.
 *
 * Free tiers are generous but tightly rate-limited, and they do not fail
 * politely — you get a 429 mid-sentence. So the router walks the user's ordered
 * provider list: on a quota error it moves to the next provider rather than
 * surfacing a failure, and only gives up once every configured key has been
 * tried. What it never does is fail silently: the caller gets back which
 * provider actually answered, and the UI says so.
 */
import type { Settings } from '../settings';
import {
  generate,
  ProviderError,
  providerDef,
  RateLimited,
  type Fetcher,
  type GenerateRequest,
  type ProviderId,
} from './providers';

export interface RouteResult {
  text: string;
  provider: ProviderId;
  model: string;
  /** Providers skipped on the way, with why — shown in the UI, not swallowed. */
  fallbacks: { provider: ProviderId; reason: string }[];
}

export class NoProviderConfigured extends Error {
  constructor() {
    super('Aucune clé IA configurée.');
    this.name = 'NoProviderConfigured';
  }
}

export class AllProvidersFailed extends Error {
  constructor(readonly attempts: { provider: ProviderId; reason: string }[]) {
    super(
      `Tous les fournisseurs ont échoué : ${attempts
        .map((a) => `${providerDef(a.provider).label} (${a.reason})`)
        .join(', ')}`,
    );
    this.name = 'AllProvidersFailed';
  }
}

/** Providers that have both a key and a chosen model, in the user's order. */
export function usableProviders(settings: Settings, fast = false): ProviderId[] {
  return settings.aiOrder.filter((id): id is ProviderId => {
    const key = settings.aiKeys[id];
    const model = fast ? (settings.aiFastModel[id] ?? settings.aiModels[id]) : settings.aiModels[id];
    return Boolean(key && model);
  });
}

export function aiConfigured(settings: Settings): boolean {
  return usableProviders(settings).length > 0;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export interface RouteOptions extends GenerateRequest {
  /** Use the cheap model — for classification and query translation. */
  fast?: boolean;
  /** Retries per provider before moving on. */
  retries?: number;
  fetcher?: Fetcher;
}

export async function route(settings: Settings, options: RouteOptions): Promise<RouteResult> {
  const { fast = false, retries = 1, fetcher, ...req } = options;
  const chain = usableProviders(settings, fast);
  if (chain.length === 0) throw new NoProviderConfigured();

  const fallbacks: { provider: ProviderId; reason: string }[] = [];

  for (const provider of chain) {
    const key = settings.aiKeys[provider];
    const model = fast
      ? (settings.aiFastModel[provider] ?? settings.aiModels[provider])
      : settings.aiModels[provider];
    if (!key || !model) continue;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const text = await generate(provider, key, model, req, fetcher);
        return { text, provider, model, fallbacks };
      } catch (err) {
        if (err instanceof RateLimited) {
          // Back off once in case it is a per-second limit; then move on
          // rather than sitting on a provider whose daily quota is spent.
          if (attempt < retries) {
            await sleep(Math.min(err.retryAfterMs ?? 1000 * 2 ** attempt, 8000));
            continue;
          }
          fallbacks.push({ provider, reason: 'quota atteint' });
          break;
        }

        if (err instanceof ProviderError) {
          // A bad key or an unavailable model will not fix itself on retry.
          fallbacks.push({ provider, reason: err.message });
          break;
        }

        // Network-level failure: worth one retry, then move on.
        if (attempt < retries) {
          await sleep(600 * (attempt + 1));
          continue;
        }
        fallbacks.push({
          provider,
          reason: err instanceof Error ? err.message : 'erreur réseau',
        });
        break;
      }
    }
  }

  throw new AllProvidersFailed(fallbacks);
}
