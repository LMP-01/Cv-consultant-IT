/**
 * Database context.
 *
 * SQLite WASM is synchronous once loaded, so components can just read during
 * render — no loading states, no query cache, no async waterfalls. The only
 * thing React needs is a nudge when something is written, which `revision`
 * provides: mutate through `write()` and every reader re-renders.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { migrate } from '../db/migrations';
import { isSeeded, seed } from '../db/seed';
import { openDatabase, type Db } from '../db/sqlite';

interface DbContextValue {
  db: Db;
  revision: number;
  /** Run a mutation, then re-render everything that reads the database. */
  write: <T>(fn: (db: Db) => T) => T;
  /**
   * Resolve once everything written so far is durable.
   *
   * The mutation itself is synchronous, but writing the image to IndexedDB is
   * not — so anything that navigates away right after saving must await this,
   * or a reload a few milliseconds later would find the previous state. There
   * is no synchronous storage API to make this go away, and `pagehide` cannot
   * await an async write.
   */
  flush: () => Promise<void>;
}

const DbContext = createContext<DbContextValue | null>(null);

export function useDb(): DbContextValue {
  const ctx = useContext(DbContext);
  if (!ctx) throw new Error('useDb must be used inside <DbProvider>');
  return ctx;
}

/** Read-only access that re-runs whenever the database changes. */
export function useQuery<T>(fn: (db: Db) => T): T {
  const { db, revision } = useDb();
  // `revision` is the dependency that matters; db is stable for the session.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => fn(db), [db, revision]);
}

type Status =
  | { phase: 'loading' }
  | { phase: 'ready'; db: Db }
  | { phase: 'error'; error: Error };

export function DbProvider({ children }: { children: ReactNode }): ReactNode {
  const [status, setStatus] = useState<Status>({ phase: 'loading' });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let opened: Db | undefined;

    void (async () => {
      try {
        const db = await openDatabase();
        migrate(db);
        if (!isSeeded(db)) seed(db);
        await db.persist();
        opened = db;
        if (!cancelled) setStatus({ phase: 'ready', db });
      } catch (err) {
        if (!cancelled) {
          setStatus({ phase: 'error', error: err instanceof Error ? err : new Error(String(err)) });
        }
      }
    })();

    return () => {
      cancelled = true;
      opened?.close();
    };
  }, []);

  // A backgrounded tab can be frozen without warning; flush before that.
  useEffect(() => {
    if (status.phase !== 'ready') return;
    const { db } = status;
    const flush = (): void => void db.persist();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flush);
    };
  }, [status]);

  const write = useCallback(
    <T,>(fn: (db: Db) => T): T => {
      if (status.phase !== 'ready') throw new Error('database not ready');
      const out = fn(status.db);
      setRevision((r) => r + 1);
      return out;
    },
    [status],
  );

  const flush = useCallback(async (): Promise<void> => {
    if (status.phase === 'ready') await status.db.persist();
  }, [status]);

  const value = useMemo<DbContextValue | null>(
    () => (status.phase === 'ready' ? { db: status.db, revision, write, flush } : null),
    [status, revision, write, flush],
  );

  if (status.phase === 'loading') {
    return <div className="boot">Ouverture du graphe…</div>;
  }

  if (status.phase === 'error') {
    return (
      <div className="boot error">
        <h1>Impossible d’ouvrir la base</h1>
        <p className="sub">{status.error.message}</p>
        <p className="sub">
          Waza a besoin d’IndexedDB ou d’OPFS. En navigation privée sur certains
          navigateurs, les deux sont bloqués.
        </p>
      </div>
    );
  }

  return <DbContext.Provider value={value}>{children}</DbContext.Provider>;
}
