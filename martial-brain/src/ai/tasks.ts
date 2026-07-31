/**
 * What the language model is actually asked to do (§5.2).
 *
 * Two kinds of work, and the split matters:
 *   · translation — a question becomes a FilterSpec, which SQL then executes.
 *     Small, constrained, verifiable; this is what free-tier models are good at.
 *   · prose — summarising a sparring, drafting a training plan. Judgement calls
 *     that a human reads and edits, where being roughly right is useful.
 *
 * What is NOT here: anything numeric. Success rates, most-used techniques,
 * error frequency and training volume all live in db/analytics.ts, computed in
 * SQL. A model asked to count would produce a plausible number, and a plausible
 * number is worse than none.
 */
import { getEntityByCode, searchEntities, type EntityRecord } from '../db/queries';
import type { Db } from '../db/sqlite';
import { neighboursByType } from '../domain/links';
import { ENTITY_DEFS, entityDef, DISCIPLINES, DISTANCES } from '../domain/schema';
import type { Settings } from '../settings';
import { extractJson, parseFilterSpec, type FilterSpec } from './filterSpec';
import type { Fetcher } from './providers';
import { route, type RouteResult } from './router';

/* ── Natural-language search (§5.1) ───────────────────────────────────────── */

const MODULE_CATALOGUE = ENTITY_DEFS.map(
  (d) => `- "${d.key}" (${d.prefix}) : ${d.plural}`,
).join('\n');

const FILTER_SYSTEM = `Tu convertis une question sur un carnet martial en filtre JSON.
Tu ne réponds JAMAIS en prose. Tu renvoies UNIQUEMENT un objet JSON.

Modules disponibles (champ "types") :
${MODULE_CATALOGUE}

Forme attendue :
{
  "text": "mots-clés à chercher en texte libre (optionnel)",
  "types": ["technique", "counter"],
  "fields": { "discipline": ["Kyokushin"], "distance": ["Longue"] },
  "tags": ["jambe"],
  "linkedTo": ["K003"]
}

Règles :
- Toutes les clés sont optionnelles ; omets celles qui ne s'appliquent pas.
- "linkedTo" contient des identifiants de fiches (K003, S001, PR002) mentionnés
  explicitement dans la question ou fournis dans le contexte.
- Valeurs possibles pour "discipline" : ${DISCIPLINES.join(', ')}.
- Valeurs possibles pour "distance" : ${DISTANCES.join(', ')}.
- Ne mets dans "text" que des mots qui apparaîtraient dans une fiche, jamais la
  question entière.`;

export interface TranslatedQuery {
  spec: FilterSpec;
  results: EntityRecord[];
  provider: string;
  model: string;
  fallbacks: { provider: string; reason: string }[];
}

/**
 * Turn a question into a filter, then run it.
 *
 * The model is given the codes of fiches whose titles appear in the question,
 * because "les contres sur mae geri" is only answerable if something maps
 * "mae geri" to K003 — and a lookup does that better than a model guessing.
 */
export async function translateQuery(
  db: Db,
  settings: Settings,
  question: string,
  fetcher?: Fetcher,
): Promise<TranslatedQuery> {
  // Cheap lexical pre-pass: give the model real codes to work with. OR-matching
  // because a whole question shares no single fiche's full wording — the point
  // is to surface the handful of fiches it might be about, best-ranked first.
  const hints = searchEntities(db, question, { limit: 8, match: 'or' })
    .map((r) => `${r.code} = ${r.title} (${entityDef(r.type).label})`)
    .join('\n');

  const prompt = hints
    ? `Question : ${question}\n\nFiches existantes qui pourraient correspondre :\n${hints}`
    : `Question : ${question}`;

  const answer: RouteResult = await route(settings, {
    system: FILTER_SYSTEM,
    prompt,
    json: true,
    fast: true,
    temperature: 0,
    maxTokens: 500,
    ...(fetcher ? { fetcher } : {}),
  });

  const spec = parseFilterSpec(extractJson(answer.text));

  // Codes → ids. Unknown codes were already dropped by the validator; ones that
  // parse but do not exist locally are dropped here.
  const linkedIds = (spec.linkedTo ?? [])
    .map((code) => getEntityByCode(db, code)?.id)
    .filter((id): id is string => Boolean(id));

  const results = searchEntities(db, spec.text ?? '', {
    ...(spec.types ? { types: spec.types } : {}),
    ...(spec.fields ? { fields: spec.fields } : {}),
    ...(spec.tags ? { tags: spec.tags } : {}),
    ...(linkedIds[0] ? { linkedTo: linkedIds[0] } : {}),
    limit: 200,
  });

  return {
    spec,
    results,
    provider: answer.provider,
    model: answer.model,
    fallbacks: answer.fallbacks,
  };
}

/* ── Bout summary (§5.2) ──────────────────────────────────────────────────── */

const SUMMARY_SYSTEM = `Tu es l'assistant d'un pratiquant d'arts martiaux qui tient un
carnet de connaissances. On te donne une fiche de sparring ou de combat et les
fiches qui y sont reliées.

Rends un texte court en français, structuré ainsi :
**Ce qui a marché** — 2 à 3 points concrets.
**Ce qui a coincé** — 2 à 3 points concrets.
**À tester** — 1 ou 2 pistes formulées comme des hypothèses vérifiables.

Contraintes :
- Appuie-toi UNIQUEMENT sur ce qui est écrit. N'invente aucune technique, aucun
  résultat, aucun chiffre.
- Cite les fiches par leur identifiant quand tu les mentionnes (K003, A001).
- Pas de statistiques ni de pourcentages : ce n'est pas ton rôle.
- Sois direct. Pas d'introduction, pas de conclusion.`;

function renderRecord(record: EntityRecord): string {
  const def = entityDef(record.type);
  const lines = [`${record.code} — ${record.title} (${def.label})`];
  for (const field of def.fields) {
    const value = record.data[field.name];
    if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) continue;
    lines.push(`  ${field.label} : ${Array.isArray(value) ? value.join(', ') : String(value)}`);
  }
  return lines.join('\n');
}

export async function summariseBout(
  db: Db,
  settings: Settings,
  bout: EntityRecord,
): Promise<RouteResult> {
  const neighbours = neighboursByType(db, bout.id);
  const context = [...neighbours.entries()]
    .map(([type, records]) => {
      const label = entityDef(type).plural;
      return `${label} :\n${records.map((r) => `  ${r.code} — ${r.title}`).join('\n')}`;
    })
    .join('\n\n');

  return route(settings, {
    system: SUMMARY_SYSTEM,
    prompt: `${renderRecord(bout)}\n\nFiches reliées :\n${context || '(aucune)'}`,
    temperature: 0.35,
    maxTokens: 900,
  });
}

/* ── Relation suggestions (§5.2) ──────────────────────────────────────────── */

const SUGGEST_SYSTEM = `Tu aides à relier les fiches d'un carnet martial.
On te donne une fiche et une liste de fiches candidates.

Renvoie UNIQUEMENT un JSON de la forme :
{ "linkedTo": ["K003", "S001"], "pourquoi": { "K003": "raison en une phrase" } }

Règles :
- Choisis au maximum 6 fiches, uniquement parmi les candidates proposées.
- N'invente aucun identifiant.
- Ne propose un lien que s'il est justifiable en une phrase concrète.`;

export interface Suggestion {
  code: string;
  record: EntityRecord;
  why: string;
}

export async function suggestRelations(
  db: Db,
  settings: Settings,
  record: EntityRecord,
): Promise<{ suggestions: Suggestion[]; result: RouteResult }> {
  const def = entityDef(record.type);
  const already = new Set(
    [...neighboursByType(db, record.id).values()].flat().map((r) => r.id),
  );

  // Candidates come from the modules this one is normally related to; the
  // model chooses among real fiches rather than imagining them.
  const candidates = def.relations
    .flatMap((target) => searchEntities(db, '', { types: [target], limit: 30 }))
    .filter((r) => r.id !== record.id && !already.has(r.id))
    .slice(0, 80);

  if (candidates.length === 0) {
    return {
      suggestions: [],
      result: { text: '', provider: 'gemini', model: '', fallbacks: [] },
    };
  }

  const result = await route(settings, {
    system: SUGGEST_SYSTEM,
    prompt:
      `Fiche à relier :\n${renderRecord(record)}\n\n` +
      `Candidates :\n${candidates.map((r) => `${r.code} — ${r.title} (${entityDef(r.type).label})`).join('\n')}`,
    json: true,
    fast: true,
    temperature: 0.2,
    maxTokens: 700,
  });

  const raw = extractJson(result.text) as {
    linkedTo?: unknown;
    pourquoi?: Record<string, string>;
  };
  const codes = parseFilterSpec({ linkedTo: raw.linkedTo }).linkedTo ?? [];

  const suggestions: Suggestion[] = [];
  for (const code of codes) {
    const hit = candidates.find((c) => c.code === code);
    if (!hit) continue; // not among the candidates: discarded
    suggestions.push({ code, record: hit, why: raw.pourquoi?.[code] ?? '' });
  }

  return { suggestions, result };
}

/* ── Training plan (§5.2) ─────────────────────────────────────────────────── */

const PLAN_SYSTEM = `Tu construis un plan d'entraînement pour un pratiquant d'arts
martiaux, à partir de son carnet.

Rends un plan sur 4 semaines en français :
- une intention par semaine, en une phrase ;
- 2 à 3 exercices concrets par semaine, en citant les fiches existantes (E001,
  K003, C001) quand elles s'appliquent ;
- un critère de réussite observable par semaine.

Contraintes :
- Appuie-toi sur les objectifs, erreurs et techniques oubliées fournis.
- N'invente pas de fiches : cite uniquement les identifiants donnés.
- Pas de conseils médicaux, de nutrition ni de dosage de charge.`;

export async function trainingPlan(
  db: Db,
  settings: Settings,
  context: {
    objectives: { code: string; title: string; progress: number }[];
    errors: { code: string; title: string; uses: number }[];
    forgotten: { code: string; title: string }[];
    exercises: EntityRecord[];
  },
): Promise<RouteResult> {
  void db;
  const prompt = [
    'Objectifs en cours :',
    context.objectives.map((o) => `  ${o.code} — ${o.title} (${o.progress} %)`).join('\n') || '  (aucun)',
    '',
    'Erreurs les plus fréquentes :',
    context.errors.map((e) => `  ${e.code} — ${e.title} (constatée ${e.uses}×)`).join('\n') || '  (aucune)',
    '',
    'Techniques fichées mais jamais travaillées en séance :',
    context.forgotten.map((t) => `  ${t.code} — ${t.title}`).join('\n') || '  (aucune)',
    '',
    'Exercices déjà définis :',
    context.exercises.map((e) => `  ${e.code} — ${e.title}`).join('\n') || '  (aucun)',
  ].join('\n');

  return route(settings, {
    system: PLAN_SYSTEM,
    prompt,
    temperature: 0.45,
    maxTokens: 1400,
  });
}
