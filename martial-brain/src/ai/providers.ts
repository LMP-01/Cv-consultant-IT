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
    .sort();
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
