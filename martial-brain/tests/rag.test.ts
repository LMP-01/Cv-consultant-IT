/**
 * Le RAG.
 *
 * Ce qui se teste ici n'est pas la qualité des réponses — elle dépend d'un
 * modèle distant. Ce qui se teste, c'est la **mécanique de récupération** :
 * qu'un passage soit retrouvé par les mots qu'il contient, qu'un pack filtré
 * n'en laisse pas passer un autre, qu'un vecteur retrouve ce que le plein texte
 * rate, et surtout que **tout continue à fonctionner sans vecteurs du tout**.
 *
 * Ce dernier point est le plus important : Groq ne vectorise pas, une clé peut
 * manquer, une indexation peut s'arrêter à mi-chemin. Un RAG qui ne répond plus
 * dans ces cas-là ne serait pas utilisable.
 */
import { describe, expect, it } from 'vitest';
import { chunkMarkdown, indexableText } from '../src/rag/chunk';
import { buildContext, retrieve } from '../src/rag/retrieve';
import { installDoc, listDocs, packVector, removeDoc, unpackVector } from '../src/rag/store';
import { createEntity } from '../src/db/queries';
import { link } from '../src/domain/links';
import { freshDb } from './helpers';

const KYOKUSHIN = `# Kyokushin

Introduction courte du document.

## Gestion de la distance

Sans menace de poing au visage, les deux combattants se plantent à distance de
poing au corps. Reculer n'a aucune justification réglementaire et l'arbitrage
sanctionne la passivité.

## Low kick

Le low kick est l’arme d’usure. Il dégrade l'appui, donc la force de réaction du
sol, donc la puissance de tout le reste.

### Le check

Un low kick checké coûte plus cher à celui qui le donne.
`;

const BOXE = `# Boxe anglaise

## Le jab

Le jab est un instrument de mesure, pas un coup de puissance. Il établit la
distance et ouvre les séquences.
`;

describe('découpage markdown', () => {
  it('coupe aux titres et garde le fil d’Ariane', () => {
    const chunks = chunkMarkdown(KYOKUSHIN);

    const headings = chunks.map((c) => c.heading);
    expect(headings).toContain('Kyokushin › Gestion de la distance');
    expect(headings).toContain('Kyokushin › Low kick');

    // Le fil d'Ariane est préfixé au texte indexé : chercher « Kyokushin »
    // doit trouver un passage qui ne prononce jamais le mot.
    const distance = chunks.find((c) => c.heading.endsWith('Gestion de la distance'));
    expect(distance).toBeDefined();
    expect(indexableText(distance!)).toContain('Kyokushin');
    expect(distance!.text).not.toContain('# ');
  });

  it('ne prend pas un dièse de bloc de code pour un titre', () => {
    const chunks = chunkMarkdown(
      '# Titre\n\nTexte du corps qui doit rester avec son titre pour être trouvable.\n\n```bash\n# ceci est un commentaire shell\necho ok\n```\n',
    );
    expect(chunks.every((c) => c.heading === 'Titre')).toBe(true);
  });

  it('recolle une section trop courte au lieu de l’indexer seule', () => {
    const chunks = chunkMarkdown(KYOKUSHIN);

    // « ### Le check » ne fait qu'une phrase : il rejoint « Low kick » plutôt
    // que d'occuper un rang dans le classement pour rien.
    const lowKick = chunks.find((c) => c.heading === 'Kyokushin › Low kick');
    expect(lowKick?.text).toContain('checké');
    // Et il emporte son titre dans le texte : la recherche « check » doit
    // encore le trouver après la fusion.
    expect(lowKick?.text).toContain('Le check');

    // Le paragraphe d'introduction, lui, reste : il n'a pas de passage
    // précédent où aller, et le fusionner en avant lui donnerait le titre de
    // la section suivante — une citation fausse.
    expect(chunks[0]?.heading).toBe('Kyokushin');
    expect(chunks).toHaveLength(3);
  });

  it('coupe un passage trop long à une frontière de phrase', () => {
    const long = `# T\n\n${'Une phrase de longueur raisonnable qui se répète. '.repeat(80)}`;
    const chunks = chunkMarkdown(long);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.text.length).toBeLessThanOrEqual(1300);
  });
});

describe('corpus', () => {
  it('installe, remplace et supprime', async () => {
    const db = await freshDb();

    installDoc(db, { source: 'pack', slug: 'kyokushin', title: 'Kyokushin' }, KYOKUSHIN);
    expect(listDocs(db)).toHaveLength(1);
    const before = listDocs(db)[0]?.chunks ?? 0;
    expect(before).toBeGreaterThan(1);

    // Réinstaller REMPLACE. Deux versions du même pack feraient remonter deux
    // fois la même idée, et le modèle y verrait une confirmation.
    installDoc(db, { source: 'pack', slug: 'kyokushin', title: 'Kyokushin' }, BOXE);
    expect(listDocs(db)).toHaveLength(1);
    expect(db.one<{ n: number }>(`SELECT count(*) AS n FROM rag_chunks`)?.n).toBe(
      listDocs(db)[0]?.chunks,
    );

    removeDoc(db, 'kyokushin');
    expect(listDocs(db)).toHaveLength(0);
    // Les passages partent avec le document, sinon l'index les remonterait
    // encore alors que leur source n'existe plus.
    expect(db.one<{ n: number }>(`SELECT count(*) AS n FROM rag_chunks`)?.n).toBe(0);

    db.close();
  });

  it('conserve un vecteur intact à travers le stockage', () => {
    const vector = Float32Array.from([0.1, -0.25, 0.5, 0.75]);
    const round = unpackVector(packVector(vector));
    expect([...round]).toEqual([...vector]);
  });
});

describe('récupération', () => {
  it('retrouve un passage par ses mots, sans aucun vecteur', async () => {
    const db = await freshDb();
    installDoc(db, { source: 'pack', slug: 'kyokushin', title: 'Kyokushin' }, KYOKUSHIN);

    const { hits, used } = retrieve(db, 'pourquoi le low kick use-t-il l’adversaire ?');

    expect(used.vector).toBe(0); // aucun vecteur : le socle est le plein texte
    const passages = hits.filter((h) => h.kind === 'passage');
    expect(passages.length).toBeGreaterThan(0);
    expect(passages.some((p) => p.kind === 'passage' && p.text.includes('arme d’usure'))).toBe(true);

    db.close();
  });

  it('ne franchit pas le filtre de pack', async () => {
    const db = await freshDb();
    installDoc(db, { source: 'pack', slug: 'kyokushin', title: 'Kyokushin' }, KYOKUSHIN);
    installDoc(db, { source: 'pack', slug: 'boxe', title: 'Boxe' }, BOXE);

    const all = retrieve(db, 'distance');
    expect(all.hits.some((h) => h.kind === 'passage' && h.docSlug === 'boxe')).toBe(true);

    const only = retrieve(db, 'distance', { slugs: ['kyokushin'] });
    expect(only.hits.every((h) => h.kind !== 'passage' || h.docSlug === 'kyokushin')).toBe(true);

    db.close();
  });

  it('ramène les voisins de graphe que la question ne nomme pas', async () => {
    const db = await freshDb();

    const mae = createEntity(db, 'technique', { title: 'Mae Geri', data: {} });
    const erreur = createEntity(db, 'error', {
      title: 'Armement trop lent du genou',
      data: { cause: 'Hanche qui ne monte pas' },
    });
    link(db, mae.id, erreur.id);

    const { hits, used } = retrieve(db, 'mae geri');

    // L'erreur n'a aucun mot en commun avec la question : elle n'arrive que
    // par le graphe. C'est exactement ce que cette application peut faire et
    // qu'un index vectoriel seul ne ferait pas.
    const erreurHit = hits.find((h) => h.kind === 'fiche' && h.record.id === erreur.id);
    expect(erreurHit).toBeDefined();
    expect(erreurHit?.kind === 'fiche' && erreurHit.viaGraph).toBe(true);
    expect(used.graph).toBeGreaterThan(0);

    db.close();
  });

  it('place la fiche ouverte dans le contexte même sans mot commun', async () => {
    const db = await freshDb();
    const fiche = createEntity(db, 'principle', { title: 'La simplicité résiste', data: {} });

    const { hits } = retrieve(db, 'une question sans rapport lexical', { focusId: fiche.id });
    expect(hits.some((h) => h.kind === 'fiche' && h.record.id === fiche.id)).toBe(true);

    db.close();
  });

  it('classe mieux quand les deux pistes sont d’accord', async () => {
    const db = await freshDb();
    installDoc(db, { source: 'pack', slug: 'kyokushin', title: 'Kyokushin' }, KYOKUSHIN);

    const rows = db.all<{ id: string; text: string }>(`SELECT id, text FROM rag_chunks`);
    const lowKick = rows.find((r) => r.text.includes('arme d’usure'));
    const autre = rows.find((r) => !r.text.includes('arme d’usure'));
    expect(lowKick && autre).toBeTruthy();

    // Vecteurs fabriqués : celui du low kick est colinéaire à la requête,
    // l'autre orthogonal. La fusion doit alors le placer en tête.
    db.run(`UPDATE rag_chunks SET embedding = $v WHERE id = $id`, {
      $v: packVector(Float32Array.from([1, 0])),
      $id: lowKick!.id,
    });
    db.run(`UPDATE rag_chunks SET embedding = $v WHERE id = $id`, {
      $v: packVector(Float32Array.from([0, 1])),
      $id: autre!.id,
    });

    const { hits, used } = retrieve(db, 'usure', {
      queryVector: Float32Array.from([1, 0]),
    });

    expect(used.vector).toBeGreaterThan(0);
    const first = hits.find((h) => h.kind === 'passage');
    expect(first?.kind === 'passage' && first.text.includes('arme d’usure')).toBe(true);

    db.close();
  });
});

describe('mise en contexte', () => {
  it('étiquette chaque bloc pour que la réponse soit vérifiable', async () => {
    const db = await freshDb();
    installDoc(db, { source: 'pack', slug: 'kyokushin', title: 'Kyokushin' }, KYOKUSHIN);
    createEntity(db, 'technique', { title: 'Low kick', data: {} });

    const { hits } = retrieve(db, 'low kick');
    const context = buildContext(hits);

    expect(context).toContain('[pack:kyokushin]');
    expect(context).toMatch(/\[K\d{3}\]/);

    db.close();
  });

  it('respecte le budget plutôt que de tronquer une réponse en vol', async () => {
    const db = await freshDb();
    installDoc(db, { source: 'pack', slug: 'kyokushin', title: 'Kyokushin' }, KYOKUSHIN);

    const { hits } = retrieve(db, 'distance low kick check');
    const context = buildContext(hits, 200);
    expect(context.length).toBeLessThanOrEqual(400);

    db.close();
  });
});
