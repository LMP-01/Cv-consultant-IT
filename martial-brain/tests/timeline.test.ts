/**
 * Timeline, calendrier et relances.
 *
 * Trois lectures dérivées : elles ne stockent rien, elles relisent. Ce qui se
 * teste ici, c'est justement qu'elles relisent la bonne chose — un objectif
 * apparaît à son échéance et pas à sa création, un sparring apparaît à sa
 * date, et une fiche sans date n'apparaît nulle part plutôt que d'atterrir
 * sur le 1er janvier 1970.
 */
import { describe, expect, it } from 'vitest';
import { alerts } from '../src/db/alerts';
import { createEntity } from '../src/db/queries';
import { datedEvents, eventsInMonth, eventYears } from '../src/db/timeline';
import { link } from '../src/domain/links';
import { freshDb } from './helpers';

describe('fiches datées', () => {
  it('rassemble sparrings, combats, hypothèses, décisions et échéances', async () => {
    const db = await freshDb();

    createEntity(db, 'sparring', { title: 'Séance A', data: { date: '2026-03-04' } });
    createEntity(db, 'fight', { title: 'Open', data: { date: '2026-05-20', resultat: 'Victoire' } });
    createEntity(db, 'hypothesis', { title: 'Test switch', data: { date: '2025-11-02' } });
    createEntity(db, 'decision', { title: 'Trois armes', data: { date: '2026-05-22' } });
    createEntity(db, 'objective', { title: 'Garde basse', data: { echeance: '2026-09-30' } });

    const events = datedEvents(db);
    expect(events.map((e) => e.date)).toEqual([
      '2026-09-30',
      '2026-05-22',
      '2026-05-20',
      '2026-03-04',
      '2025-11-02',
    ]);

    // L'échéance n'est pas un fait passé, et la vue doit pouvoir le dire.
    expect(events.find((e) => e.title === 'Garde basse')?.when).toBe('échéance');
    expect(events.find((e) => e.title === 'Open')?.when).toBe('passé');
    expect(events.find((e) => e.title === 'Open')?.note).toBe('Victoire');

    db.close();
  });

  it('ignore les fiches sans date plutôt que de leur en inventer une', async () => {
    const db = await freshDb();

    createEntity(db, 'sparring', { title: 'Sans date', data: {} });
    createEntity(db, 'sparring', { title: 'Date vide', data: { date: '' } });
    createEntity(db, 'technique', { title: 'Jab', data: {} });

    expect(datedEvents(db)).toHaveLength(0);
    expect(eventYears(db)).toEqual([]);

    db.close();
  });

  it('découpe par mois et par année', async () => {
    const db = await freshDb();

    createEntity(db, 'sparring', { title: 'Mars', data: { date: '2026-03-04' } });
    createEntity(db, 'sparring', { title: 'Avril', data: { date: '2026-04-01' } });
    createEntity(db, 'sparring', { title: 'Avril bis', data: { date: '2026-04-28' } });
    createEntity(db, 'sparring', { title: 'An dernier', data: { date: '2025-04-28' } });

    expect(eventYears(db)).toEqual([2026, 2025]);
    expect(eventsInMonth(db, '2026-04').map((e) => e.title)).toEqual(['Avril', 'Avril bis']);
    // « 2026-04 » ne doit pas attraper 2025-04 : le filtre porte sur le préfixe
    // complet, pas sur le mois seul.
    expect(eventsInMonth(db, '2026-04')).toHaveLength(2);

    db.close();
  });

  it('supprime une fiche la retire de la timeline', async () => {
    const db = await freshDb();
    const sparring = createEntity(db, 'sparring', { title: 'Séance', data: { date: '2026-03-04' } });
    expect(datedEvents(db)).toHaveLength(1);

    db.run(`UPDATE entities SET deleted = 1 WHERE id = $id`, { $id: sparring.id });
    expect(datedEvents(db)).toHaveLength(0);

    db.close();
  });
});

describe('relances', () => {
  it('signale les fiches isolées, et se tait quand tout est relié', async () => {
    const db = await freshDb();

    const jab = createEntity(db, 'technique', { title: 'Jab', data: {} });
    const combo = createEntity(db, 'combo', { title: 'Jab → low', data: {} });
    expect(alerts(db).find((a) => a.id === 'orphans')?.label).toContain('2 fiches');

    link(db, jab.id, combo.id);
    expect(alerts(db).find((a) => a.id === 'orphans')).toBeUndefined();

    db.close();
  });

  it('signale une échéance dépassée, mais pas un objectif atteint', async () => {
    const db = await freshDb();
    const today = new Date('2026-06-15');

    createEntity(db, 'objective', {
      title: 'En retard',
      data: { echeance: '2026-05-01', statut: 'En cours' },
    });
    createEntity(db, 'objective', {
      title: 'Fini à temps',
      data: { echeance: '2026-05-01', statut: 'Atteint' },
    });
    createEntity(db, 'objective', {
      title: 'À venir',
      data: { echeance: '2026-12-01', statut: 'En cours' },
    });

    const overdue = alerts(db, today).filter((a) => a.detail.startsWith('Échéance'));
    expect(overdue).toHaveLength(1);
    expect(overdue[0]?.label).toContain('En retard');

    db.close();
  });

  it('rappelle les décisions marquées à revoir', async () => {
    const db = await freshDb();

    createEntity(db, 'decision', { title: 'À rejuger', data: { statut: 'À revoir' } });
    createEntity(db, 'decision', { title: 'Tenue', data: { statut: 'Confirmée' } });

    const review = alerts(db).filter((a) => a.detail === 'Décision à revoir.');
    expect(review).toHaveLength(1);
    expect(review[0]?.label).toContain('À rejuger');

    db.close();
  });

  it('ne relance pas une hypothèse encore fraîche', async () => {
    const db = await freshDb();
    createEntity(db, 'hypothesis', { title: 'Toute neuve', data: { validation: 'Non testée' } });

    // `updated_at` est posé à maintenant par la création : rien à relancer.
    expect(alerts(db).some((a) => a.id.startsWith('hyp:'))).toBe(false);

    // Reculée de trois mois, elle devient une relance.
    db.run(`UPDATE entities SET updated_at = $t WHERE type = 'hypothesis'`, {
      $t: Date.now() - 90 * 86_400_000,
    });
    expect(alerts(db).some((a) => a.id.startsWith('hyp:'))).toBe(true);

    db.close();
  });
});
