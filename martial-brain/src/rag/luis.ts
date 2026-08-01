/**
 * LUIS AI — l'analyste.
 *
 * Ce que fait cet agent, et surtout ce qu'il ne fait pas, tient en deux
 * régimes bien séparés.
 *
 * **Sur SON graphe** — ses fiches, son entraînement, l'analyse de son style —
 * LUIS **récupère avant de répondre** : le pack de connaissances choisi, ses
 * fiches, les voisins de graphe des fiches trouvées. Il répond sur ce matériau
 * et cite ses sources par identifiant. Une affirmation sans source est, dans
 * ce domaine, indiscernable d'une invention plausible — et une invention
 * plausible sur un placement de pied se paie en sparring. Il n'invente jamais
 * de chiffre sur ses données : taux de réussite, volume, fréquence des
 * erreurs sont mesurés en SQL et injectés dans le contexte tout faits. C'est
 * la règle qui tient depuis le premier cahier des charges : un modèle
 * produirait un nombre vraisemblable, on veut un nombre juste.
 *
 * **En dehors** — un calcul, une question de culture générale, une recherche
 * qui ne concerne pas sa base — LUIS répond avec les connaissances générales
 * du modèle, comme le ferait n'importe quel assistant : ce n'est pas parce que
 * la question sort du graphe qu'il faut refuser d'y répondre. La seule
 * exigence est la transparence : la réponse dit qu'elle sort de la base,
 * pour que la distinction entre « sourcé » et « connaissance générale » reste
 * toujours visible.
 *
 * Sur ce que le corpus ne contient pas, LUIS le dit franchement plutôt que
 * d'improviser une réponse sourcée qui ne l'est pas.
 */
import { graphHealth, mainWeapons, successRates, trainingTotals } from '../db/analytics';
import { getEntity } from '../db/queries';
import type { Db } from '../db/sqlite';
import { canEmbed, embed, type Fetcher, type ProviderId } from '../ai/providers';
import { route, usableProviders, type RouteResult } from '../ai/router';
import type { Settings } from '../settings';
import { buildContext, retrieve, type Hit } from './retrieve';

export interface Turn {
  role: 'user' | 'assistant';
  text: string;
}

export interface AskInput {
  question: string;
  /** Les échanges précédents, du plus ancien au plus récent. */
  history?: readonly Turn[];
  /** Packs à consulter. Vide = tout le corpus installé (le mode « mixte »). */
  slugs?: readonly string[];
  /** La fiche ouverte quand la question est posée. */
  focusId?: string;
  prefer?: { provider: ProviderId; model: string };
  fetcher?: Fetcher;
}

export interface AskResult {
  answer: string;
  hits: Hit[];
  used: { fts: number; vector: number; graph: number };
  route: RouteResult;
}

const SYSTEM = `Tu es LUIS AI, analyste de combat. Tu assistes un pratiquant qui tient un
graphe de connaissances martiales (techniques, combinaisons, contres, situations,
tactiques, biomécanique, lecture adverse, sparrings, combats, hypothèses,
décisions, erreurs, objectifs, exercices, ressources).

Ton rôle est celui d'un analyste, pas d'un professeur : tu travailles sur SES
données, tu ne récites pas un cours.

RÈGLES ABSOLUES

Sur SON graphe (ses fiches, son entraînement, l'analyse de son style) :
1. Tu réponds à partir du CONTEXTE fourni. S'il ne suffit pas, tu le dis
   franchement et tu indiques quelle fiche il manque — tu n'inventes rien à
   sa place.
2. Tu cites tes sources entre crochets, à la fin de la phrase concernée :
   [K003] pour une fiche, [pack:kyokushin] pour un passage de référence.
   Une affirmation sur son graphe sans source est interdite.
3. Tu n'inventes JAMAIS de chiffre sur ses données. Les statistiques du bloc
   MESURES sont calculées en SQL : tu peux les citer telles quelles, jamais
   en produire d'autres, jamais les recalculer.
4. Tu n'inventes JAMAIS d'identifiant de fiche. Si un code n'est pas dans le
   contexte, il n'existe pas.

En dehors de son graphe (calcul, culture générale, recherche extérieure à sa
base) :
5. Tu réponds avec tes connaissances générales, MÊME si le contexte est vide
   — ce n'est pas parce que la question sort de sa base qu'il faut refuser.
   Un calcul explicite (conversion, moyenne sur des nombres qu'il te donne)
   n'est pas concerné par la règle 3 : ce n'est pas un chiffre inventé sur
   son entraînement, c'est un calcul qu'on te demande.
6. Tu signales alors clairement que ça sort de sa base, par exemple en
   commençant la réponse par « Hors de ta base — », pour que la différence
   avec une réponse sourcée reste toujours visible.

Dans tous les cas :
7. Tu ne donnes pas de conseil médical. Douleur, blessure, perte de
   connaissance : tu renvoies vers un professionnel de santé, sans exception.

STYLE
- Français, direct, concret. Pas de préambule, pas de « en tant qu'IA ».
- Court par défaut. Une analyse tient en cinq à dix lignes ; on demande plus si
  on en veut plus.
- Quand tu proposes un axe de travail, il est actionnable la séance suivante :
  un drill, une contrainte de sparring, une chose à observer.
- Termine par une ligne « À ficher : » quand la conversation a produit quelque
  chose qui mérite une fiche (hypothèse, décision, erreur, principe). Sinon
  n'ajoute rien.`;

/** Les mesures, calculées en SQL, jamais par le modèle. */
function measures(db: Db): string {
  const health = graphHealth(db);
  const totals = trainingTotals(db);
  const weapons = mainWeapons(db, 5);
  const combos = successRates(db, 'combo').slice(0, 5);
  const counters = successRates(db, 'counter').slice(0, 5);

  const lines = [
    `Fiches : ${health.entities} · Relations : ${health.links} · Fiches isolées : ${health.orphans}`,
    `Hypothèses ouvertes : ${health.hypothesesOpen}`,
    `Volume enregistré : ${totals.minutes} min sur ${totals.bouts} séance(s)`,
  ];

  if (weapons.length) {
    lines.push(
      `Techniques les plus citées : ${weapons.map((w) => `${w.code} ${w.title} (${w.uses}×)`).join(', ')}`,
    );
  }
  if (combos.length) {
    lines.push(
      `Réussite des combinaisons : ${combos.map((c) => `${c.code} ${c.rate} %`).join(', ')}`,
    );
  }
  if (counters.length) {
    lines.push(`Réussite des contres : ${counters.map((c) => `${c.code} ${c.rate} %`).join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * Vectorise la question, si c'est possible ET utile.
 *
 * Deux conditions, pas une : il faut une clé capable de vectoriser, et il faut
 * qu'au moins un passage soit déjà vectorisé. Sinon on dépenserait une requête
 * de quota pour comparer la question à zéro vecteur.
 *
 * L'échec est silencieux et sans conséquence : la recherche plein texte est le
 * socle, les vecteurs sont le complément. Faire échouer une question parce
 * qu'un service d'embedding est indisponible serait absurde.
 */
async function embedQuestion(
  db: Db,
  settings: Settings,
  question: string,
  fetcher?: Fetcher,
): Promise<Float32Array | undefined> {
  const embedded =
    db.one<{ n: number }>(`SELECT count(*) AS n FROM rag_chunks WHERE embedding IS NOT NULL`)?.n ??
    0;
  if (embedded === 0) return undefined;

  const provider = usableProviders(settings).find((id) => canEmbed(id) && settings.aiKeys[id]);
  if (!provider) return undefined;

  try {
    const [vector] = await embed(provider, settings.aiKeys[provider] ?? '', [question], fetcher);
    return vector && vector.length > 0 ? vector : undefined;
  } catch {
    return undefined;
  }
}

export async function ask(db: Db, settings: Settings, input: AskInput): Promise<AskResult> {
  const queryVector = await embedQuestion(db, settings, input.question, input.fetcher);

  const { hits, used } = retrieve(db, input.question, {
    ...(input.slugs?.length ? { slugs: input.slugs } : {}),
    ...(queryVector ? { queryVector } : {}),
    ...(input.focusId ? { focusId: input.focusId } : {}),
  });

  const focus = input.focusId ? getEntity(db, input.focusId) : undefined;

  // L'historique est tronqué aux six derniers tours : au-delà, il coûte plus de
  // contexte qu'il n'en rapporte, et le contexte est ce qui manque.
  const history = (input.history ?? []).slice(-6);
  const conversation = history.length
    ? `CONVERSATION PRÉCÉDENTE\n${history
        .map((t) => `${t.role === 'user' ? 'Question' : 'Toi'} : ${t.text}`)
        .join('\n')}\n\n`
    : '';

  const prompt = [
    focus ? `FICHE OUVERTE : [${focus.code}] ${focus.title}\n` : '',
    conversation,
    `MESURES (calculées en SQL — cite-les, ne les recalcule pas)\n${measures(db)}\n`,
    `CONTEXTE\n${buildContext(hits) || '(aucun élément pertinent trouvé dans la base)'}\n`,
    `QUESTION\n${input.question}`,
  ]
    .filter(Boolean)
    .join('\n');

  const result = await route(settings, {
    system: SYSTEM,
    prompt,
    temperature: 0.3,
    maxTokens: 1400,
    ...(input.prefer ? { prefer: input.prefer } : {}),
    ...(input.fetcher ? { fetcher: input.fetcher } : {}),
  });

  return { answer: result.text, hits, used, route: result };
}
