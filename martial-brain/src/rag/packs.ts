/**
 * Les packs de connaissances.
 *
 * Ce sont des fichiers markdown versionnés dans le dépôt, pas des données. Ils
 * décrivent ce qu'un analyste doit savoir pour lire un combat : ce qui marque
 * des points dans tel règlement, ce qui se paie, ce qu'il faut observer, quelles
 * erreurs reviennent. Le modèle ne les connaît pas mieux que ça — il connaît
 * beaucoup de choses en général et rien de précis sur TON règlement.
 *
 * `import.meta.glob` en mode paresseux : un pack n'est téléchargé que lorsqu'on
 * l'installe. Les seize packs pèsent ensemble plus que le reste de
 * l'application ; les embarquer dans le paquet principal ferait payer à chaque
 * démarrage une connaissance dont on n'utilise qu'une part.
 *
 * `fondamentaux` est à part : il ne décrit aucun règlement, il décrit la
 * méthode d'analyse — biomécanique, distance, tempo, lecture. Il est pertinent
 * quelle que soit la discipline, et le mode « mixte » s'appuie dessus.
 */

const SOURCES = import.meta.glob<string>('./packs/*.md', { query: '?raw', import: 'default' });

export interface PackDef {
  slug: string;
  title: string;
  /** La discipline du schéma, ou '' pour un pack transverse. */
  discipline: string;
  summary: string;
}

export const PACKS: readonly PackDef[] = [
  {
    slug: 'fondamentaux',
    title: 'Fondamentaux — biomécanique, distance, tempo, lecture',
    discipline: '',
    summary:
      'La méthode d’analyse, indépendante du style : chaîne cinétique, gestion de la distance, tempo, boucle de décision, cadre de débriefing.',
  },
  {
    slug: 'kyokushin',
    title: 'Kyokushin — knockdown',
    discipline: 'Kyokushin',
    summary: 'Pas de poing au visage : le règlement fabrique une distance et une usure très particulières.',
  },
  {
    slug: 'kudo',
    title: 'Kudo — Daido Juku',
    discipline: 'Kudo',
    summary: 'Frappe complète sous casque, projections, et deux fenêtres de sol de trente secondes.',
  },
  {
    slug: 'karate',
    title: 'Karaté sportif — WKF',
    discipline: 'Karaté',
    summary: 'Contrôle et arrêt du combat : le point récompense la netteté et le timing, pas la puissance.',
  },
  {
    slug: 'boxe-anglaise',
    title: 'Boxe anglaise',
    discipline: 'Boxe anglaise',
    summary: 'Quatre poings, un buste, des jambes qui ne frappent pas : la densité tactique est dans le déplacement.',
  },
  {
    slug: 'kickboxing',
    title: 'Kickboxing — K-1',
    discipline: 'Kickboxing',
    summary: 'Poings et pieds, clinch limité : rythme haut, volume, et le low kick comme monnaie d’usure.',
  },
  {
    slug: 'muay-thai',
    title: 'Muay Thaï',
    discipline: 'Muay Thaï',
    summary: 'Coudes, genoux, clinch et teep : l’économie du round thaï récompense la dominance, pas le volume.',
  },
  {
    slug: 'mma',
    title: 'MMA',
    discipline: 'MMA',
    summary: 'Trois domaines et surtout les transitions entre eux, où se perdent la plupart des combats.',
  },
  {
    slug: 'bjj',
    title: 'Jiu-jitsu brésilien',
    discipline: 'Jiu-jitsu brésilien',
    summary: 'Hiérarchie des positions, cadres et leviers : le combat au sol est un problème de géométrie.',
  },
  {
    slug: 'judo',
    title: 'Judo',
    discipline: 'Judo',
    summary: 'Kumi-kata, kuzushi, tempo : la prise de garde décide du reste.',
  },
  {
    slug: 'lutte',
    title: 'Lutte',
    discipline: 'Lutte',
    summary: 'Niveaux, angles, enchaînements de pénétration : le contrôle avant la finition.',
  },
  {
    slug: 'taekwondo',
    title: 'Taekwondo — WT',
    discipline: 'Taekwondo',
    summary: 'Plastron électronique et barème : le règlement pousse les jambes très haut et très vite.',
  },
  {
    slug: 'savate',
    title: 'Savate boxe française',
    discipline: 'Savate',
    summary: 'Chaussures, touche marquée, jambes longues : précision et allonge avant puissance.',
  },
  {
    slug: 'sanda',
    title: 'Sanda',
    discipline: 'Sanda',
    summary: 'Frappe plus projections sur plateforme : la sortie de tapis est une arme.',
  },
  {
    slug: 'sambo',
    title: 'Sambo',
    discipline: 'Sambo',
    summary: 'Projections, clés de jambe, veste : une lutte à préhension avec sa propre carte des soumissions.',
  },
  {
    slug: 'krav-maga',
    title: 'Krav Maga',
    discipline: 'Krav Maga',
    summary: 'Hors compétition : contexte, désengagement, et la limite entre entraînement et réalité.',
  },
] as const;

export function packDef(slug: string): PackDef | undefined {
  return PACKS.find((p) => p.slug === slug);
}

/** Charge le markdown d'un pack. La requête réseau n'a lieu qu'ici. */
export async function loadPack(slug: string): Promise<string> {
  const loader = SOURCES[`./packs/${slug}.md`];
  if (!loader) throw new Error(`pack inconnu : ${slug}`);
  return await loader();
}
