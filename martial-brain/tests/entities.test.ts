import { describe, expect, it } from 'vitest';
import {
  createEntity,
  deleteEntity,
  distinctFieldValues,
  getEntityByCode,
  listEntities,
  searchEntities,
  toMatchExpression,
  updateEntity,
} from '../src/db/queries';
import { formatCode, nextCode, parseCode, reconcileDuplicateCodes } from '../src/domain/ids';
import { ENTITY_DEFS, prefixesOf } from '../src/domain/schema';
import { freshDb } from './helpers';

describe('code allocation (§2.2)', () => {
  it('numbers each prefix independently, starting at 001', async () => {
    const db = await freshDb();
    expect(createEntity(db, 'technique', { title: 'Jab' }).code).toBe('K001');
    expect(createEntity(db, 'technique', { title: 'Mae Geri' }).code).toBe('K002');
    expect(createEntity(db, 'principle', { title: 'La simplicité' }).code).toBe('PR001');
    expect(createEntity(db, 'combo', { title: 'Jab → Low kick' }).code).toBe('A001');
    db.close();
  });

  it('never reissues the code of a deleted fiche', async () => {
    const db = await freshDb();
    const first = createEntity(db, 'technique', { title: 'Jab' });
    createEntity(db, 'technique', { title: 'Cross' }); // K002
    deleteEntity(db, first.id);

    // K001 is gone from the live set but its number stays retired: old notes
    // and exports saying "K001" must not resolve to a different technique.
    expect(getEntityByCode(db, 'K001')).toBeUndefined();
    expect(createEntity(db, 'technique', { title: 'Hook' }).code).toBe('K003');
    db.close();
  });

  it('disambiguates overlapping prefixes (E vs ER, A vs AR, S vs ST, B vs BK)', () => {
    expect(parseCode('ER001')).toEqual({ prefix: 'ER', num: 1 });
    expect(parseCode('E001')).toEqual({ prefix: 'E', num: 1 });
    expect(parseCode('AR012')).toEqual({ prefix: 'AR', num: 12 });
    expect(parseCode('A012')).toEqual({ prefix: 'A', num: 12 });
    expect(parseCode('ST003')).toEqual({ prefix: 'ST', num: 3 });
    expect(parseCode('S003')).toEqual({ prefix: 'S', num: 3 });
    expect(parseCode('BK007')).toEqual({ prefix: 'BK', num: 7 });
    expect(parseCode('B007')).toEqual({ prefix: 'B', num: 7 });
    expect(parseCode('ZZ001')).toBeUndefined();
    expect(parseCode('K')).toBeUndefined();
  });

  it('grows past three digits without truncating', () => {
    expect(formatCode('K', 7)).toBe('K007');
    expect(formatCode('K', 999)).toBe('K999');
    expect(formatCode('K', 1042)).toBe('K1042');
  });

  it('counts codes per prefix even with overlapping siblings present', async () => {
    const db = await freshDb();
    createEntity(db, 'exercise', { title: 'Contre sur jab' }); // E001
    createEntity(db, 'error', { title: 'Armement lent' }); // ER001
    // "ER001" must not be read as an E-series number and bump E to 002.
    expect(nextCode(db, 'E')).toBe('E002');
    expect(nextCode(db, 'ER')).toBe('ER002');
    db.close();
  });
});

describe('library module (§4.12)', () => {
  it('derives its prefix from the resource kind', async () => {
    const db = await freshDb();
    expect(createEntity(db, 'resource', { title: 'Analyse MMA', data: { kind: 'Vidéo' } }).code)
      .toBe('V001');
    expect(createEntity(db, 'resource', { title: 'Kyokushin Way', data: { kind: 'Livre' } }).code)
      .toBe('BK001');
    expect(createEntity(db, 'resource', { title: 'Stage Kudo', data: { kind: 'Stage' } }).code)
      .toBe('ST001');
    db.close();
  });

  it('renumbers when the kind changes', async () => {
    const db = await freshDb();
    const r = createEntity(db, 'resource', { title: 'Entretien', data: { kind: 'Article' } });
    expect(r.code).toBe('AR001');
    expect(updateEntity(db, r.id, { data: { kind: 'Podcast' } }).code).toBe('PD001');
    db.close();
  });
});

describe('descriptors', () => {
  it('covers the 15 modules with unique keys and prefixes', () => {
    expect(ENTITY_DEFS).toHaveLength(15);
    expect(new Set(ENTITY_DEFS.map((d) => d.key)).size).toBe(15);

    const prefixes = ENTITY_DEFS.flatMap(prefixesOf);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });

  it('only declares relations to modules that exist', () => {
    const keys = new Set(ENTITY_DEFS.map((d) => d.key));
    for (const def of ENTITY_DEFS) {
      for (const target of def.relations) {
        expect(keys.has(target), `${def.key} → ${target}`).toBe(true);
      }
    }
  });
});

describe('search', () => {
  it('quotes user input so punctuation cannot break the query', () => {
    expect(toMatchExpression('mae geri')).toBe('"mae" AND "geri"*');
    expect(toMatchExpression('contre (droite)')).toBe('"contre" AND "droite"*');
    // Bare FTS5 operators would be a syntax error unquoted.
    expect(() => toMatchExpression('NOT OR AND *')).not.toThrow();
    expect(toMatchExpression('   ')).toBeUndefined();
  });

  it('matches a whole sentence with OR, dropping filler words', () => {
    // AND is right for the search box, but a natural-language question shares
    // no fiche's full wording — AND would return nothing at all.
    expect(toMatchExpression('les contres sur mae geri', 'or')).toBe(
      '"les" OR "contres" OR "sur" OR "mae" OR "geri"',
    );
    // Words under three characters would match half the base under OR. Longer
    // filler ("les", "sur") is harmless: no fiche contains it, so it adds no
    // results — bm25 still ranks the real matches first.
    expect(toMatchExpression('un à la de mae', 'or')).toBe('"mae"');
    expect(toMatchExpression('à la', 'or')).toBeUndefined();
  });

  it('finds fiches from a full question when matching with OR', async () => {
    const db = await freshDb();
    createEntity(db, 'technique', { title: 'Mae Geri', data: { discipline: 'Kyokushin' } });
    createEntity(db, 'technique', { title: 'Jab' });

    const question = 'quels sont les contres à longue distance sur un mae geri ?';
    expect(searchEntities(db, question), 'AND finds nothing, as expected').toHaveLength(0);
    expect(searchEntities(db, question, { match: 'or' }).map((r) => r.title)).toContain(
      'Mae Geri',
    );
    db.close();
  });

  it('finds fiches by descriptor fields, not just the title', async () => {
    const db = await freshDb();
    createEntity(db, 'technique', {
      title: 'Mae Geri',
      data: { discipline: 'Kyokushin', famille: 'Pied', description: 'coup de pied frontal' },
    });
    createEntity(db, 'technique', {
      title: 'Jab',
      data: { discipline: 'Boxe anglaise', famille: 'Poing', description: 'direct du bras avant' },
    });

    expect(searchEntities(db, 'frontal').map((r) => r.title)).toEqual(['Mae Geri']);
    expect(searchEntities(db, 'kyokushin').map((r) => r.title)).toEqual(['Mae Geri']);
    expect(searchEntities(db, 'poing').map((r) => r.title)).toEqual(['Jab']);
    db.close();
  });

  it('filters on descriptor fields and tags', async () => {
    const db = await freshDb();
    createEntity(db, 'technique', {
      title: 'Mae Geri',
      data: { discipline: 'Kyokushin', distance: 'Longue', tags: ['jambe', 'base'] },
    });
    createEntity(db, 'technique', {
      title: 'Jab',
      data: { discipline: 'Boxe anglaise', distance: 'Moyenne', tags: ['base'] },
    });

    expect(
      searchEntities(db, '', { fields: { distance: ['Longue'] } }).map((r) => r.title),
    ).toEqual(['Mae Geri']);
    expect(searchEntities(db, '', { tags: ['base'] })).toHaveLength(2);
    expect(searchEntities(db, '', { tags: ['jambe'] }).map((r) => r.title)).toEqual(['Mae Geri']);
    expect(searchEntities(db, '', { types: ['combo'] })).toHaveLength(0);
    db.close();
  });

  it('does not match on numeric fields excluded from the index', async () => {
    const db = await freshDb();
    createEntity(db, 'counter', {
      title: 'Check sur low kick',
      data: { reussite: 73, reponse: 'lever le tibia' },
    });
    // Searching "73" should not surface a fiche merely because a percentage
    // happens to equal it.
    expect(searchEntities(db, '73')).toHaveLength(0);
    expect(searchEntities(db, 'tibia')).toHaveLength(1);
    db.close();
  });

  it('lists distinct field values for filter chips', async () => {
    const db = await freshDb();
    createEntity(db, 'technique', { title: 'A', data: { discipline: 'Judo' } });
    createEntity(db, 'technique', { title: 'B', data: { discipline: 'Judo' } });
    createEntity(db, 'technique', { title: 'C', data: { discipline: 'MMA' } });
    expect(distinctFieldValues(db, 'technique', 'discipline')).toEqual(['Judo', 'MMA']);
    db.close();
  });
});

describe('deletion', () => {
  it('hides the fiche but keeps a tombstone for other devices', async () => {
    const db = await freshDb();
    const t = createEntity(db, 'technique', { title: 'Jab' });
    deleteEntity(db, t.id);

    expect(listEntities(db, 'technique')).toHaveLength(0);
    expect(searchEntities(db, 'jab')).toHaveLength(0);
    expect(
      db.one<{ deleted: number; dirty: number }>(
        `SELECT deleted, dirty FROM entities WHERE id = $id`,
        { $id: t.id },
      ),
    ).toEqual({ deleted: 1, dirty: 1 });
    db.close();
  });
});

describe('duplicate codes after an offline merge', () => {
  it('keeps the oldest fiche on the code and renumbers the rest', async () => {
    const db = await freshDb();
    // Simulate two devices having independently minted K001.
    db.run(
      `INSERT INTO entities (id, type, code, title, data, search_text, created_at, updated_at)
       VALUES ('older','technique','K001','Jab','{}','',100,100),
              ('newer','technique','K001','Cross','{}','',200,200)`,
    );

    const renamed = reconcileDuplicateCodes(db);

    expect(renamed).toEqual(['newer']);
    expect(
      db.one<{ code: string }>(`SELECT code FROM entities WHERE id = 'older'`)?.code,
    ).toBe('K001');
    expect(
      db.one<{ code: string }>(`SELECT code FROM entities WHERE id = 'newer'`)?.code,
    ).toBe('K002');
    // Renumbering is a local edit and must be pushed.
    expect(
      db.one<{ dirty: number }>(`SELECT dirty FROM entities WHERE id = 'newer'`)?.dirty,
    ).toBe(1);
    db.close();
  });

  it('is deterministic across devices when timestamps tie', async () => {
    const db = await freshDb();
    db.run(
      `INSERT INTO entities (id, type, code, title, data, search_text, created_at, updated_at)
       VALUES ('bbb','technique','K001','B','{}','',100,100),
              ('aaa','technique','K001','A','{}','',100,100)`,
    );
    reconcileDuplicateCodes(db);
    // uuid breaks the tie, so every device independently reaches this answer.
    expect(db.one<{ code: string }>(`SELECT code FROM entities WHERE id = 'aaa'`)?.code)
      .toBe('K001');
    expect(db.one<{ code: string }>(`SELECT code FROM entities WHERE id = 'bbb'`)?.code)
      .toBe('K002');
    db.close();
  });
});
