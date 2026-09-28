/**
 * The analytics numbers are the app's factual claims about your practice, so
 * they are checked against hand-countable fixtures rather than the seed —
 * a test that just asserts "some number came back" would not catch an off-by-one
 * in the join.
 */
import { describe, expect, it } from 'vitest';
import {
  errorFrequency,
  fightRecord,
  forgottenTechniques,
  graphHealth,
  mainWeapons,
  minutesByDiscipline,
  objectiveProgress,
  recentBouts,
  successRates,
  trainingTotals,
  usageRanking,
} from '../src/db/analytics';
import { createEntity } from '../src/db/queries';
import { link } from '../src/domain/links';
import { freshDb } from './helpers';
import type { Db } from '../src/db/sqlite';

/**
 * Fixture, countable by eye:
 *   jab    → used in spar1, spar2, fight1   (3 bouts)
 *   maeGeri→ used in fight1                  (1 bout)
 *   crochet→ never used                      (0 bouts, "forgotten")
 *   crochet is still linked to a principle, so a zero here means "no bout has
 *   referenced it", not "it has no links at all".
 */
async function fixture(): Promise<Db> {
  const db = await freshDb();

  const jab = createEntity(db, 'technique', { title: 'Jab' });
  const maeGeri = createEntity(db, 'technique', { title: 'Mae Geri' });
  const crochet = createEntity(db, 'technique', { title: 'Crochet' });
  const principle = createEntity(db, 'principle', { title: 'La simplicité' });

  const spar1 = createEntity(db, 'sparring', {
    title: 'Séance A',
    data: { date: '2026-01-10', discipline: 'Kyokushin', duree: 30 },
  });
  const spar2 = createEntity(db, 'sparring', {
    title: 'Séance B',
    data: { date: '2026-02-14', discipline: 'Kyokushin', duree: 45 },
  });
  const fight1 = createEntity(db, 'fight', {
    title: 'Open régional',
    data: { date: '2026-03-01', discipline: 'Kudo', duree: 9, resultat: 'Victoire' },
  });

  link(db, jab.id, spar1.id);
  link(db, jab.id, spar2.id);
  link(db, jab.id, fight1.id);
  link(db, maeGeri.id, fight1.id);
  link(db, crochet.id, principle.id); // linked, but never used in a bout

  return db;
}

describe('usage', () => {
  it('counts bout references, not links in general', async () => {
    const db = await fixture();
    const ranked = usageRanking(db, 'technique');

    expect(ranked.map((r) => [r.title, r.uses])).toEqual([
      ['Jab', 3],
      ['Mae Geri', 1],
      ['Crochet', 0],
    ]);
    db.close();
  });

  it('reports the most recent bout each technique appeared in', async () => {
    const db = await fixture();
    const jab = usageRanking(db, 'technique').find((r) => r.title === 'Jab');
    expect(jab?.lastUsed).toBe('2026-03-01');
    db.close();
  });

  it('names main weapons and forgotten techniques', async () => {
    const db = await fixture();
    expect(mainWeapons(db).map((r) => r.title)).toEqual(['Jab', 'Mae Geri']);
    // Crochet has a link — just never to a bout. That is what "forgotten" means.
    expect(forgottenTechniques(db).map((r) => r.title)).toEqual(['Crochet']);
    db.close();
  });
});

describe('training volume', () => {
  it('sums minutes per discipline', async () => {
    const db = await fixture();
    expect(minutesByDiscipline(db)).toEqual([
      { label: 'Kyokushin', minutes: 75 },
      { label: 'Kudo', minutes: 9 },
    ]);
    db.close();
  });

  it('totals minutes and bouts across everything', async () => {
    const db = await fixture();
    expect(trainingTotals(db)).toEqual({ minutes: 84, bouts: 3 });
    db.close();
  });

  it('counts official results only, ignoring sparrings', async () => {
    const db = await fixture();
    expect(fightRecord(db)).toEqual([{ label: 'Victoire', count: 1 }]);
    db.close();
  });

  it('lists bouts newest first', async () => {
    const db = await fixture();
    expect(recentBouts(db).map((b) => b.date)).toEqual([
      '2026-03-01',
      '2026-02-14',
      '2026-01-10',
    ]);
    db.close();
  });
});

describe('graph health', () => {
  it('counts orphans — fiches that are notes rather than nodes', async () => {
    const db = await fixture();
    const before = graphHealth(db);
    expect(before.orphans).toBe(0);

    createEntity(db, 'tactic', { title: 'Tactique isolée' });
    const after = graphHealth(db);
    expect(after.orphans).toBe(1);
    expect(after.entities).toBe(before.entities + 1);
    db.close();
  });

  it('counts hypotheses still awaiting a verdict', async () => {
    const db = await freshDb();
    createEntity(db, 'hypothesis', { title: 'A', data: { validation: 'En cours de test' } });
    createEntity(db, 'hypothesis', { title: 'B', data: { validation: 'Validée' } });
    createEntity(db, 'hypothesis', { title: 'C' }); // no verdict recorded yet
    expect(graphHealth(db).hypothesesOpen).toBe(2);
    db.close();
  });
});

describe('self-reported rates', () => {
  it('ranks combos by success rate and skips the unrated', async () => {
    const db = await freshDb();
    createEntity(db, 'combo', { title: 'A', data: { reussite: 65 } });
    createEntity(db, 'combo', { title: 'B', data: { reussite: 80 } });
    createEntity(db, 'combo', { title: 'C' });

    expect(successRates(db, 'combo').map((r) => [r.title, r.rate])).toEqual([
      ['B', 80],
      ['A', 65],
    ]);
    db.close();
  });
});

describe('objectives and errors', () => {
  it('puts live objectives before finished ones', async () => {
    const db = await freshDb();
    createEntity(db, 'objective', { title: 'Fini', data: { statut: 'Atteint', progression: 100 } });
    createEntity(db, 'objective', { title: 'En cours', data: { statut: 'En cours', progression: 30 } });
    createEntity(db, 'objective', { title: 'À faire', data: { statut: 'À faire' } });

    expect(objectiveProgress(db).map((o) => o.title)).toEqual(['En cours', 'À faire', 'Fini']);
    db.close();
  });

  it('ranks errors by how many bouts mention them', async () => {
    const db = await freshDb();
    const e1 = createEntity(db, 'error', { title: 'Armement lent' });
    const e2 = createEntity(db, 'error', { title: 'Garde qui tombe' });
    createEntity(db, 'error', { title: 'Jamais constatée' });
    const s1 = createEntity(db, 'sparring', { title: 'S1', data: { date: '2026-01-01' } });
    const s2 = createEntity(db, 'sparring', { title: 'S2', data: { date: '2026-01-02' } });

    link(db, e1.id, s1.id);
    link(db, e1.id, s2.id);
    link(db, e2.id, s1.id);

    expect(errorFrequency(db).map((r) => [r.title, r.uses])).toEqual([
      ['Armement lent', 2],
      ['Garde qui tombe', 1],
    ]);
    db.close();
  });
});
