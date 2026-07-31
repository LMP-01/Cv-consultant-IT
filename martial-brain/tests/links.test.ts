/**
 * §2.3 — "Toutes les entités sont liées entre elles de manière bidirectionnelle."
 *
 * The point of these tests is that bidirectionality is not something the code
 * remembers to do: it falls out of storing one canonically-ordered row. So they
 * assert it from both ends, and in both insertion orders.
 */
import { describe, expect, it } from 'vitest';
import { createEntity, deleteEntity, searchEntities } from '../src/db/queries';
import {
  allLinks,
  areLinked,
  canonical,
  degreeMap,
  egoNetwork,
  link,
  neighbourIds,
  neighboursByType,
  setLinksOfType,
  unlink,
} from '../src/domain/links';
import { freshDb } from './helpers';

describe('canonical ordering', () => {
  it('maps a pair to the same row whichever way round it is given', () => {
    expect(canonical('b', 'a')).toEqual(['a', 'b']);
    expect(canonical('a', 'b')).toEqual(['a', 'b']);
  });
});

describe('bidirectionality', () => {
  it('is visible from both ends, whichever direction created it', async () => {
    const db = await freshDb();
    const jab = createEntity(db, 'technique', { title: 'Jab' });
    const combo = createEntity(db, 'combo', { title: 'Jab → Low kick' });

    link(db, combo.id, jab.id); // linked from the combo's side

    expect(neighbourIds(db, jab.id)).toEqual([combo.id]);
    expect(neighbourIds(db, combo.id)).toEqual([jab.id]);
    expect(areLinked(db, jab.id, combo.id)).toBe(true);
    expect(areLinked(db, combo.id, jab.id)).toBe(true);
    db.close();
  });

  it('stores exactly one row per pair, in either insertion order', async () => {
    const db = await freshDb();
    const a = createEntity(db, 'technique', { title: 'Jab' });
    const b = createEntity(db, 'principle', { title: 'La simplicité' });

    link(db, a.id, b.id);
    link(db, b.id, a.id); // same relation, stated the other way round
    link(db, a.id, b.id); // and again

    expect(allLinks(db)).toHaveLength(1);
    db.close();
  });

  it('revives a tombstoned edge instead of duplicating it', async () => {
    const db = await freshDb();
    const a = createEntity(db, 'technique', { title: 'Jab' });
    const b = createEntity(db, 'situation', { title: 'Adversaire agressif' });

    link(db, a.id, b.id);
    unlink(db, a.id, b.id);
    expect(areLinked(db, a.id, b.id)).toBe(false);

    link(db, b.id, a.id);
    expect(areLinked(db, a.id, b.id)).toBe(true);
    expect(
      db.one<{ n: number }>(`SELECT count(*) AS n FROM links`)?.n,
      'the revived edge reuses its row',
    ).toBe(1);
    db.close();
  });

  it('refuses to link a fiche to itself', async () => {
    const db = await freshDb();
    const a = createEntity(db, 'technique', { title: 'Jab' });
    link(db, a.id, a.id);
    expect(allLinks(db)).toHaveLength(0);
    db.close();
  });

  it('drops the edges of a deleted fiche from both sides', async () => {
    const db = await freshDb();
    const a = createEntity(db, 'technique', { title: 'Jab' });
    const b = createEntity(db, 'combo', { title: 'Jab → Low kick' });
    link(db, a.id, b.id);

    deleteEntity(db, a.id);

    expect(neighbourIds(db, b.id)).toEqual([]);
    expect(allLinks(db)).toHaveLength(0);
    db.close();
  });
});

describe('neighbourhood (what a fiche shows)', () => {
  it('groups everything touching a fiche by module', async () => {
    const db = await freshDb();
    const jab = createEntity(db, 'technique', { title: 'Jab' });
    const combo = createEntity(db, 'combo', { title: 'Jab → Low kick' });
    const principle = createEntity(db, 'principle', { title: 'La simplicité' });
    const spar = createEntity(db, 'sparring', { title: 'Séance du 15/10' });

    link(db, jab.id, combo.id);
    link(db, principle.id, jab.id);
    link(db, spar.id, jab.id);

    const grouped = neighboursByType(db, jab.id);
    expect([...grouped.keys()].sort()).toEqual(['combo', 'principle', 'sparring']);
    expect(grouped.get('combo')?.[0]?.title).toBe('Jab → Low kick');
    db.close();
  });

  it('reconciles a whole relation group in one edit', async () => {
    const db = await freshDb();
    const t = createEntity(db, 'technique', { title: 'Jab' });
    const s1 = createEntity(db, 'situation', { title: 'Coin du tatami' });
    const s2 = createEntity(db, 'situation', { title: 'Clinch' });
    const s3 = createEntity(db, 'situation', { title: 'Distance longue' });

    setLinksOfType(db, t.id, [s1.id, s2.id], []);
    expect(neighbourIds(db, t.id).sort()).toEqual([s1.id, s2.id].sort());

    // Swap s1 out for s3 in a single call.
    setLinksOfType(db, t.id, [s2.id, s3.id], [s1.id, s2.id]);
    expect(neighbourIds(db, t.id).sort()).toEqual([s2.id, s3.id].sort());
    db.close();
  });
});

describe('graph helpers', () => {
  it('walks the ego network to a given depth', async () => {
    const db = await freshDb();
    const a = createEntity(db, 'technique', { title: 'A' });
    const b = createEntity(db, 'combo', { title: 'B' });
    const c = createEntity(db, 'situation', { title: 'C' });
    const d = createEntity(db, 'tactic', { title: 'D' });
    link(db, a.id, b.id);
    link(db, b.id, c.id);
    link(db, c.id, d.id);

    expect(egoNetwork(db, a.id, 1).size).toBe(2); // a, b
    expect(egoNetwork(db, a.id, 2).size).toBe(3); // a, b, c
    expect(egoNetwork(db, a.id, 9).size).toBe(4); // whole chain, terminates
    db.close();
  });

  it('counts degrees for node sizing', async () => {
    const db = await freshDb();
    const hub = createEntity(db, 'technique', { title: 'Jab' });
    const x = createEntity(db, 'combo', { title: 'X' });
    const y = createEntity(db, 'combo', { title: 'Y' });
    link(db, hub.id, x.id);
    link(db, hub.id, y.id);

    const degrees = degreeMap(db);
    expect(degrees.get(hub.id)).toBe(2);
    expect(degrees.get(x.id)).toBe(1);
    db.close();
  });

  it('supports "linked to" as a search filter', async () => {
    const db = await freshDb();
    const situation = createEntity(db, 'situation', { title: 'Adversaire qui avance' });
    const c1 = createEntity(db, 'counter', { title: 'Contre sur avancée', data: {} });
    createEntity(db, 'counter', { title: 'Contre non lié' });
    link(db, situation.id, c1.id);

    const hits = searchEntities(db, '', { types: ['counter'], linkedTo: situation.id });
    expect(hits.map((r) => r.title)).toEqual(['Contre sur avancée']);
    db.close();
  });
});
