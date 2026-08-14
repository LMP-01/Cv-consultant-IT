/**
 * Le corpus : installer, lister, vectoriser, supprimer.
 *
 * L'indexation plein texte est faite à l'installation et ne dépend d'aucune
 * clé. La vectorisation est une étape séparée, explicite et facultative — elle
 * consomme le quota gratuit de l'utilisateur, et lui faire dépenser son quota
 * sans le lui demander serait mal élevé.
 */
import type { Db } from '../db/sqlite';
import { uuid } from '../domain/ids';
import { embed, type Fetcher, type ProviderId } from '../ai/providers';
import { chunkMarkdown, indexableText } from './chunk';

export interface DocRow {
  id: string;
  source: 'pack' | 'import';
  slug: string;
  title: string;
  discipline: string;
  chunks: number;
  embedded: number;
  updated_at: number;
}

export function listDocs(db: Db): DocRow[] {
  return db.all<DocRow>(`SELECT * FROM rag_docs ORDER BY discipline, title`);
}

export function getDoc(db: Db, slug: string): DocRow | undefined {
  return db.one<DocRow>(`SELECT * FROM rag_docs WHERE slug = $slug`, { $slug: slug });
}

/**
 * Installe (ou réinstalle) un document.
 *
 * Réinstaller supprime d'abord : un pack corrigé ne doit pas cohabiter avec sa
 * version précédente, sinon la recherche remonte deux fois la même idée dans
 * deux formulations, et le modèle croit à une confirmation.
 */
export function installDoc(
  db: Db,
  input: { source: 'pack' | 'import'; slug: string; title: string; discipline?: string },
  markdown: string,
): DocRow {
  const chunks = chunkMarkdown(markdown);

  return db.tx(() => {
    removeDoc(db, input.slug);

    const id = uuid();
    const now = Date.now();
    db.run(
      `INSERT INTO rag_docs (id, source, slug, title, discipline, chunks, embedded, updated_at)
       VALUES ($id, $source, $slug, $title, $discipline, $chunks, 0, $now)`,
      {
        $id: id,
        $source: input.source,
        $slug: input.slug,
        $title: input.title,
        $discipline: input.discipline ?? '',
        $chunks: chunks.length,
        $now: now,
      },
    );

    for (const [ord, chunk] of chunks.entries()) {
      db.run(
        `INSERT INTO rag_chunks (id, doc_id, ord, heading, text) VALUES ($id, $doc, $ord, $h, $t)`,
        {
          $id: uuid(),
          $doc: id,
          $ord: ord,
          $h: chunk.heading,
          $t: chunk.text,
        },
      );
    }

    return {
      id,
      source: input.source,
      slug: input.slug,
      title: input.title,
      discipline: input.discipline ?? '',
      chunks: chunks.length,
      embedded: 0,
      updated_at: now,
    };
  });
}

export function removeDoc(db: Db, slug: string): void {
  const doc = getDoc(db, slug);
  if (!doc) return;
  db.tx(() => {
    db.run(`DELETE FROM rag_chunks WHERE doc_id = $id`, { $id: doc.id });
    db.run(`DELETE FROM rag_docs WHERE id = $id`, { $id: doc.id });
  });
}

/* ── Vecteurs ─────────────────────────────────────────────────────────────── */

/** Un Float32Array survit un aller-retour en BLOB sans perte ni conversion. */
export function packVector(vector: Float32Array): Uint8Array {
  return new Uint8Array(vector.buffer.slice(0));
}

export function unpackVector(blob: Uint8Array): Float32Array {
  // `slice` recopie : le tampon rendu par SQLite peut être réutilisé sous nos
  // pieds au prochain appel, et une vue dessus deviendrait silencieusement
  // fausse.
  const copy = blob.slice();
  return new Float32Array(copy.buffer, copy.byteOffset, copy.byteLength / 4);
}

/**
 * Vectorise ce qui ne l'est pas encore, par lots.
 *
 * Les lots sont petits (16) parce que le palier gratuit limite au nombre de
 * requêtes ET à la taille : un lot de deux cents passages se fait refuser en
 * bloc, et on perd tout le travail au lieu d'un seizième.
 *
 * `onProgress` existe pour que l'interface puisse montrer l'avancement plutôt
 * qu'un rond qui tourne : indexer un pack prend des dizaines de secondes, et
 * un utilisateur qui ne voit rien bouger recharge la page.
 */
export async function embedDoc(
  db: Db,
  slug: string,
  provider: ProviderId,
  apiKey: string,
  options: { onProgress?: (done: number, total: number) => void; fetcher?: Fetcher } = {},
): Promise<{ embedded: number; total: number }> {
  const doc = getDoc(db, slug);
  if (!doc) throw new Error(`document inconnu : ${slug}`);

  const pending = db.all<{ id: string; heading: string; text: string }>(
    `SELECT id, heading, text FROM rag_chunks WHERE doc_id = $id AND embedding IS NULL ORDER BY ord`,
    { $id: doc.id },
  );

  const total = doc.chunks;
  let done = total - pending.length;
  options.onProgress?.(done, total);

  for (let i = 0; i < pending.length; i += 16) {
    const batch = pending.slice(i, i + 16);
    const vectors = await embed(
      provider,
      apiKey,
      batch.map((c) => indexableText(c)),
      options.fetcher,
    );

    db.tx(() => {
      for (const [j, chunk] of batch.entries()) {
        const vector = vectors[j];
        if (!vector || vector.length === 0) continue;
        db.run(`UPDATE rag_chunks SET embedding = $v WHERE id = $id`, {
          $v: packVector(vector),
          $id: chunk.id,
        });
      }
    });

    done += batch.length;
    options.onProgress?.(done, total);
  }

  const embedded =
    db.one<{ n: number }>(
      `SELECT count(*) AS n FROM rag_chunks WHERE doc_id = $id AND embedding IS NOT NULL`,
      { $id: doc.id },
    )?.n ?? 0;

  db.run(`UPDATE rag_docs SET embedded = $n WHERE id = $id`, { $n: embedded, $id: doc.id });
  return { embedded, total };
}
