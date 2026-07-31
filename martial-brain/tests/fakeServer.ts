/**
 * An in-memory stand-in for the Worker, implementing the same merge semantics.
 *
 * It exists so the sync engine can be tested against real convergence
 * scenarios — two devices, offline edits, deletes racing edits — without HTTP,
 * D1 or wrangler in the loop. worker/index.ts implements the identical rules
 * against D1; tests/worker.test.ts checks the two agree.
 */
import type {
  Changeset,
  EntityRow,
  LinkRow,
  PullResponse,
  PushResponse,
} from '../src/sync/protocol';
import type { SyncTransport } from '../src/sync/engine';

interface Stored<T> {
  row: T;
  seq: number;
}

export class FakeServer {
  entities = new Map<string, Stored<EntityRow>>();
  links = new Map<string, Stored<LinkRow>>();
  #seq = 0;
  /** Rows per pull page; small values exercise the paging loop. */
  pageSize: number;

  constructor(pageSize = 500) {
    this.pageSize = pageSize;
  }

  push(body: Changeset): PushResponse {
    const applied: Record<string, number> = {};
    const rejected: string[] = [];

    const take = <T extends { id: string; updated_at: number }>(
      store: Map<string, Stored<T>>,
      row: T,
    ): void => {
      const held = store.get(row.id);
      // Same policy as the client: newer wins, ties break on id.
      const wins =
        !held ||
        row.updated_at > held.row.updated_at ||
        (row.updated_at === held.row.updated_at && row.id > held.row.id);

      if (!wins) {
        rejected.push(row.id);
        return;
      }
      this.#seq += 1;
      store.set(row.id, { row, seq: this.#seq });
      applied[row.id] = this.#seq;
    };

    for (const row of body.entities) take(this.entities, row);
    for (const row of body.links) take(this.links, row);

    return { applied, rejected, cursor: this.#seq };
  }

  pull(since: number): PullResponse {
    const entities: EntityRow[] = [];
    const links: LinkRow[] = [];
    const seq: Record<string, number> = {};

    const fresh = [
      ...[...this.entities.values()].map((s) => ({ ...s, kind: 'entity' as const })),
      ...[...this.links.values()].map((s) => ({ ...s, kind: 'link' as const })),
    ]
      .filter((s) => s.seq > since)
      .sort((a, b) => a.seq - b.seq);

    const page = fresh.slice(0, this.pageSize);
    for (const item of page) {
      seq[item.row.id] = item.seq;
      if (item.kind === 'entity') entities.push(item.row as EntityRow);
      else links.push(item.row as LinkRow);
    }

    const cursor = page.length > 0 ? (page[page.length - 1]?.seq ?? since) : this.#seq;
    return { entities, links, seq, cursor, more: fresh.length > page.length };
  }

  /** A transport bound to this server, optionally able to simulate outages. */
  transport(): SyncTransport & { offline: boolean } {
    const server = this;
    return {
      offline: false,
      async pull(since: number) {
        if (this.offline) throw new Error('réseau indisponible');
        return server.pull(since);
      },
      async push(body: Changeset) {
        if (this.offline) throw new Error('réseau indisponible');
        return server.push(body);
      },
    };
  }
}
