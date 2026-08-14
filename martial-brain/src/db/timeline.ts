/**
 * Les fiches datées, à plat.
 *
 * La timeline et le calendrier posent la même question — « qu'est-ce qui s'est
 * passé, et quand ? » — et la réponse ne vient pas d'un module dédié : elle est
 * répartie sur ceux qui portent une date. Un sparring a sa date, une décision
 * la sienne, un objectif porte une échéance. Une seule requête les réunit,
 * plutôt que deux écrans qui iraient chacun chercher les mêmes lignes.
 *
 * Les dates sont stockées telles que saisies (`AAAA-MM-JJ`), donc comparables
 * et triables comme du texte. C'est aussi ce qui évite tout décalage de fuseau :
 * un combat du 12 avril reste le 12 avril, où qu'on ouvre l'application.
 */
import { type EntityKey } from '../domain/schema';
import type { Db } from './sqlite';

export interface DatedEvent {
  id: string;
  type: EntityKey;
  code: string;
  title: string;
  /** `AAAA-MM-JJ`. */
  date: string;
  /** Ce que la date signifie pour ce module — « échéance » n'est pas « eu lieu ». */
  when: 'passé' | 'échéance';
  /** Résultat, validation ou statut : la ligne dit quelque chose, pas juste un titre. */
  note: string;
}

const SQL = `
  SELECT id, type, code, title,
         json_extract(data,'$.date') AS date,
         'passé' AS when_,
         COALESCE(json_extract(data,'$.resultat'), '') AS note
    FROM entities
   WHERE type IN ('sparring','fight') AND deleted = 0 AND date IS NOT NULL AND date <> ''

  UNION ALL

  SELECT id, type, code, title,
         json_extract(data,'$.date') AS date,
         'passé' AS when_,
         COALESCE(json_extract(data,'$.validation'), '') AS note
    FROM entities
   WHERE type = 'hypothesis' AND deleted = 0 AND date IS NOT NULL AND date <> ''

  UNION ALL

  SELECT id, type, code, title,
         json_extract(data,'$.date') AS date,
         'passé' AS when_,
         COALESCE(json_extract(data,'$.statut'), '') AS note
    FROM entities
   WHERE type = 'decision' AND deleted = 0 AND date IS NOT NULL AND date <> ''

  UNION ALL

  SELECT id, type, code, title,
         json_extract(data,'$.echeance') AS date,
         'échéance' AS when_,
         COALESCE(json_extract(data,'$.statut'), '') AS note
    FROM entities
   WHERE type = 'objective' AND deleted = 0 AND date IS NOT NULL AND date <> ''
`;

interface Row {
  id: string;
  type: EntityKey;
  code: string;
  title: string;
  date: string;
  when_: string;
  note: string;
}

const toEvent = (r: Row): DatedEvent => ({
  id: r.id,
  type: r.type,
  code: r.code,
  title: r.title,
  date: r.date,
  when: r.when_ === 'échéance' ? 'échéance' : 'passé',
  note: r.note,
});

/** Tout, du plus récent au plus ancien. */
export function datedEvents(db: Db): DatedEvent[] {
  return db.all<Row>(`${SQL} ORDER BY date DESC, code ASC`).map(toEvent);
}

/** Les événements d'un mois donné (`AAAA-MM`), du 1er au dernier. */
export function eventsInMonth(db: Db, month: string): DatedEvent[] {
  return db
    .all<Row>(`SELECT * FROM (${SQL}) WHERE date LIKE $like ORDER BY date ASC, code ASC`, {
      $like: `${month}-%`,
    })
    .map(toEvent);
}

/** Les années qui contiennent au moins un événement, de la plus récente. */
export function eventYears(db: Db): number[] {
  return db
    .all<{ y: string }>(`SELECT DISTINCT substr(date, 1, 4) AS y FROM (${SQL}) ORDER BY y DESC`)
    .map((r) => Number(r.y))
    .filter((y) => Number.isInteger(y) && y > 1900);
}
