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
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { migrate } from '../db/migrations';
import { isSeeded, seed } from '../db/seed';
import { loadPack, packDef } from '../rag/packs';
import { getDoc, installDoc } from '../rag/store';
import { openDatabase, type Db } from '../db/sqlite';
import { loadSettings } from '../settings';
import { AutoSync, type SyncState } from '../sync/auto';
import { httpTransport } from '../sync/client';

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
  /** Latest automatic-sync outcome, for the header indicator and settings. */
  syncState: SyncState;
  /** Force a sync cycle now (the "Synchroniser" button). */
  syncNow: () => Promise<void>;
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
        await installBaselinePack(db);
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

  const [syncState, setSyncState] = useState<SyncState>({ phase: 'idle' });
  const autoRef = useRef<AutoSync | null>(null);

  // Automatic sync. Nothing happens unless a device has been paired, so this is
  // inert for anyone using Combat OS purely offline.
  useEffect(() => {
    if (status.phase !== 'ready') return;
    const auto = new AutoSync({
      db: status.db,
      transport: () => {
        const { syncUrl, syncToken } = loadSettings();
        // An empty URL means "same origin": the app and the API ship together.
        return syncToken ? httpTransport(syncUrl, syncToken) : undefined;
      },
      onState: setSyncState,
      onChanged: () => setRevision((r) => r + 1),
    });
    auto.start();
    autoRef.current = auto;
    return () => {
      auto.stop();
      autoRef.current = null;
    };
  }, [status]);

  const write = useCallback(
    <T,>(fn: (db: Db) => T): T => {
      if (status.phase !== 'ready') throw new Error('database not ready');
      const out = fn(status.db);
      setRevision((r) => r + 1);
      autoRef.current?.nudge();
      return out;
    },
    [status],
  );

  const syncNow = useCallback(async (): Promise<void> => {
    await autoRef.current?.run('manuelle');
  }, []);

  const flush = useCallback(async (): Promise<void> => {
    if (status.phase === 'ready') await status.db.persist();
  }, [status]);

  const value = useMemo<DbContextValue | null>(
    () =>
      status.phase === 'ready'
        ? { db: status.db, revision, write, flush, syncState, syncNow }
        : null,
    [status, revision, write, flush, syncState, syncNow],
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
          Combat OS a besoin d’IndexedDB ou d’OPFS. En navigation privée sur certains
          navigateurs, les deux sont bloqués.
        </p>
      </div>
    );
  }

  return <DbContext.Provider value={value}>{children}</DbContext.Provider>;
}


/**
 * Installe le pack « fondamentaux » au premier démarrage.
 *
 * C'est le seul pack installé d'office, et pour une raison précise : il ne
 * contient aucun règlement, il contient la méthode d'analyse. Il est donc
 * pertinent quelle que soit la discipline, et sans lui LUIS AI démarre sans
 * rien d'autre que les fiches de l'utilisateur — c'est-à-dire, au premier
 * lancement, presque rien.
 *
 * Les quinze packs de style, eux, s'installent à la demande : personne ne
 * pratique quinze disciplines, et les télécharger tous coûterait plus que ce
 * que pèse l'application.
 *
 * L'échec est volontairement silencieux. Un pack qui ne se charge pas — réseau
 * coupé au premier lancement, cache vide — ne doit pas empêcher l'application
 * de s'ouvrir : elle fonctionne entièrement sans corpus.
 */
async function installBaselinePack(db: Db): Promise<void> {
  const def = packDef('fondamentaux');
  if (!def || getDoc(db, def.slug)) return;
  try {
    const markdown = await loadPack(def.slug);
    installDoc(
      db,
      { source: 'pack', slug: def.slug, title: def.title, discipline: def.discipline },
      markdown,
    );
  } catch {
    /* le corpus est facultatif ; l'application s'ouvre sans lui */
  }
}
