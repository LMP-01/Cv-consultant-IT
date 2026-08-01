/**
 * Notifications.
 *
 * La barre supérieure en réclame une, et la question devient : notifier de
 * quoi ? Il n'y a personne d'autre dans cette application — aucun message,
 * aucune mention, aucune activité d'équipe. Une pastille rouge qui ne
 * signalerait rien serait un ornement, et le cahier des charges interdit
 * précisément ce genre d'ornement.
 *
 * Ce que le graphe sait, en revanche, ce sont ses propres dettes : des fiches
 * qui ne sont reliées à rien, des hypothèses ouvertes depuis longtemps, des
 * objectifs dont l'échéance est passée, des décisions marquées « à revoir ».
 * Ce sont là de vraies relances, dérivées, jamais saisies à la main.
 */
import type { Db } from './sqlite';

export interface Alert {
  id: string;
  /** `warn` = à traiter, `info` = pour information. Jamais la couleur seule. */
  level: 'warn' | 'info';
  label: string;
  detail: string;
  /** Route de hachage vers ce qu'il faut regarder. */
  href: string;
}

/** Une hypothèse laissée ouverte plus longtemps que ça ne se teste plus. */
const STALE_DAYS = 45;

export function alerts(db: Db, today = new Date()): Alert[] {
  const out: Alert[] = [];
  const iso = today.toISOString().slice(0, 10);

  const orphans =
    db.one<{ n: number }>(
      `SELECT count(*) AS n
         FROM entities e
        WHERE e.deleted = 0
          AND NOT EXISTS (
            SELECT 1 FROM links l
             WHERE l.deleted = 0 AND (l.from_id = e.id OR l.to_id = e.id))`,
    )?.n ?? 0;

  if (orphans > 0) {
    out.push({
      id: 'orphans',
      level: 'warn',
      label: `${orphans} fiche${orphans > 1 ? 's' : ''} isolée${orphans > 1 ? 's' : ''}`,
      detail: 'Reliée à rien : elle n’apporte rien au graphe.',
      href: '#/graph',
    });
  }

  const stale = db.all<{ id: string; code: string; title: string }>(
    `SELECT id, code, title
       FROM entities
      WHERE type = 'hypothesis' AND deleted = 0
        AND COALESCE(json_extract(data,'$.validation'), 'Non testée')
            IN ('Non testée', 'En cours de test')
        AND updated_at < $cutoff
      ORDER BY updated_at ASC
      LIMIT 5`,
    { $cutoff: today.getTime() - STALE_DAYS * 86_400_000 },
  );

  for (const h of stale) {
    out.push({
      id: `hyp:${h.id}`,
      level: 'info',
      label: `${h.code} — ${h.title}`,
      detail: `Hypothèse ouverte depuis plus de ${STALE_DAYS} jours.`,
      href: `#/e/${h.id}`,
    });
  }

  const overdue = db.all<{ id: string; code: string; title: string; due: string }>(
    `SELECT id, code, title, json_extract(data,'$.echeance') AS due
       FROM entities
      WHERE type = 'objective' AND deleted = 0
        AND due IS NOT NULL AND due <> '' AND due < $today
        AND COALESCE(json_extract(data,'$.statut'), '') NOT IN ('Atteint', 'Abandonné')
      ORDER BY due ASC
      LIMIT 5`,
    { $today: iso },
  );

  for (const o of overdue) {
    out.push({
      id: `obj:${o.id}`,
      level: 'warn',
      label: `${o.code} — ${o.title}`,
      detail: `Échéance dépassée (${o.due}).`,
      href: `#/e/${o.id}`,
    });
  }

  const toReview = db.all<{ id: string; code: string; title: string }>(
    `SELECT id, code, title
       FROM entities
      WHERE type = 'decision' AND deleted = 0
        AND json_extract(data,'$.statut') = 'À revoir'
      ORDER BY COALESCE(json_extract(data,'$.date'), '') ASC
      LIMIT 5`,
  );

  for (const d of toReview) {
    out.push({
      id: `dec:${d.id}`,
      level: 'info',
      label: `${d.code} — ${d.title}`,
      detail: 'Décision à revoir.',
      href: `#/e/${d.id}`,
    });
  }

  return out;
}
