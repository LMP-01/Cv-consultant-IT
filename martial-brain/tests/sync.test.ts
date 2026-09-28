/**
 * Sync is the one place in this app where a bug destroys work rather than
 * merely annoying someone. These tests drive two independent databases against
 * a server and assert convergence — including the awkward cases: a delete
 * racing an edit, two devices minting the same code offline, a pull that dies
 * halfway through.
 */
import { describe, expect, it } from 'vitest';
import { getEntity, listEntities, updateEntity, createEntity, deleteEntity } from '../src/db/queries';
import { areLinked, link, linkId, unlink } from '../src/domain/links';
import { collectDirty, countDirty, getCursor, sync } from '../src/sync/engine';
import { decide } from '../src/sync/merge';
import { FakeServer } from './fakeServer';
import { freshDb } from './helpers';
import type { Db } from '../src/db/sqlite';

/**
 * Edit a row at a controlled moment, so races are deterministic.
 *
 * `at` is an offset in ms from "later than everything created so far" — using
 * small absolute values like 1000 would place the edit in 1970, and the server
 * would rightly reject it as older than the record it already holds.
 */
const LATER = Date.now() + 60_000;

function touch(db: Db, id: string, at: number, patch: { title?: string }): void {
  if (patch.title !== undefined) {
    db.run(`UPDATE entities SET title = $t, updated_at = $ts, dirty = 1 WHERE id = $id`, {
      $t: patch.title,
      $ts: LATER + at,
      $id: id,
    });
  }
}

/** Tombstone a row at a controlled moment, same offset convention. */
function remove(db: Db, id: string, at: number): void {
  db.run(`UPDATE entities SET deleted = 1, dirty = 1, updated_at = $ts WHERE id = $id`, {
    $ts: LATER + at,
    $id: id,
  });
}

async function twoDevices(): Promise<{ a: Db; b: Db; server: FakeServer }> {
  return { a: await freshDb(), b: await freshDb(), server: new FakeServer() };
}

describe('conflict policy', () => {
  it('is a pure decision that never depends on arrival order', () => {
    expect(decide({ id: 'x', updated_at: 5 }, undefined)).toBe('insert');
    expect(decide({ id: 'x', updated_at: 9 }, { id: 'x', updated_at: 5 })).toBe('overwrite');
    expect(decide({ id: 'x', updated_at: 3 }, { id: 'x', updated_at: 5 })).toBe('keep-local');
    expect(decide({ id: 'x', updated_at: 5 }, { id: 'x', updated_at: 5 })).toBe('identical');
    // Different rows, same millisecond: id decides, and both sides agree.
    expect(decide({ id: 'b', updated_at: 5 }, { id: 'a', updated_at: 5 })).toBe('overwrite');
    expect(decide({ id: 'a', updated_at: 5 }, { id: 'b', updated_at: 5 })).toBe('keep-local');
  });
});

describe('round trip', () => {
  it('carries a fiche from one device to the other', async () => {
    const { a, b, server } = await twoDevices();
    const jab = createEntity(a, 'technique', { title: 'Jab', data: { discipline: 'Boxe anglaise' } });

    await sync(a, server.transport());
    await sync(b, server.transport());

    const arrived = getEntity(b, jab.id);
    expect(arrived?.title).toBe('Jab');
    expect(arrived?.code).toBe('K001');
    expect(arrived?.data.discipline).toBe('Boxe anglaise');
    a.close();
    b.close();
  });

  it('leaves nothing dirty once both devices are in step', async () => {
    const { a, b, server } = await twoDevices();
    createEntity(a, 'technique', { title: 'Jab' });
    createEntity(a, 'principle', { title: 'La simplicité' });

    await sync(a, server.transport());
    expect(countDirty(a)).toBe(0);

    await sync(b, server.transport());
    expect(countDirty(b)).toBe(0);
    expect(listEntities(b, 'technique')).toHaveLength(1);
    a.close();
    b.close();
  });

  it('makes the search index usable on the receiving device', async () => {
    const { a, b, server } = await twoDevices();
    createEntity(a, 'technique', {
      title: 'Mae Geri',
      data: { description: 'coup de pied frontal', discipline: 'Kyokushin' },
    });

    await sync(a, server.transport());
    await sync(b, server.transport());

    // The index is rebuilt on arrival, not shipped — so it matches this build.
    const hits = b.all<{ title: string }>(
      `SELECT e.title FROM entities e JOIN entities_fts f ON f.rowid = e.rowid
        WHERE entities_fts MATCH '"frontal"'`,
    );
    expect(hits.map((h) => h.title)).toEqual(['Mae Geri']);
    a.close();
    b.close();
  });
});

describe('concurrent edits', () => {
  it('keeps the newer edit and converges on both devices', async () => {
    const { a, b, server } = await twoDevices();
    const jab = createEntity(a, 'technique', { title: 'Jab' });
    await sync(a, server.transport());
    await sync(b, server.transport());

    touch(a, jab.id, 1000, { title: 'Jab (version téléphone)' });
    touch(b, jab.id, 2000, { title: 'Jab (version portable)' });

    await sync(a, server.transport());
    await sync(b, server.transport());
    await sync(a, server.transport());

    expect(getEntity(a, jab.id)?.title).toBe('Jab (version portable)');
    expect(getEntity(b, jab.id)?.title).toBe('Jab (version portable)');
    a.close();
    b.close();
  });

  it('never drops the newer edit just because it synced second', async () => {
    const { a, b, server } = await twoDevices();
    const jab = createEntity(a, 'technique', { title: 'Jab' });
    await sync(a, server.transport());
    await sync(b, server.transport());

    // B holds the newer edit but syncs FIRST; A's stale copy must not win.
    touch(b, jab.id, 5000, { title: 'récent' });
    touch(a, jab.id, 1000, { title: 'ancien' });

    await sync(b, server.transport());
    await sync(a, server.transport());
    await sync(b, server.transport());

    expect(getEntity(a, jab.id)?.title).toBe('récent');
    expect(getEntity(b, jab.id)?.title).toBe('récent');
    a.close();
    b.close();
  });
});

describe('stale writes', () => {
  it('discards a stale local edit during the pull, without spending a push', async () => {
    const { a, b, server } = await twoDevices();
    const jab = createEntity(a, 'technique', { title: 'Jab' });
    await sync(a, server.transport());
    await sync(b, server.transport());

    touch(b, jab.id, 5000, { title: 'à jour' });
    await sync(b, server.transport());

    // A device with a badly-behind clock, or replaying an old queue.
    a.run(`UPDATE entities SET title = 'périmé', updated_at = 1000, dirty = 1 WHERE id = $id`, {
      $id: jab.id,
    });
    const report = await sync(a, server.transport());

    // Pulling before pushing means the loser is settled locally: the stale row
    // is overwritten and never travels. Nothing to push, nothing to reject.
    expect(report.pulled.overwritten).toBe(1);
    expect(report.pushed).toBe(0);
    expect(report.rejected).toBe(0);
    expect(getEntity(a, jab.id)?.title).toBe('à jour');
    expect(getEntity(b, jab.id)?.title).toBe('à jour');
    a.close();
    b.close();
  });

  it('is refused by the server too, if one ever reaches it', async () => {
    // Belt and braces: the client resolves stale writes before pushing, but the
    // server must not depend on well-behaved clients.
    const server = new FakeServer();
    const base = {
      type: 'technique',
      code: 'K001',
      title: 'à jour',
      data: '{}',
      created_at: 1,
      deleted: 0,
    };
    server.push({ entities: [{ ...base, id: 'x', updated_at: 9000 }], links: [] });

    const res = server.push({
      entities: [{ ...base, id: 'x', title: 'périmé', updated_at: 1000 }],
      links: [],
    });

    expect(res.rejected).toEqual(['x']);
    expect(server.entities.get('x')?.row.title).toBe('à jour');
  });
});

describe('deletes racing edits', () => {
  it('resurrects a fiche edited after it was deleted elsewhere', async () => {
    const { a, b, server } = await twoDevices();
    const jab = createEntity(a, 'technique', { title: 'Jab' });
    await sync(a, server.transport());
    await sync(b, server.transport());

    // A deletes first; B edits afterwards, unaware. The later edit wins:
    // silently discarding the newer work would be the worst outcome here.
    remove(a, jab.id, 1000);
    touch(b, jab.id, 2000, { title: 'Jab retravaillé' });

    await sync(a, server.transport());
    await sync(b, server.transport());
    await sync(a, server.transport());

    expect(getEntity(a, jab.id)?.title).toBe('Jab retravaillé');
    expect(getEntity(b, jab.id)?.title).toBe('Jab retravaillé');
    a.close();
    b.close();
  });

  it('keeps a fiche deleted when the delete is the later action', async () => {
    const { a, b, server } = await twoDevices();
    const jab = createEntity(a, 'technique', { title: 'Jab' });
    await sync(a, server.transport());
    await sync(b, server.transport());

    touch(b, jab.id, 1000, { title: 'petite retouche' });
    remove(a, jab.id, 3000);

    await sync(b, server.transport());
    await sync(a, server.transport());
    await sync(b, server.transport());

    expect(getEntity(a, jab.id)).toBeUndefined();
    expect(getEntity(b, jab.id)).toBeUndefined();
    a.close();
    b.close();
  });

  it('propagates a deletion to the other device', async () => {
    const { a, b, server } = await twoDevices();
    const jab = createEntity(a, 'technique', { title: 'Jab' });
    await sync(a, server.transport());
    await sync(b, server.transport());
    expect(listEntities(b, 'technique')).toHaveLength(1);

    deleteEntity(a, jab.id);
    await sync(a, server.transport());
    await sync(b, server.transport());

    expect(listEntities(b, 'technique')).toHaveLength(0);
    a.close();
    b.close();
  });
});

describe('links', () => {
  it('converges when both devices create the same relation offline', async () => {
    const { a, b, server } = await twoDevices();
    const jab = createEntity(a, 'technique', { title: 'Jab' });
    const combo = createEntity(a, 'combo', { title: 'Jab → Low kick' });
    await sync(a, server.transport());
    await sync(b, server.transport());

    // Same relation, stated independently — and from opposite directions.
    link(a, jab.id, combo.id);
    link(b, combo.id, jab.id);

    await sync(a, server.transport());
    await sync(b, server.transport());
    await sync(a, server.transport());

    // Derived ids mean this was never two rows to reconcile.
    expect(a.all(`SELECT id FROM links`)).toHaveLength(1);
    expect(b.all(`SELECT id FROM links`)).toHaveLength(1);
    expect(areLinked(a, jab.id, combo.id)).toBe(true);
    expect(areLinked(b, jab.id, combo.id)).toBe(true);
    a.close();
    b.close();
  });

  it('derives the same id from either direction', () => {
    expect(linkId('b', 'a')).toBe(linkId('a', 'b'));
    expect(linkId('a', 'b', 'rel')).not.toBe(linkId('a', 'b', 'autre'));
  });

  it('propagates an unlink', async () => {
    const { a, b, server } = await twoDevices();
    const x = createEntity(a, 'technique', { title: 'Jab' });
    const y = createEntity(a, 'situation', { title: 'Clinch' });
    link(a, x.id, y.id);
    await sync(a, server.transport());
    await sync(b, server.transport());
    expect(areLinked(b, x.id, y.id)).toBe(true);

    unlink(a, x.id, y.id);
    await sync(a, server.transport());
    await sync(b, server.transport());

    expect(areLinked(b, x.id, y.id)).toBe(false);
    a.close();
    b.close();
  });
});

describe('offline behaviour', () => {
  it('queues edits while offline and delivers them on reconnect', async () => {
    const { a, b, server } = await twoDevices();
    const transport = server.transport();

    transport.offline = true;
    createEntity(a, 'technique', { title: 'Jab' });
    createEntity(a, 'technique', { title: 'Mae Geri' });
    await expect(sync(a, transport)).rejects.toThrow('réseau');
    expect(countDirty(a)).toBe(2);

    transport.offline = false;
    await sync(a, transport);
    expect(countDirty(a)).toBe(0);

    await sync(b, server.transport());
    expect(listEntities(b, 'technique')).toHaveLength(2);
    a.close();
    b.close();
  });

  it('resumes from its cursor after an interrupted pull', async () => {
    const { a, b, server } = await twoDevices();
    for (let i = 0; i < 12; i += 1) {
      createEntity(a, 'technique', { title: `Technique ${i}` });
    }
    await sync(a, server.transport());

    // Force paging, then cut the connection mid-way through B's first sync.
    server.pageSize = 5;
    const transport = server.transport();
    const realPull = transport.pull.bind(transport);
    let calls = 0;
    transport.pull = async (since: number) => {
      calls += 1;
      if (calls === 2) throw new Error('réseau indisponible');
      return realPull(since);
    };

    await expect(sync(b, transport)).rejects.toThrow('réseau');
    const partial = listEntities(b, 'technique').length;
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThan(12);
    expect(getCursor(b)).toBeGreaterThan(0);

    // Reconnect: it picks up where it stopped rather than starting over.
    await sync(b, server.transport());
    expect(listEntities(b, 'technique')).toHaveLength(12);
    a.close();
    b.close();
  });

  it('is idempotent — syncing twice changes nothing', async () => {
    const { a, b, server } = await twoDevices();
    createEntity(a, 'technique', { title: 'Jab' });
    await sync(a, server.transport());
    await sync(b, server.transport());

    const second = await sync(b, server.transport());
    expect(second.pulled.inserted).toBe(0);
    expect(second.pulled.overwritten).toBe(0);
    expect(second.pushed).toBe(0);
    expect(listEntities(b, 'technique')).toHaveLength(1);
    a.close();
    b.close();
  });
});

describe('duplicate codes from offline work', () => {
  it('renumbers so two fiches never share a handle after merging', async () => {
    const { a, b, server } = await twoDevices();

    // Both devices are offline and both mint K001 for different techniques.
    const onA = createEntity(a, 'technique', { title: 'Jab' });
    const onB = createEntity(b, 'technique', { title: 'Mae Geri' });
    expect(onA.code).toBe('K001');
    expect(onB.code).toBe('K001');

    await sync(a, server.transport());
    await sync(b, server.transport());
    await sync(a, server.transport());
    await sync(b, server.transport());

    const codesOnA = listEntities(a, 'technique').map((r) => r.code).sort();
    const codesOnB = listEntities(b, 'technique').map((r) => r.code).sort();

    expect(codesOnA).toEqual(['K001', 'K002']);
    expect(codesOnA).toEqual(codesOnB);
    // Both fiches survive — renumbering is cosmetic, identity is the uuid.
    expect(getEntity(a, onA.id)?.title).toBe('Jab');
    expect(getEntity(a, onB.id)?.title).toBe('Mae Geri');
    a.close();
    b.close();
  });
});

describe('dirty tracking', () => {
  it('only collects rows that actually changed', async () => {
    const db = await freshDb();
    const t = createEntity(db, 'technique', { title: 'Jab' });
    expect(collectDirty(db).entities).toHaveLength(1);

    db.run(`UPDATE entities SET dirty = 0`);
    expect(collectDirty(db).entities).toHaveLength(0);

    updateEntity(db, t.id, { title: 'Jab modifié' });
    expect(collectDirty(db).entities).toHaveLength(1);
    db.close();
  });
});
