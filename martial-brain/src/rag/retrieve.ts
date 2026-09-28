/**
 * La récupération : trois pistes, une fusion, une expansion.
 *
 * Un RAG classique interroge un index vectoriel et s'arrête là. Ici il y a une
 * ressource qu'un index vectoriel n'a pas : **le graphe**. Une technique n'est
 * pas seulement un texte, c'est un nœud entouré de contres, de sparrings, de
 * principes. C'est ce qui distingue une réponse « sur le Mae Geri en général »
 * d'une réponse « sur TON Mae Geri, celui que R001 a vu passer deux fois ».
 *
 * D'où trois pistes menées de front :
 *
 *   1. **BM25 sur les packs** — la connaissance du domaine (biomécanique,
 *      règlements, cadres d'analyse), qui ne dépend d'aucune clé.
 *   2. **BM25 sur tes fiches** — ce que TU as écrit.
 *   3. **Vecteurs**, si les passages ont été vectorisés — le rappel
 *      sémantique : « comment ne pas me faire marcher dessus » retrouve
 *      « gestion de la distance » sans partager un seul mot avec.
 *
 * Puis une **fusion par rang réciproque** (RRF, Cormack & al. 2009) : chaque
 * piste vote avec 1/(k+rang). C'est la bonne fusion ici précisément parce
 * qu'elle ignore les scores : un bm25 négatif et un cosinus dans [0,1] ne sont
 * pas comparables, et les normaliser demanderait un étalonnage que rien ne
 * viendrait valider. Les rangs, eux, sont toujours comparables.
 *
 * Enfin l'**expansion à un saut** : les voisins immédiats des fiches retenues
 * entrent dans le contexte avec un poids moindre. C'est ce qui fait que la
 * question « pourquoi mon Mae Geri passe moins ? » ramène l'erreur technique
 * ER001 que personne n'a nommée dans la question.
 */
import { searchEntities, toMatchExpression, type EntityRecord } from '../db/queries';
import type { Db } from '../db/sqlite';
import { neighbourIds } from '../domain/links';
import { entityDef } from '../domain/schema';
import { getEntities } from '../db/queries';
import { unpackVector } from './store';

export interface PassageHit {
  kind: 'passage';
  id: string;
  docTitle: string;
  docSlug: string;
  heading: string;
  text: string;
}

export interface FicheHit {
  kind: 'fiche';
  id: string;
  record: EntityRecord;
  /** Vrai quand la fiche vient de l'expansion, pas d'une recherche directe. */
  viaGraph: boolean;
}

export type Hit = PassageHit | FicheHit;

export interface Retrieved {
  hits: Hit[];
  /** Ce qui a réellement tourné — affiché, pas caché. */
  used: { fts: number; vector: number; graph: number };
}

/**
 * La constante de RRF. 60 est la valeur de l'article d'origine ; elle amortit
 * la domination des tout premiers rangs, ce qui est exactement ce qu'on veut
 * quand une piste peut se tromper avec assurance.
 */
const K = 60;

function fuse(lists: readonly (readonly string[])[]): Map<string, number> {
  const scores = new Map<string, number>();
  for (const list of lists) {
    for (const [rank, id] of list.entries()) {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (K + rank + 1));
    }
  }
  return scores;
}

function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += (a[i] as number) * (b[i] as number);
  return dot; // les vecteurs sont stockés normalisés : le produit scalaire EST le cosinus
}

interface ChunkRow {
  id: string;
  heading: string;
  text: string;
  doc_title: string;
  doc_slug: string;
}

/** Passages trouvés en plein texte, du plus pertinent au moins. */
function ftsPassages(db: Db, query: string, slugs: readonly string[], limit: number): ChunkRow[] {
  const match = toMatchExpression(query, 'or');
  if (!match) return [];

  const bind: Record<string, string | number> = { $match: match };
  let filter = '';
  if (slugs.length) {
    filter = `AND d.slug IN (${slugs.map((_, i) => `$s${i}`).join(', ')})`;
    slugs.forEach((s, i) => (bind[`$s${i}`] = s));
  }

  return db.all<ChunkRow>(
    `SELECT c.id, c.heading, c.text, d.title AS doc_title, d.slug AS doc_slug
       FROM rag_fts f
       JOIN rag_chunks c ON c.rowid = f.rowid
       JOIN rag_docs   d ON d.id = c.doc_id
      WHERE rag_fts MATCH $match ${filter}
      ORDER BY bm25(rag_fts, 2.0, 1.0)
      LIMIT ${Number(limit)}`,
    bind,
  );
}

/**
 * Passages trouvés par proximité de sens.
 *
 * Le balayage est exhaustif — pas d'index vectoriel, pas de HNSW. C'est
 * délibéré : un corpus de quelques milliers de passages se compare en quelques
 * millisecondes en JavaScript, et un index approximatif apporterait une
 * structure à maintenir, une dépendance à charger et des résultats
 * approximatifs, pour gagner un temps que personne ne perçoit.
 */
function vectorPassages(
  db: Db,
  queryVector: Float32Array,
  slugs: readonly string[],
  limit: number,
): ChunkRow[] {
  const bind: Record<string, string> = {};
  let filter = '';
  if (slugs.length) {
    filter = `AND d.slug IN (${slugs.map((_, i) => `$s${i}`).join(', ')})`;
    slugs.forEach((s, i) => (bind[`$s${i}`] = s));
  }

  const rows = db.all<ChunkRow & { embedding: Uint8Array }>(
    `SELECT c.id, c.heading, c.text, c.embedding, d.title AS doc_title, d.slug AS doc_slug
       FROM rag_chunks c
       JOIN rag_docs d ON d.id = c.doc_id
      WHERE c.embedding IS NOT NULL ${filter}`,
    bind,
  );

  return rows
    .map((row) => ({ row, score: cosine(queryVector, unpackVector(row.embedding)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ row }) => row);
}

export interface RetrieveOptions {
  /** Restreindre aux packs de ces slugs. Vide = tout le corpus installé. */
  slugs?: readonly string[];
  /** Vecteur de la question, quand une clé sait vectoriser. */
  queryVector?: Float32Array;
  /** Fiche ouverte au moment de la question : elle entre d'office. */
  focusId?: string;
  maxPassages?: number;
  maxFiches?: number;
}

export function retrieve(db: Db, query: string, options: RetrieveOptions = {}): Retrieved {
  const {
    slugs = [],
    queryVector,
    focusId,
    maxPassages = 6,
    maxFiches = 8,
  } = options;

  /* ── Passages ─────────────────────────────────────────────────────────── */

  const fts = ftsPassages(db, query, slugs, maxPassages * 3);
  const vec = queryVector ? vectorPassages(db, queryVector, slugs, maxPassages * 3) : [];

  const byId = new Map<string, ChunkRow>();
  for (const row of [...fts, ...vec]) byId.set(row.id, row);

  const passageScores = fuse([fts.map((r) => r.id), vec.map((r) => r.id)]);
  const passages: PassageHit[] = [...passageScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxPassages)
    .flatMap(([id]) => {
      const row = byId.get(id);
      return row
        ? [
            {
              kind: 'passage' as const,
              id: row.id,
              docTitle: row.doc_title,
              docSlug: row.doc_slug,
              heading: row.heading,
              text: row.text,
            },
          ]
        : [];
    });

  /* ── Fiches ───────────────────────────────────────────────────────────── */

  // `or` plutôt que `and` : une question est une phrase, pas une requête. En
  // `and`, « pourquoi mon mae geri passe moins depuis mon dernier combat ? »
  // ne trouve rien du tout.
  const direct = searchEntities(db, query, { match: 'or', limit: maxFiches });
  const seed = focusId ? [focusId, ...direct.map((r) => r.id)] : direct.map((r) => r.id);

  // Expansion à un saut autour des meilleures fiches seulement : élargir
  // depuis tout le classement ramènerait la moitié du graphe.
  const expanded: string[] = [];
  for (const id of seed.slice(0, 3)) {
    for (const neighbour of neighbourIds(db, id)) {
      if (!seed.includes(neighbour) && !expanded.includes(neighbour)) expanded.push(neighbour);
    }
  }

  const ficheIds = [...new Set([...seed, ...expanded])].slice(0, maxFiches + 6);
  const records = new Map(getEntities(db, ficheIds).map((r) => [r.id, r]));

  const fiches: FicheHit[] = ficheIds.flatMap((id) => {
    const record = records.get(id);
    return record
      ? [{ kind: 'fiche' as const, id, record, viaGraph: !seed.includes(id) }]
      : [];
  });

  return {
    hits: [...passages, ...fiches],
    used: { fts: fts.length, vector: vec.length, graph: expanded.length },
  };
}

/* ── Mise en contexte ───────────────────────────────────────────────────── */

function renderRecord(record: EntityRecord): string {
  const def = entityDef(record.type);
  const lines = [`[${record.code}] ${record.title} — ${def.label}`];
  for (const field of def.fields) {
    const value = record.data[field.name];
    if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) continue;
    if (field.name === 'media') continue;
    lines.push(`  ${field.label} : ${Array.isArray(value) ? value.join(', ') : String(value)}`);
  }
  return lines.join('\n');
}

/**
 * Le contexte envoyé au modèle.
 *
 * Chaque bloc porte son étiquette de citation — `[K003]`, `[pack:kyokushin]` —
 * et le système demandera au modèle de citer. C'est ce qui rend la réponse
 * vérifiable : sans étiquette, une affirmation fausse est indiscernable d'une
 * affirmation juste, et l'utilisateur n'a aucun moyen de remonter à la source.
 *
 * Le budget est en caractères plutôt qu'en jetons : compter les jetons
 * demanderait d'embarquer un tokeniseur par famille de modèles pour affiner une
 * borne qui n'a pas besoin d'être fine. Quatre caractères par jeton est une
 * approximation grossière et suffisante, dans le sens prudent.
 */
export function buildContext(hits: readonly Hit[], budgetChars = 12_000): string {
  const blocks: string[] = [];
  let used = 0;

  for (const hit of hits) {
    const block =
      hit.kind === 'passage'
        ? `[pack:${hit.docSlug}] ${hit.docTitle}${hit.heading ? ` › ${hit.heading}` : ''}\n${hit.text}`
        : `${renderRecord(hit.record)}${hit.viaGraph ? '\n  (relié à une fiche trouvée, pas à la question)' : ''}`;

    if (used + block.length > budgetChars) continue;
    blocks.push(block);
    used += block.length;
  }

  return blocks.join('\n\n---\n\n');
}
