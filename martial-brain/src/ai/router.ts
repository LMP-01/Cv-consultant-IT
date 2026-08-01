/**
 * Provider routing with a fallback chain.
 *
 * Free tiers are generous but tightly rate-limited, and they do not fail
 * politely — you get a 429 mid-sentence. So the router walks the user's ordered
 * provider list: on a quota error it moves on rather than surfacing a failure,
 * and only gives up once everything has been tried. What it never does is fail
 * silently: the caller gets back which provider actually answered, and the UI
 * says so.
 *
 * Le repli se fait à DEUX niveaux, et l'ordre compte :
 *
 *   1. modèle → modèle, chez le même fournisseur ;
 *   2. fournisseur → fournisseur.
 *
 * Un quota, sur ces plateformes, est presque toujours attaché à un modèle et
 * pas à la clé : `gemini-2.5-pro` est épuisé pendant que `gemini-flash-lite`
 * accepte encore des requêtes. Changer de clé dans ce cas, c'est abandonner un
 * fournisseur parfaitement utilisable — et sur trois clés gratuites, on n'a pas
 * les moyens d'en gaspiller une.
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

/**
 * Les modèles à essayer chez un fournisseur, dans l'ordre.
 *
 * Le modèle choisi d'abord, puis les autres que la clé a listés — au maximum
 * trois de plus. Sans plafond, une clé Groq qui liste quarante modèles
 * enchaînerait quarante requêtes à chaque quota atteint, ce qui prendrait plus
 * de temps que d'échouer franchement.
 *
 * Les modèles manifestement hors sujet sont écartés : vectoriser, transcrire ou
 * modérer ne répond pas à une question, et essayer `whisper-large` après un
 * quota atteint ne produirait qu'une deuxième erreur, plus lente.
 */
const OFF_TOPIC = /embed|whisper|tts|audio|vision|image|guard|moderat|rerank/i;

export function modelChain(settings: Settings, provider: ProviderId, fast: boolean): string[] {
  const chosen = fast
    ? (settings.aiFastModel[provider] ?? settings.aiModels[provider])
    : settings.aiModels[provider];
  if (!chosen) return [];

  const rest = (settings.aiModelList[provider] ?? [])
    .filter((m) => m !== chosen && !OFF_TOPIC.test(m))
    .slice(0, 3);

  return [chosen, ...rest];
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export interface RouteOptions extends GenerateRequest {
  /** Use the cheap model — for classification and query translation. */
  fast?: boolean;
  /** Retries per model before moving on. */
  retries?: number;
  /**
   * Forcer un fournisseur et un modèle — le sélecteur de LUIS AI.
   *
   * Le repli reste actif derrière : imposer un modèle dit par quoi COMMENCER,
   * pas « échoue si celui-là est épuisé ».
   */
  prefer?: { provider: ProviderId; model: string };
  fetcher?: Fetcher;
}

export async function route(settings: Settings, options: RouteOptions): Promise<RouteResult> {
  const { fast = false, retries = 1, prefer, fetcher, ...req } = options;

  let chain = usableProviders(settings, fast);
  if (chain.length === 0) throw new NoProviderConfigured();

  // Le fournisseur imposé passe en tête sans que les autres disparaissent.
  if (prefer && chain.includes(prefer.provider)) {
    chain = [prefer.provider, ...chain.filter((p) => p !== prefer.provider)];
  }

  const fallbacks: { provider: ProviderId; reason: string }[] = [];

  for (const provider of chain) {
    const key = settings.aiKeys[provider];
    if (!key) continue;

    const chainForProvider = modelChain(settings, provider, fast);
    const modelsToTry =
      prefer?.provider === provider && prefer.model
        ? [prefer.model, ...chainForProvider.filter((m) => m !== prefer.model)]
        : chainForProvider;

    // `models:` étiquette la boucle pour qu'une clé invalide puisse
    // l'abandonner entièrement — le `break models` plus bas. Une clé refusée
    // condamne tous les modèles du fournisseur ; les essayer un par un
    // n'obtiendrait que le même 401, trois fois plus lentement.
    models: for (const model of modelsToTry) {
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
          const text = await generate(provider, key, model, req, fetcher);
          return { text, provider, model, fallbacks };
        } catch (err) {
          if (err instanceof RateLimited) {
            // Une pause une fois, au cas où la limite serait par seconde. Si
            // elle tient, c'est le quota du modèle : on passe au modèle
            // suivant de la même clé plutôt que de brûler un fournisseur.
            if (attempt < retries) {
              await sleep(Math.min(err.retryAfterMs ?? 1000 * 2 ** attempt, 8000));
              continue;
            }
            fallbacks.push({ provider, reason: `${model} — quota atteint` });
            continue models;
          }

          if (err instanceof ProviderError) {
            fallbacks.push({ provider, reason: `${model} — ${err.message}` });
            if (err.status === 401 || err.status === 403) break models;
            continue models;
          }

          // Panne réseau : un essai de plus, puis on avance.
          if (attempt < retries) {
            await sleep(600 * (attempt + 1));
            continue;
          }
          fallbacks.push({
            provider,
            reason: `${model} — ${err instanceof Error ? err.message : 'erreur réseau'}`,
          });
          continue models;
        }
      }
    }
  }

  throw new AllProvidersFailed(fallbacks);
}
