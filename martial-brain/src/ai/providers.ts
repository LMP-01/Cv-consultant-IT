/**
 * Provider adapters — two of them, for three services.
 *
 * Mistral and Groq both speak the OpenAI dialect (`/chat/completions`,
 * `/models`), so one adapter covers both and differs only by base URL. Gemini
 * has its own shape and gets its own. The upshot is that any other
 * OpenAI-compatible service — OpenRouter, Together, a local Ollama — is a line
 * of configuration rather than new code.
 *
 * No model list is hard-coded. Free tiers change what they offer faster than
 * this file could track, so the app asks each provider what THIS key is allowed
 * to use and shows that.
 */

export type ProviderId = 'gemini' | 'groq' | 'mistral';

export interface ProviderDef {
  id: ProviderId;
  label: string;
  /** Where the user gets a key. */
  keyUrl: string;
  /** Free tier in one line, for the settings screen. */
  note: string;
  /** Sensible starting model if the provider offers it. */
  preferred: string[];
}

export const PROVIDERS: readonly ProviderDef[] = [
  {
    id: 'gemini',
    label: 'Google Gemini',
    keyUrl: 'https://aistudio.google.com/apikey',
    note: 'Palier gratuit large. Bon en rédaction française.',
    preferred: ['flash-lite', 'flash'],
  },
  {
    id: 'groq',
    label: 'Groq',
    keyUrl: 'https://console.groq.com/keys',
    note: 'Inférence très rapide, plusieurs modèles ouverts hébergés.',
    preferred: ['instant', '8b', '70b'],
  },
  {
    id: 'mistral',
    label: 'Mistral',
    keyUrl: 'https://console.mistral.ai/api-keys',
    note: 'Modèles européens, palier gratuit sur La Plateforme.',
    preferred: ['small', 'nemo'],
  },
] as const;

export function providerDef(id: ProviderId): ProviderDef {
  const found = PROVIDERS.find((p) => p.id === id);
  if (!found) throw new Error(`fournisseur inconnu : ${id}`);
  return found;
}

export interface GenerateRequest {
  system: string;
  prompt: string;
  /** Ask for JSON back. The caller still validates — see ai/schema.ts. */
  json?: boolean;
  /** JSON Schema, when the provider can enforce one (Gemini). */
  schema?: Record<string, unknown>;
  temperature?: number;
  maxTokens?: number;
}

/** Raised when the provider says "slow down" or "you are out of quota". */
export class RateLimited extends Error {
  constructor(
    readonly provider: ProviderId,
    readonly retryAfterMs: number | undefined,
    message: string,
  ) {
    super(message);
    this.name = 'RateLimited';
  }
}

/** Raised when the key is missing, wrong, or lacks access to the model. */
export class ProviderError extends Error {
  constructor(
    readonly provider: ProviderId,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

const OPENAI_BASES: Record<string, string> = {
  groq: 'https://api.groq.com/openai/v1',
  mistral: 'https://api.mistral.ai/v1',
};

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * How the request reaches the provider.
 *
 * Direct from the browser by default: the key is the user's, the destination is
 * the user's chosen provider, and no infrastructure needs to exist for the AI
 * features to work. If a provider ever refuses browser origins, pointing this
 * at the sync Worker routes around it without touching the adapters.
 */
export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

const directFetch: Fetcher = (url, init) => fetch(url, init);

async function readError(res: Response, provider: ProviderId): Promise<never> {
  const text = await res.text().catch(() => '');
  let detail = text.slice(0, 300);
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } | string };
    const message = typeof parsed.error === 'string' ? parsed.error : parsed.error?.message;
    if (message) detail = message;
  } catch {
    /* not JSON; the raw text will do */
  }

  if (res.status === 429 || res.status === 503) {
    const header = res.headers.get('retry-after');
    const retryAfterMs = header ? Number(header) * 1000 : undefined;
    throw new RateLimited(provider, retryAfterMs, detail || 'quota atteint');
  }
  throw new ProviderError(provider, res.status, detail || `HTTP ${res.status}`);
}

/* ── Model discovery ──────────────────────────────────────────────────────── */

/**
 * Un identifiant listé n'est pas toujours un modèle de conversation.
 *
 * Gemini expose ses produits « Antigravity » et « Deep Research » par le même
 * point d'entrée que ses modèles, `supportedGenerationMethods` déclarant
 * `generateContent` alors que l'appel échoue réellement (« this model only
 * supports Interactions API », constaté en usage). La métadonnée du
 * fournisseur ment ; le nom, lui, ne changera pas au prochain lancement
 * produit — tout modèle de conversation Gemini s'appelle `gemini-*`, donc
 * une liste blanche par préfixe est plus sûre qu'un filtre sur la métadonnée
 * déclarée.
 *
 * Groq et Mistral n'ont pas cette séparation par préfixe : leurs catalogues
 * mélangent conversation, transcription (whisper), synthèse vocale (tts,
 * orpheus, playai) et modération (guard) sous des noms sans convention
 * commune, donc on écarte par catégorie connue plutôt que par famille.
 */
function isChatModel(provider: ProviderId, id: string): boolean {
  if (provider === 'gemini') return /^gemini-/i.test(id);
  return !/whisper|\btts\b|-tts|orpheus|playai|guard|moderat|rerank|embed/i.test(id);
}

export async function fetchModels(
  provider: ProviderId,
  apiKey: string,
  fetcher: Fetcher = directFetch,
): Promise<string[]> {
  if (provider === 'gemini') {
    const res = await fetcher(`${GEMINI_BASE}/models?key=${encodeURIComponent(apiKey)}`, {
      method: 'GET',
    });
    if (!res.ok) await readError(res, provider);
    const body = (await res.json()) as {
      models?: { name?: string; supportedGenerationMethods?: string[] }[];
    };
    return (body.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => (m.name ?? '').replace(/^models\//, ''))
      .filter(Boolean)
      .filter((id) => isChatModel('gemini', id))
      .sort();
  }

  const base = OPENAI_BASES[provider];
  if (!base) throw new ProviderError(provider, 0, 'fournisseur non pris en charge');

  const res = await fetcher(`${base}/models`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) await readError(res, provider);
  const body = (await res.json()) as { data?: { id?: string }[] };
  return (body.data ?? [])
    .map((m) => m.id ?? '')
    .filter(Boolean)
    .filter((id) => isChatModel(provider, id))
    .sort();
}

/**
 * Les modèles d'embedding, quand le fournisseur en propose.
 *
 * Groq n'a aucun point d'entrée d'embedding : il génère, il ne vectorise pas.
 * C'est pour cette raison que le RAG doit fonctionner SANS vecteurs — voir
 * `rag/retrieve.ts`. Les vecteurs améliorent le rappel, ils ne le portent pas.
 */
export const EMBEDDING_MODELS: Partial<Record<ProviderId, { model: string; dims: number }>> = {
  // 3072 dimensions par défaut, réductibles à 1536 ou 768. On demande 768 :
  // c'est quatre fois moins d'octets à stocker dans SQLite pour une perte de
  // rappel marginale sur des corpus de quelques centaines de passages.
  gemini: { model: 'gemini-embedding-001', dims: 768 },
  mistral: { model: 'mistral-embed', dims: 1024 },
};

export function canEmbed(provider: ProviderId): boolean {
  return provider in EMBEDDING_MODELS;
}

/**
 * Vectorise un lot de passages.
 *
 * Le lot est la seule façon raisonnable de procéder : un pack de connaissances
 * fait quelques dizaines de passages, et une requête par passage épuiserait la
 * limite par minute du palier gratuit avant la fin de l'indexation.
 */
export async function embed(
  provider: ProviderId,
  apiKey: string,
  texts: readonly string[],
  fetcher: Fetcher = directFetch,
): Promise<Float32Array[]> {
  const spec = EMBEDDING_MODELS[provider];
  if (!spec) throw new ProviderError(provider, 0, 'ce fournisseur ne vectorise pas');
  if (texts.length === 0) return [];

  if (provider === 'gemini') {
    const res = await fetcher(
      `${GEMINI_BASE}/models/${spec.model}:batchEmbedContents?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: texts.map((text) => ({
            model: `models/${spec.model}`,
            content: { parts: [{ text }] },
            outputDimensionality: spec.dims,
            taskType: 'RETRIEVAL_DOCUMENT',
          })),
        }),
      },
    );
    if (!res.ok) await readError(res, provider);
    const body = (await res.json()) as { embeddings?: { values?: number[] }[] };
    return (body.embeddings ?? []).map((e) => normalise(e.values ?? []));
  }

  const base = OPENAI_BASES[provider];
  if (!base) throw new ProviderError(provider, 0, 'fournisseur non pris en charge');

  const res = await fetcher(`${base}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: spec.model, input: texts }),
  });
  if (!res.ok) await readError(res, provider);
  const body = (await res.json()) as { data?: { index?: number; embedding?: number[] }[] };

  // L'ordre du tableau renvoyé n'est pas garanti ; `index` l'est.
  const out = new Array<Float32Array>(texts.length).fill(new Float32Array(0));
  for (const [i, item] of (body.data ?? []).entries()) {
    out[item.index ?? i] = normalise(item.embedding ?? []);
  }
  return out;
}

/**
 * Vecteurs ramenés à la norme 1.
 *
 * Le produit scalaire de deux vecteurs unitaires EST leur cosinus. Normaliser
 * une fois à l'indexation évite de recalculer deux normes à chaque comparaison,
 * au moment précis où l'on compare la requête à des centaines de passages.
 * Gemini le demande explicitement pour les dimensions autres que 3072.
 */
function normalise(values: readonly number[]): Float32Array {
  const vector = Float32Array.from(values);
  let sum = 0;
  for (const v of vector) sum += v * v;
  const norm = Math.sqrt(sum);
  if (norm > 0) for (let i = 0; i < vector.length; i += 1) vector[i] = (vector[i] as number) / norm;
  return vector;
}

/**
 * Pick a starting model from what the key actually grants.
 * Prefers the small/fast members of the family — this app's LLM work is short
 * structured output and summaries, not deep reasoning.
 */
export function suggestModel(provider: ProviderId, available: readonly string[]): string {
  const def = providerDef(provider);
  for (const hint of def.preferred) {
    const hit = available.find((m) => m.toLowerCase().includes(hint));
    if (hit) return hit;
  }
  return available[0] ?? '';
}

/* ── Generation ───────────────────────────────────────────────────────────── */

export async function generate(
  provider: ProviderId,
  apiKey: string,
  model: string,
  req: GenerateRequest,
  fetcher: Fetcher = directFetch,
): Promise<string> {
  if (provider === 'gemini') return generateGemini(apiKey, model, req, fetcher);
  return generateOpenAiCompatible(provider, apiKey, model, req, fetcher);
}

async function generateGemini(
  apiKey: string,
  model: string,
  req: GenerateRequest,
  fetcher: Fetcher,
): Promise<string> {
  const generationConfig: Record<string, unknown> = {
    temperature: req.temperature ?? 0.3,
    maxOutputTokens: req.maxTokens ?? 2048,
  };
  if (req.json) {
    generationConfig.responseMimeType = 'application/json';
    // Gemini can enforce the shape server-side; the others cannot, which is
    // why the caller validates the parsed result either way.
    if (req.schema) generationConfig.responseSchema = req.schema;
  }

  const res = await fetcher(
    `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
        generationConfig,
      }),
    },
  );
  if (!res.ok) await readError(res, 'gemini');

  const body = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };

  if (body.promptFeedback?.blockReason) {
    throw new ProviderError('gemini', 200, `réponse bloquée (${body.promptFeedback.blockReason})`);
  }
  const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text) throw new ProviderError('gemini', 200, 'réponse vide');
  return text;
}

async function generateOpenAiCompatible(
  provider: ProviderId,
  apiKey: string,
  model: string,
  req: GenerateRequest,
  fetcher: Fetcher,
): Promise<string> {
  const base = OPENAI_BASES[provider];
  if (!base) throw new ProviderError(provider, 0, 'fournisseur non pris en charge');

  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: req.system },
      { role: 'user', content: req.prompt },
    ],
    temperature: req.temperature ?? 0.3,
    max_tokens: req.maxTokens ?? 2048,
  };
  // No schema enforcement here — json_object only guarantees valid JSON, not
  // the right shape. ai/schema.ts is what actually holds the contract.
  if (req.json) body.response_format = { type: 'json_object' };

  const res = await fetcher(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) await readError(res, provider);

  const parsed = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = parsed.choices?.[0]?.message?.content ?? '';
  if (!text) throw new ProviderError(provider, 200, 'réponse vide');
  return text;
}
