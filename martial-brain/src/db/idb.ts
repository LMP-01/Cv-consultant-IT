/**
 * Minimal IndexedDB key/value helper.
 *
 * Two users: persisting the whole SQLite image when OPFS is unavailable, and
 * storing media blobs (photos/videos), which never belong inside the SQL image.
 */

const DB_NAME = 'waza';
const DB_VERSION = 1;

export const STORE_KV = 'kv';
export const STORE_MEDIA = 'media';

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_KV)) db.createObjectStore(STORE_KV);
      if (!db.objectStoreNames.contains(STORE_MEDIA)) db.createObjectStore(STORE_MEDIA);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return opening;
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

export function idbGet<T>(store: string, key: string): Promise<T | undefined> {
  return tx<T | undefined>(store, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>);
}

export function idbSet(store: string, key: string, value: unknown): Promise<void> {
  return tx(store, 'readwrite', (s) => s.put(value, key) as IDBRequest<IDBValidKey>).then(
    () => undefined,
  );
}

export function idbDelete(store: string, key: string): Promise<void> {
  return tx(store, 'readwrite', (s) => s.delete(key) as IDBRequest<undefined>).then(
    () => undefined,
  );
}

export function idbKeys(store: string): Promise<string[]> {
  return tx<IDBValidKey[]>(store, 'readonly', (s) => s.getAllKeys()).then((k) =>
    k.map(String),
  );
}
