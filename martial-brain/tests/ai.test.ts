/**
 * The AI layer is tested against simulated provider responses in each service's
 * real wire format. Live keys are not available here, so what these tests
 * guarantee is the part that is ours: request shape, response parsing, the
 * fallback chain, and — most importantly — that nothing a model invents ever
 * reaches a query.
 */
import { describe, expect, it, vi } from 'vitest';
import { createEntity } from '../src/db/queries';
import {
  describeSpec,
  extractJson,
  isEmptySpec,
  parseFilterSpec,
} from '../src/ai/filterSpec';
import {
  fetchModels,
  generate,
  ProviderError,
  RateLimited,
  suggestModel,
} from '../src/ai/providers';
import { aiConfigured, route, AllProvidersFailed, NoProviderConfigured } from '../src/ai/router';
import { translateQuery } from '../src/ai/tasks';
import type { Settings } from '../src/settings';
import { freshDb } from './helpers';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers });

const settings = (patch: Partial<Settings> = {}): Settings => ({
  theme: 'system',
  aiKeys: { gemini: 'k-gemini', groq: 'k-groq', mistral: 'k-mistral' },
  aiOrder: ['gemini', 'groq', 'mistral'],
  aiModels: { gemini: 'gemini-x', groq: 'llama-x', mistral: 'mistral-x' },
  aiFastModel: {},
  syncUrl: '',
  syncToken: '',
  ...patch,
});

describe('provider wire formats', () => {
  it('speaks Gemini’s shape and reads its reply', async () => {
    const fetcher = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toContain('/models/gemini-x:generateContent');
      expect(url).toContain('key=k-gemini');
      const body = JSON.parse(String(init.body)) as Record<string, any>;
      expect(body.systemInstruction.parts[0].text).toBe('sys');
      expect(body.contents[0].parts[0].text).toBe('question');
      expect(body.generationConfig.responseMimeType).toBe('application/json');
      return json({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] });
    });

    const text = await generate(
      'gemini',
      'k-gemini',
      'gemini-x',
      { system: 'sys', prompt: 'question', json: true },
      fetcher,
    );
    expect(text).toBe('{"ok":true}');
  });

  it('speaks the OpenAI dialect for Groq and Mistral alike', async () => {
    for (const [provider, host] of [
      ['groq', 'api.groq.com'],
      ['mistral', 'api.mistral.ai'],
    ] as const) {
      const fetcher = vi.fn(async (url: string, init: RequestInit) => {
        expect(url).toContain(host);
        expect(url).toContain('/chat/completions');
        expect((init.headers as Record<string, string>).Authorization).toBe('Bearer key');
        const body = JSON.parse(String(init.body)) as Record<string, any>;
        expect(body.messages[0].role).toBe('system');
        expect(body.response_format).toEqual({ type: 'json_object' });
        return json({ choices: [{ message: { content: '{"ok":1}' } }] });
      });

      const text = await generate(
        provider,
        'key',
        'm',
        { system: 's', prompt: 'p', json: true },
        fetcher,
      );
      expect(text).toBe('{"ok":1}');
    }
  });

  it('lists only the models a key can actually generate with', async () => {
    const gemini = await fetchModels('gemini', 'k', async () =>
      json({
        models: [
          { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
        ],
      }),
    );
    expect(gemini).toEqual(['gemini-2.5-flash']);

    const groq = await fetchModels('groq', 'k', async () =>
      json({ data: [{ id: 'llama-3.3-70b' }, { id: 'llama-3.1-8b-instant' }] }),
    );
    expect(groq).toEqual(['llama-3.1-8b-instant', 'llama-3.3-70b']);
  });

  it('prefers a small fast model when the key offers several', () => {
    expect(suggestModel('groq', ['llama-3.3-70b', 'llama-3.1-8b-instant'])).toBe(
      'llama-3.1-8b-instant',
    );
    expect(suggestModel('gemini', ['gemini-2.5-pro', 'gemini-2.5-flash-lite'])).toBe(
      'gemini-2.5-flash-lite',
    );
    // Unknown catalogue: take the first rather than failing.
    expect(suggestModel('mistral', ['quelque-chose'])).toBe('quelque-chose');
  });

  it('distinguishes a quota error from a broken key', async () => {
    await expect(
      generate('groq', 'k', 'm', { system: '', prompt: '' }, async () =>
        json({ error: { message: 'rate limit' } }, 429, { 'retry-after': '3' }),
      ),
    ).rejects.toBeInstanceOf(RateLimited);

    await expect(
      generate('groq', 'k', 'm', { system: '', prompt: '' }, async () =>
        json({ error: { message: 'invalid api key' } }, 401),
      ),
    ).rejects.toBeInstanceOf(ProviderError);
  });
});

describe('fallback chain', () => {
  it('moves to the next provider when one is out of quota', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes('googleapis')) return json({ error: { message: 'quota' } }, 429);
      return json({ choices: [{ message: { content: 'réponse de secours' } }] });
    });

    const result = await route(settings(), {
      system: 's',
      prompt: 'p',
      retries: 0,
      fetcher,
    });

    expect(result.provider).toBe('groq');
    expect(result.text).toBe('réponse de secours');
    // The skip is reported, not swallowed.
    expect(result.fallbacks).toEqual([{ provider: 'gemini', reason: 'quota atteint' }]);
  });

  it('respects the order the user chose', async () => {
    const fetcher = vi.fn(async () =>
      json({ choices: [{ message: { content: 'ok' } }] }),
    );
    const result = await route(settings({ aiOrder: ['mistral', 'groq', 'gemini'] }), {
      system: 's',
      prompt: 'p',
      fetcher,
    });
    expect(result.provider).toBe('mistral');
  });

  it('reports every failure when the whole chain is down', async () => {
    const fetcher = vi.fn(async () => json({ error: { message: 'quota' } }, 429));
    await expect(
      route(settings(), { system: 's', prompt: 'p', retries: 0, fetcher }),
    ).rejects.toBeInstanceOf(AllProvidersFailed);
  });

  it('skips providers with a key but no chosen model', async () => {
    const fetcher = vi.fn(async () => json({ choices: [{ message: { content: 'ok' } }] }));
    const result = await route(
      settings({ aiModels: { groq: 'llama-x' } }), // gemini and mistral unconfigured
      { system: 's', prompt: 'p', fetcher },
    );
    expect(result.provider).toBe('groq');
  });

  it('says so plainly when nothing is configured', async () => {
    expect(aiConfigured(settings({ aiKeys: {}, aiModels: {} }))).toBe(false);
    await expect(
      route(settings({ aiKeys: {}, aiModels: {} }), { system: 's', prompt: 'p' }),
    ).rejects.toBeInstanceOf(NoProviderConfigured);
  });
});

describe('model output is never trusted', () => {
  it('digs JSON out of fences and surrounding prose', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Voici le filtre :\n{"a":1}\nVoilà.')).toEqual({ a: 1 });
    expect(() => extractJson('désolé, je ne peux pas')).toThrow();
  });

  it('drops invented modules, fields and codes', () => {
    const spec = parseFilterSpec({
      types: ['technique', 'licorne', 'counter'],
      fields: { discipline: ['Judo'], champ_invente: ['x'] },
      linkedTo: ['K003', 'PAS_UN_CODE', 'ZZ999'],
      tags: ['jambe'],
      text: 'mae geri',
      // A key nobody asked for, e.g. a model trying to be helpful.
      sql: 'DROP TABLE entities',
    });

    expect(spec.types).toEqual(['technique', 'counter']);
    expect(spec.fields).toEqual({ discipline: ['Judo'] });
    expect(spec.linkedTo).toEqual(['K003']);
    expect(spec).not.toHaveProperty('sql');
  });

  it('degrades to a broader filter rather than a wrong one', () => {
    // Everything invented: the result matches more, never something incorrect.
    const spec = parseFilterSpec({ types: ['licorne'], fields: { faux: ['x'] } });
    expect(isEmptySpec(spec)).toBe(true);
  });

  it('survives a model that answers with nonsense shapes', () => {
    expect(parseFilterSpec(null)).toEqual({});
    expect(parseFilterSpec('une phrase')).toEqual({});
    expect(parseFilterSpec({ types: 'technique' })).toEqual({ types: ['technique'] });
    expect(parseFilterSpec({ tags: [1, 2, 'ok'] })).toEqual({ tags: ['ok'] });
  });

  it('explains in French what filter was actually run', () => {
    const spec = parseFilterSpec({
      types: ['counter'],
      fields: { distance: ['Longue'] },
      linkedTo: ['K003'],
    });
    const described = describeSpec(spec);
    expect(described).toContain('Contres');
    expect(described).toContain('Longue');
    expect(described).toContain('K003');
  });
});

describe('natural-language search end to end', () => {
  it('translates a question into a filter and runs it in SQL', async () => {
    const db = await freshDb();
    const maeGeri = createEntity(db, 'technique', {
      title: 'Mae Geri',
      data: { discipline: 'Kyokushin', distance: 'Longue' },
    });
    createEntity(db, 'counter', {
      title: 'Check sur low kick',
      data: { distance: 'Courte' },
    });
    const good = createEntity(db, 'counter', {
      title: 'Contre sur adversaire qui avance',
      data: { distance: 'Longue' },
    });
    void maeGeri;
    void good;

    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      // The prompt must carry real codes, or the model cannot say "linkedTo".
      const body = JSON.parse(String(init.body)) as Record<string, any>;
      const prompt = body.contents?.[0]?.parts?.[0]?.text ?? '';
      expect(prompt).toContain('K001');
      return json({
        candidates: [
          {
            content: {
              parts: [
                { text: '{"types":["counter"],"fields":{"distance":["Longue"]}}' },
              ],
            },
          },
        ],
      });
    });

    const out = await translateQuery(
      db,
      settings(),
      'les contres à longue distance sur mae geri',
      fetcher,
    );

    expect(fetcher).toHaveBeenCalledOnce();
    expect(out.spec.types).toEqual(['counter']);
    // The filter ran in SQL: the short-distance counter is excluded.
    expect(out.results.map((r) => r.title)).toEqual(['Contre sur adversaire qui avance']);
    db.close();
  });
});
