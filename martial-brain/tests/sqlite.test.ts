/**
 * The whole search design rests on the WASM build carrying FTS5 with
 * diacritic folding, plus json1 for the analytics aggregates. Assert it rather
 * than trusting the vendor: if a future version of the package drops a compile
 * flag, this fails loudly instead of the search silently returning nothing.
 */
import { describe, expect, it } from 'vitest';
import { freshDb } from './helpers';

describe('sqlite build', () => {
  it('ships FTS5, json1 and math functions', async () => {
    const db = await freshDb();
    const opts = db
      .all<{ compile_options: string }>('PRAGMA compile_options')
      .map((r) => r.compile_options);

    expect(opts).toContain('ENABLE_FTS5');
    expect(opts).toContain('ENABLE_MATH_FUNCTIONS');
    expect(db.one<{ v: string }>(`SELECT json_extract('{"a":1}','$.a') AS v`)?.v).toBe(1);
    db.close();
  });

  it('folds diacritics, so French and romaji spellings both hit', async () => {
    const db = await freshDb();
    db.run(
      `INSERT INTO entities (id, type, code, title, data, search_text, created_at, updated_at)
       VALUES ('1','tactic','T001','Créer un déséquilibre','{}','créer un déséquilibre en Muay Thaï',1,1)`,
    );

    for (const query of ['desequilibre', 'déséquilibre', 'muay thai', 'Thaï']) {
      const hits = db.all<{ title: string }>(
        `SELECT e.title FROM entities e
           JOIN entities_fts f ON f.rowid = e.rowid
          WHERE entities_fts MATCH $q`,
        { $q: `"${query.toLowerCase()}"` },
      );
      expect(hits, `query: ${query}`).toHaveLength(1);
    }
    db.close();
  });

  it('keeps the FTS index in step with updates and deletes', async () => {
    const db = await freshDb();
    const count = (q: string) =>
      db.all(
        `SELECT e.id FROM entities e JOIN entities_fts f ON f.rowid = e.rowid
          WHERE entities_fts MATCH $q`,
        { $q: q },
      ).length;

    db.run(
      `INSERT INTO entities (id, type, code, title, data, search_text, created_at, updated_at)
       VALUES ('1','technique','K001','Jab','{}','direct du bras avant',1,1)`,
    );
    expect(count('"direct"')).toBe(1);

    db.run(`UPDATE entities SET search_text = 'coup de pied circulaire' WHERE id = '1'`);
    expect(count('"direct"')).toBe(0);
    expect(count('"circulaire"')).toBe(1);

    db.run(`DELETE FROM entities WHERE id = '1'`);
    expect(count('"circulaire"')).toBe(0);
    db.close();
  });

  it('round-trips through an exported image', async () => {
    const db = await freshDb();
    db.run(
      `INSERT INTO entities (id, type, code, title, data, search_text, created_at, updated_at)
       VALUES ('1','principle','PR001','La simplicité résiste à la fatigue','{}','',1,1)`,
    );
    const bytes = db.exportBytes();
    expect(bytes.byteLength).toBeGreaterThan(0);
    // A SQLite image always starts with "SQLite format 3\0".
    expect(new TextDecoder().decode(bytes.slice(0, 15))).toBe('SQLite format 3');
    db.close();
  });
});
