/**
 * Export / import of the whole knowledge base as a single .sqlite3 file.
 *
 * This is the backup story and, until cloud sync is configured, the
 * device-to-device transfer story: one file, openable by any SQLite tool, with
 * no proprietary envelope around it. It is deliberately not JSON — the file
 * that comes out is the database that went in, indexes and all.
 */
import type { Db } from './sqlite';

export function exportFilename(now = new Date()): string {
  const stamp = now.toISOString().slice(0, 10);
  return `waza-${stamp}.sqlite3`;
}

/** Trigger a download of the current database. */
export async function downloadDatabase(db: Db): Promise<void> {
  await db.persist();
  const bytes = db.exportBytes();
  // Copy into a fresh buffer: the WASM heap can move underneath the Blob.
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/x-sqlite3' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = exportFilename();
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Replace the database with an uploaded image.
 * Resolves once written; the caller reloads to pick it up.
 */
export async function restoreDatabase(db: Db, file: File): Promise<void> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  await db.importImage(bytes);
}
