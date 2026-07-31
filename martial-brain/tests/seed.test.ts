import { describe, expect, it } from 'vitest';
import { createEntity, deleteEntity, getEntity, getEntityByCode, listEntities } from '../src/db/queries';
import { isSeeded, remainingSeedCount, removeSeed, seed } from '../src/db/seed';
import { allLinks, neighbourIds } from '../src/domain/links';
import { ENTITY_DEFS } from '../src/domain/schema';
import { freshDb } from './helpers';

describe('seed', () => {
  it('reproduces the codes the cahier des charges names', async () => {
    const db = await freshDb();
    seed(db);

    // §2.2's own examples, verbatim.
    expect(getEntityByCode(db, 'K001')?.title).toBe('Jab');
    expect(getEntityByCode(db, 'K003')?.title).toBe('Mae Geri');
    expect(getEntityByCode(db, 'K007')?.title).toBe('O Soto Gari');
    expect(getEntityByCode(db, 'A001')?.title).toBe('Jab → Low kick');
    expect(getEntityByCode(db, 'C001')?.title).toBe('Check → Mae Geri');
    expect(getEntityByCode(db, 'T001')?.title).toBe('Faire avancer');
    expect(getEntityByCode(db, 'T003')?.title).toBe('Créer une réaction');
    expect(getEntityByCode(db, 'S001')?.title).toBe('Adversaire très agressif');
    expect(getEntityByCode(db, 'S003')?.title).toBe('Très grande distance');
    expect(getEntityByCode(db, 'B001')?.title).toBe('Chaîne cinétique du direct');
    expect(getEntityByCode(db, 'PR001')?.title).toBe(
      'La simplicité résiste mieux à la fatigue',
    );
    expect(getEntityByCode(db, 'ER001')?.title).toBe('Armement trop lent du genou');
    expect(getEntityByCode(db, 'V001')?.title).toBe('Analyse vidéo MMA');
    db.close();
  });

  it('populates every module, so no screen opens empty', async () => {
    const db = await freshDb();
    seed(db);
    for (const def of ENTITY_DEFS) {
      expect(listEntities(db, def.key).length, `${def.key} (${def.spec})`).toBeGreaterThan(0);
    }
    db.close();
  });

  it('wires a connected graph rather than 15 isolated lists', async () => {
    const db = await freshDb();
    seed(db);

    expect(allLinks(db).length).toBeGreaterThan(30);

    // No orphans: every seeded fiche is reachable from something.
    for (const def of ENTITY_DEFS) {
      for (const record of listEntities(db, def.key)) {
        expect(neighbourIds(db, record.id).length, `${record.code} ${record.title}`)
          .toBeGreaterThan(0);
      }
    }
    db.close();
  });

  it('reports whether the database has been seeded', async () => {
    const db = await freshDb();
    expect(isSeeded(db)).toBe(false);
    seed(db);
    expect(isSeeded(db)).toBe(true);
    db.close();
  });

  it('can be removed without touching real work', async () => {
    const db = await freshDb();
    seed(db);
    const before = remainingSeedCount(db);
    expect(before).toBeGreaterThan(20);

    // A fiche the user wrote, and an edit to one of the examples.
    const mine = createEntity(db, 'technique', { title: 'Ushiro Geri' });
    const jab = getEntityByCode(db, 'K001');
    expect(jab).toBeDefined();

    const removed = removeSeed(db);
    expect(removed).toBe(before);
    expect(remainingSeedCount(db)).toBe(0);

    // The example fiches are gone…
    expect(getEntityByCode(db, 'K001')).toBeUndefined();
    // …and what the user wrote is untouched.
    expect(getEntity(db, mine.id)?.title).toBe('Ushiro Geri');
    db.close();
  });

  it('does not resurrect examples the user already deleted', async () => {
    const db = await freshDb();
    seed(db);
    const jab = getEntityByCode(db, 'K001');
    deleteEntity(db, jab!.id);

    const before = remainingSeedCount(db);
    expect(removeSeed(db)).toBe(before);
    expect(remainingSeedCount(db)).toBe(0);
    db.close();
  });
});
