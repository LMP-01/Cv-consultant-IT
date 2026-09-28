/**
 * Every number the dashboard and analytics screens show (§4.1, §5.3).
 *
 * All of it is computed in SQL, none of it is generated. "Which techniques have
 * you forgotten" and "what are your main weapons" are counting questions with
 * exact answers; handing them to a language model would trade a correct number
 * for a plausible one. The LLM's job in this app is translation and prose, not
 * arithmetic.
 *
 * "Used in a bout" means: linked to a sparring or a fight. That is the whole
 * reason the graph exists — usage is a relation, never a field somebody has to
 * remember to tick.
 */
import type { Db } from './sqlite';
import type { EntityKey } from '../domain/schema';

/** Entities that represent something you actually did, on a date. */
const BOUT_TYPES = `('sparring','fight')`;

export interface UsageRow {
  id: string;
  code: string;
  title: string;
  uses: number;
  lastUsed: string | null;
}

/**
 * Techniques ranked by how often a bout references them.
 * `type` is a parameter so the same question works for combos and counters.
 */
export function usageRanking(db: Db, type: EntityKey, limit = 100): UsageRow[] {
  return db.all<UsageRow>(
    `SELECT e.id, e.code, e.title,
            count(b.id)                       AS uses,
            max(json_extract(b.data,'$.date')) AS lastUsed
       FROM entities e
       LEFT JOIN links l
         ON l.deleted = 0 AND (l.from_id = e.id OR l.to_id = e.id)
       LEFT JOIN entities b
         ON b.id = CASE WHEN l.from_id = e.id THEN l.to_id ELSE l.from_id END
        AND b.deleted = 0
        AND b.type IN ${BOUT_TYPES}
      WHERE e.type = $type AND e.deleted = 0
      GROUP BY e.id
      ORDER BY uses DESC, e.code ASC
      LIMIT ${Number(limit)}`,
    { $type: type },
  );
}

/** Your main weapons: the techniques bouts mention most. */
export function mainWeapons(db: Db, limit = 5): UsageRow[] {
  return usageRanking(db, 'technique').filter((r) => r.uses > 0).slice(0, limit);
}

/**
 * Techniques no bout has ever referenced.
 *
 * The most useful thing a training log can tell you is what you have quietly
 * stopped doing — that is exactly what a list of fiches with zero bout links is.
 */
export function forgottenTechniques(db: Db, limit = 12): UsageRow[] {
  return usageRanking(db, 'technique').filter((r) => r.uses === 0).slice(0, limit);
}

export interface RateRow {
  id: string;
  code: string;
  title: string;
  rate: number;
}

/** Self-reported success rates for combos (§4.3) and counters (§4.4). */
export function successRates(db: Db, type: 'combo' | 'counter'): RateRow[] {
  return db.all<RateRow>(
    `SELECT id, code, title, CAST(json_extract(data,'$.reussite') AS INTEGER) AS rate
       FROM entities
      WHERE type = $type AND deleted = 0
        AND json_extract(data,'$.reussite') IS NOT NULL
      ORDER BY rate DESC`,
    { $type: type },
  );
}

export interface CountRow {
  label: string;
  count: number;
}

/** How a field's values are distributed across a module. */
export function fieldDistribution(db: Db, type: EntityKey, field: string): CountRow[] {
  return db.all<CountRow>(
    `SELECT json_extract(data, $path) AS label, count(*) AS count
       FROM entities
      WHERE type = $type AND deleted = 0
        AND label IS NOT NULL AND label <> ''
      GROUP BY label
      ORDER BY count DESC, label ASC`,
    { $path: `$.${field}`, $type: type },
  );
}

/** Same, but across bouts only — "how do I actually spend my mat time". */
export function boutFieldDistribution(db: Db, field: string): CountRow[] {
  return db.all<CountRow>(
    `SELECT json_extract(data, $path) AS label, count(*) AS count
       FROM entities
      WHERE type IN ${BOUT_TYPES} AND deleted = 0
        AND label IS NOT NULL AND label <> ''
      GROUP BY label
      ORDER BY count DESC, label ASC`,
    { $path: `$.${field}` },
  );
}

export interface MinutesRow {
  label: string;
  minutes: number;
}

/** Training minutes per discipline (§5.3). */
export function minutesByDiscipline(db: Db): MinutesRow[] {
  return db.all<MinutesRow>(
    `SELECT json_extract(data,'$.discipline')                  AS label,
            COALESCE(SUM(CAST(json_extract(data,'$.duree') AS INTEGER)), 0) AS minutes
       FROM entities
      WHERE type IN ${BOUT_TYPES} AND deleted = 0
        AND label IS NOT NULL AND label <> ''
      GROUP BY label
      ORDER BY minutes DESC`,
  );
}

/** Total logged minutes and bout count. */
export function trainingTotals(db: Db): { minutes: number; bouts: number } {
  const row = db.one<{ minutes: number | null; bouts: number }>(
    `SELECT COALESCE(SUM(CAST(json_extract(data,'$.duree') AS INTEGER)),0) AS minutes,
            count(*) AS bouts
       FROM entities
      WHERE type IN ${BOUT_TYPES} AND deleted = 0`,
  );
  return { minutes: row?.minutes ?? 0, bouts: row?.bouts ?? 0 };
}

/** Official-fight record. Sparrings are excluded: they have no result to keep. */
export function fightRecord(db: Db): CountRow[] {
  return db.all<CountRow>(
    `SELECT json_extract(data,'$.resultat') AS label, count(*) AS count
       FROM entities
      WHERE type = 'fight' AND deleted = 0
        AND label IS NOT NULL AND label <> ''
      GROUP BY label
      ORDER BY count DESC`,
  );
}

/** Errors ranked by how many bouts mention them (§5.3). */
export function errorFrequency(db: Db, limit = 10): UsageRow[] {
  return usageRanking(db, 'error', limit).filter((r) => r.uses > 0);
}

/** Situations ranked by how many bouts mention them. */
export function recurringSituations(db: Db, limit = 10): UsageRow[] {
  return usageRanking(db, 'situation', limit).filter((r) => r.uses > 0);
}

export interface ObjectiveRow {
  id: string;
  code: string;
  title: string;
  progress: number;
  status: string;
  horizon: string;
  due: string | null;
}

/** Objective progress (§4.13), unfinished ones first. */
export function objectiveProgress(db: Db): ObjectiveRow[] {
  return db.all<ObjectiveRow>(
    `SELECT id, code, title,
            COALESCE(CAST(json_extract(data,'$.progression') AS INTEGER), 0) AS progress,
            COALESCE(json_extract(data,'$.statut'),   '')                    AS status,
            COALESCE(json_extract(data,'$.horizon'),  '')                    AS horizon,
            json_extract(data,'$.echeance')                                  AS due
       FROM entities
      WHERE type = 'objective' AND deleted = 0
      ORDER BY CASE status WHEN 'En cours' THEN 0 WHEN 'À faire' THEN 1 ELSE 2 END,
               progress DESC, code ASC`,
  );
}

export interface RecentBout {
  id: string;
  type: EntityKey;
  code: string;
  title: string;
  date: string | null;
  result: string | null;
  discipline: string | null;
}

/** Latest sparrings and fights (§4.1). */
export function recentBouts(db: Db, limit = 6): RecentBout[] {
  return db.all<RecentBout>(
    `SELECT id, type, code, title,
            json_extract(data,'$.date')       AS date,
            json_extract(data,'$.resultat')   AS result,
            json_extract(data,'$.discipline') AS discipline
       FROM entities
      WHERE type IN ${BOUT_TYPES} AND deleted = 0
      ORDER BY COALESCE(date, '') DESC, updated_at DESC
      LIMIT ${Number(limit)}`,
  );
}

/** Most recently touched fiches, whatever the module. */
export function recentlyEdited(db: Db, limit = 8): {
  id: string;
  type: EntityKey;
  code: string;
  title: string;
  updated_at: number;
}[] {
  return db.all(
    `SELECT id, type, code, title, updated_at
       FROM entities
      WHERE deleted = 0
      ORDER BY updated_at DESC
      LIMIT ${Number(limit)}`,
  );
}

export interface GraphHealth {
  entities: number;
  links: number;
  orphans: number;
  hypothesesOpen: number;
}

/**
 * How well-connected the graph is.
 *
 * Orphan count is the number worth watching: a fiche with no relation is a note
 * in a notebook, which is precisely what §1 says this tool is not.
 */
export function graphHealth(db: Db): GraphHealth {
  const entities =
    db.one<{ n: number }>(`SELECT count(*) AS n FROM entities WHERE deleted = 0`)?.n ?? 0;
  const links =
    db.one<{ n: number }>(`SELECT count(*) AS n FROM links WHERE deleted = 0`)?.n ?? 0;
  const orphans =
    db.one<{ n: number }>(
      `SELECT count(*) AS n FROM entities e
        WHERE e.deleted = 0
          AND NOT EXISTS (
            SELECT 1 FROM links l
             WHERE l.deleted = 0 AND (l.from_id = e.id OR l.to_id = e.id))`,
    )?.n ?? 0;
  const hypothesesOpen =
    db.one<{ n: number }>(
      `SELECT count(*) AS n FROM entities
        WHERE type = 'hypothesis' AND deleted = 0
          AND COALESCE(json_extract(data,'$.validation'),'') IN ('', 'Non testée', 'En cours de test')`,
    )?.n ?? 0;

  return { entities, links, orphans, hypothesesOpen };
}
