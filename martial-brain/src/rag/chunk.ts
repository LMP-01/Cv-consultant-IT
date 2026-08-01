/**
 * Découpage d'un document markdown en passages indexables.
 *
 * Le choix du découpage décide de la qualité du RAG plus sûrement que le
 * modèle qui répond derrière. Trois règles, chacune pour une raison précise :
 *
 * 1. **On coupe aux titres, pas tous les N caractères.** Un pack de
 *    connaissances est déjà structuré par son auteur ; « ## Gestion de la
 *    distance » délimite une idée complète. Couper au caractère près
 *    trancherait au milieu d'un raisonnement et renverrait la moitié d'une
 *    réponse.
 *
 * 2. **Chaque passage porte le chemin de ses titres.** Un extrait qui dit
 *    « reculer d'un demi-pas suffit » ne veut rien dire seul ; précédé de
 *    « Kyokushin › Gestion de la distance › Contre le rentre-dedans », il se
 *    situe. C'est aussi ce qui permet à la réponse de citer sa source de
 *    façon vérifiable.
 *
 * 3. **Une section trop longue est redécoupée avec recouvrement.** Le
 *    recouvrement évite qu'une idée à cheval sur la coupure disparaisse des
 *    deux morceaux à la fois.
 */

export interface Chunk {
  /** Fil d'Ariane des titres, du plus général au plus précis. */
  heading: string;
  text: string;
}

/** Au-delà, un passage dilue la requête et mange le budget de contexte. */
const MAX_CHARS = 1200;
/**
 * En deçà, un passage n'apporte rien seul et rejoint le précédent.
 *
 * Le seuil est volontairement bas. Fusionner une section lui fait perdre son
 * fil d'Ariane, donc sa citation : « Kyokushin › Low kick » redevient
 * « Kyokushin ». Un seuil généreux avalerait des sections parfaitement
 * trouvables pour gagner quelques rangs de classement — mauvais échange. On
 * n'absorbe donc que les fragments qui ne se retrouveraient de toute façon
 * jamais seuls : une phrase isolée sous un sous-titre.
 */
const MIN_CHARS = 80;
const OVERLAP = 150;

/** Coupe un texte long à la frontière de phrase la plus proche de la limite. */
function splitLong(text: string): string[] {
  if (text.length <= MAX_CHARS) return [text];

  const parts: string[] = [];
  let rest = text;

  while (rest.length > MAX_CHARS) {
    // Chercher une fin de phrase dans le dernier quart de la fenêtre ; à
    // défaut, un saut de ligne ; à défaut, couper net.
    const window = rest.slice(0, MAX_CHARS);
    const at =
      Math.max(
        window.lastIndexOf('. '),
        window.lastIndexOf('.\n'),
        window.lastIndexOf(' ; '),
      ) > MAX_CHARS * 0.6
        ? Math.max(window.lastIndexOf('. '), window.lastIndexOf('.\n'), window.lastIndexOf(' ; ')) + 1
        : window.lastIndexOf('\n') > MAX_CHARS * 0.5
          ? window.lastIndexOf('\n')
          : MAX_CHARS;

    parts.push(rest.slice(0, at).trim());
    rest = rest.slice(Math.max(0, at - OVERLAP)).trim();
  }

  if (rest) parts.push(rest);
  return parts;
}

export function chunkMarkdown(markdown: string): Chunk[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');

  // Le fil d'Ariane courant, indexé par niveau de titre.
  const trail: string[] = [];
  const sections: { heading: string; lines: string[] }[] = [];
  let current: { heading: string; lines: string[] } | undefined;

  let inCode = false;

  for (const line of lines) {
    // Un `#` dans un bloc de code n'est pas un titre — c'est un commentaire
    // shell ou un dièse de couleur. Sans ce garde, un pack qui montre une
    // commande verrait son plan exploser.
    if (/^\s*```/.test(line)) inCode = !inCode;

    const match = inCode ? null : /^(#{1,6})\s+(.*)$/.exec(line);
    if (match) {
      const level = match[1]?.length ?? 1;
      const title = (match[2] ?? '').trim();
      trail.length = Math.max(0, level - 1);
      trail[level - 1] = title;
      current = { heading: trail.filter(Boolean).join(' › '), lines: [] };
      sections.push(current);
      continue;
    }

    if (!current) {
      current = { heading: '', lines: [] };
      sections.push(current);
    }
    current.lines.push(line);
  }

  const chunks: Chunk[] = [];

  for (const section of sections) {
    const body = section.lines.join('\n').trim();
    if (!body) continue;

    for (const part of splitLong(body)) {
      if (!part) continue;

      // Une section courte est recollée à la précédente plutôt que d'être
      // indexée seule : « ### Note » suivi d'une ligne ne se retrouve jamais
      // par la recherche et occupe une place dans le classement.
      const previous = chunks[chunks.length - 1];
      if (part.length < MIN_CHARS && previous && previous.text.length + part.length < MAX_CHARS) {
        previous.text = `${previous.text}\n\n${section.heading ? `${section.heading}\n` : ''}${part}`;
        continue;
      }

      chunks.push({ heading: section.heading, text: part });
    }
  }

  return chunks;
}

/**
 * Le texte réellement vectorisé et indexé.
 *
 * Le fil d'Ariane est préfixé au corps : la recherche plein texte doit pouvoir
 * trouver « Kyokushin » dans un passage qui ne prononce jamais le mot parce
 * qu'il est sous le titre « Kyokushin ».
 */
export function indexableText(chunk: Chunk): string {
  return chunk.heading ? `${chunk.heading}\n${chunk.text}` : chunk.text;
}
