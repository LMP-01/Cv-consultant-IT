import { migrate } from '../src/db/migrations';
import { openMemoryDatabase, type Db } from '../src/db/sqlite';

export async function freshDb(): Promise<Db> {
  const db = await openMemoryDatabase();
  migrate(db);
  return db;
}
