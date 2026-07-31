/**
 * Identity: uuids for the machine, prefixed codes for the human (§2.2).
 *
 * The uuid is what everything references — links, sync, media. The code (K001,
 * PR003, ER012) exists only so a person can say "check K001" out loud. Codes
 * are therefore allowed to collide temporarily across offline devices and get
 * renumbered on merge; uuids never collide and never change.
 */
import type { Db } from '../db/sqlite';
import { ENTITY_DEFS, prefixesOf } from './schema';

export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // Node <19 / insecure contexts.
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = ((b[6] as number) & 0x0f) | 0x40;
  b[8] = ((b[8] as number) & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Every prefix in use, longest first so "ER" wins over "E". */
export const ALL_PREFIXES: readonly string[] = [
  ...new Set(ENTITY_DEFS.flatMap(prefixesOf)),
].sort((a, b) => b.length - a.length);

export interface ParsedCode {
  prefix: string;
  num: number;
}

/**
 * Split "PR012" into { prefix: 'PR', num: 12 }.
 *
 * Prefixes overlap (E/ER, A/AR, S/ST, B/BK), so a match only counts when the
 * remainder is all digits: "ER001" cannot be read as E + "R001".
 */
export function parseCode(code: string): ParsedCode | undefined {
  const trimmed = code.trim().toUpperCase();
  for (const prefix of ALL_PREFIXES) {
    if (!trimmed.startsWith(prefix)) continue;
    const rest = trimmed.slice(prefix.length);
    if (rest.length > 0 && /^\d+$/.test(rest)) return { prefix, num: Number(rest) };
  }
  return undefined;
}

/** 1 → "K001"; numbers past 999 simply grow ("K1042"). */
export function formatCode(prefix: string, num: number): string {
  return `${prefix}${String(num).padStart(3, '0')}`;
}

/**
 * Next free code for a prefix.
 *
 * Counts tombstones too: a deleted K007 must not have its code handed to a new
 * technique, or old notes and exports would silently point at the wrong thing.
 */
export function nextCode(db: Db, prefix: string): string {
  const row = db.one<{ max: number | null }>(
    `SELECT MAX(CAST(substr(code, $len) AS INTEGER)) AS max
       FROM entities
      WHERE code GLOB $pattern`,
    { $len: prefix.length + 1, $pattern: `${prefix}[0-9]*` },
  );
  return formatCode(prefix, (row?.max ?? 0) + 1);
}

/**
 * Repair duplicate codes after a sync merge.
 *
 * Two devices editing offline can both mint K042. Identity is the uuid, so
 * nothing is broken — but two fiches labelled K042 are confusing. The older
 * record (by created_at, uuid as tiebreak so every device reaches the same
 * answer) keeps the code; the others move to the end of the range.
 *
 * Returns the renumbered ids so the caller can mark them dirty.
 */
export function reconcileDuplicateCodes(db: Db): string[] {
  const dupes = db.all<{ code: string }>(
    `SELECT code FROM entities GROUP BY code HAVING count(*) > 1`,
  );
  const renamed: string[] = [];

  for (const { code } of dupes) {
    const parsed = parseCode(code);
    if (!parsed) continue;

    const rows = db.all<{ id: string }>(
      `SELECT id FROM entities
        WHERE code = $code
        ORDER BY created_at ASC, id ASC`,
      { $code: code },
    );

    // rows[0] keeps the code; everyone after it is reassigned.
    for (const row of rows.slice(1)) {
      const fresh = nextCode(db, parsed.prefix);
      db.run(`UPDATE entities SET code = $code, dirty = 1 WHERE id = $id`, {
        $code: fresh,
        $id: row.id,
      });
      renamed.push(row.id);
    }
  }
  return renamed;
}
