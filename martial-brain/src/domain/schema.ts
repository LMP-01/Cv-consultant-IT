/**
 * The 15 module descriptors — the heart of the application.
 *
 * Every module of §4 of the cahier des charges is described here as data, and
 * the generic UI (EntityList / EntityDetail / EntityForm) renders itself from
 * these descriptors. Writing a new module — the nutrition / blessures /
 * préparation physique extensions of §6 — means adding a descriptor, not
 * writing screens.
 *
 * "Historique" is deliberately NOT a stored field anywhere. A technique's
 * history is the set of sparrings and fights that reference it, which the graph
 * already knows; the detail view derives it. That is §2.3 taken literally: a
 * fiche recaps everything pointing at it, rather than duplicating it by hand.
 */

export type EntityKey =
  | 'principle'
  | 'technique'
  | 'combo'
  | 'counter'
  | 'tactic'
  | 'situation'
  | 'biomechanics'
  | 'read'
  | 'sparring'
  | 'fight'
  | 'hypothesis'
  | 'resource'
  | 'objective'
  | 'exercise'
  | 'error';

export type SectionKey = 'arsenal' | 'strategy' | 'journal' | 'progress' | 'resources';

export type FieldType =
  | 'text'
  | 'longtext'
  | 'select'
  | 'multiselect'
  | 'number'
  | 'percent'
  | 'date'
  | 'tags'
  | 'url'
  | 'sequence';

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  options?: readonly string[];
  placeholder?: string;
  help?: string;
  /** Feed this field into the FTS index. Defaults to true for text-ish types. */
  searchable?: boolean;
  /** Show as a column in the list view. */
  inList?: boolean;
}

export interface EntityDef {
  key: EntityKey;
  /** ID prefix per §2.2. `resource` derives its prefix from the `kind` field. */
  prefix: string;
  prefixByField?: { field: string; map: Readonly<Record<string, string>> };
  label: string;
  plural: string;
  section: SectionKey;
  /** What the free-text title means for this module. */
  titleLabel: string;
  titlePlaceholder?: string;
  fields: readonly FieldDef[];
  /** Modules this one is typically linked to (§4 "Relations"). */
  relations: readonly EntityKey[];
  /** Reference back to the cahier des charges. */
  spec: string;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Sections — also the categorical palette.
 *
 * Colour is assigned per SECTION (5 groups), never per type (15): a categorical
 * palette cannot carry 15 identities, and a knowledge graph is an "all-pairs"
 * form where any two nodes can end up adjacent. The four chromatic slots below
 * were selected by running the palette validator over every 5-, 4- and 3-hue
 * combination of the reference ramps under `--pairs all` in BOTH modes. No
 * 5-hue set passes (magenta↔orange lands at normal-vision ΔE 12.9, under the
 * hard floor of 15); exactly two 4-hue sets do. This is one of them, with
 * `resources` folded to neutral grey — external references are genuinely the
 * "Other" category here, so the fold is semantic, not a workaround.
 *
 * Two WARNs came back and both are discharged by the node rendering:
 *   · light-mode contrast (yellow 2.09, magenta 2.60 vs 3:1) → relief rule:
 *     every node is drawn with its visible code label.
 *   · dark-mode CVD (green↔yellow ΔE 6.9, the 6–8 band) → secondary encoding:
 *     every section also has its own node shape.
 * Identity is therefore encoded three times over: hue, shape, and the code
 * prefix in the label. Do not remove the labels or shapes to "clean up" the
 * graph — they are what make the palette legal.
 * ──────────────────────────────────────────────────────────────────────────── */

export type NodeShape = 'circle' | 'diamond' | 'square' | 'triangle' | 'hexagon';

export interface SectionDef {
  key: SectionKey;
  label: string;
  /** Validated categorical slot, light surface #fbfbfa. */
  light: string;
  /** Same hue re-stepped for the dark surface #12161c. */
  dark: string;
  shape: NodeShape;
}

export const SECTIONS: readonly SectionDef[] = [
  { key: 'arsenal', label: 'Bibliothèque de combat', light: '#2a78d6', dark: '#3987e5', shape: 'circle' },
  { key: 'strategy', label: 'Stratégie', light: '#008300', dark: '#008300', shape: 'diamond' },
  { key: 'journal', label: 'Journal', light: '#e87ba4', dark: '#d55181', shape: 'square' },
  { key: 'progress', label: 'Progression', light: '#eda100', dark: '#c98500', shape: 'triangle' },
  { key: 'resources', label: 'Ressources', light: '#898781', dark: '#898781', shape: 'hexagon' },
] as const;

export function section(key: SectionKey): SectionDef {
  const found = SECTIONS.find((s) => s.key === key);
  if (!found) throw new Error(`unknown section: ${key}`);
  return found;
}

/* ── Shared vocabularies ──────────────────────────────────────────────────── */

/** §1 — discipline-agnostic by design; the list is open-ended via "Autre". */
export const DISCIPLINES = [
  'Kyokushin',
  'Kudo',
  'Karaté',
  'Taekwondo',
  'Boxe anglaise',
  'Kickboxing',
  'Muay Thaï',
  'Savate',
  'MMA',
  'Judo',
  'Jiu-jitsu brésilien',
  'Lutte',
  'Sambo',
  'Sanda',
  'Krav Maga',
  'Autre',
] as const;

export const DISTANCES = [
  'Corps à corps / Clinch',
  'Courte',
  'Moyenne',
  'Longue',
  'Très longue',
  'Sol',
] as const;

export const GUARDS = [
  'Orthodoxe',
  'Southpaw',
  'Carrée',
  'Garde basse',
  'Garde haute',
  'Garde fermée',
  'Indifférent',
] as const;

export const SIDES = ['Avant', 'Arrière', 'Gauche', 'Droite', 'Les deux'] as const;

export const FAMILIES = [
  'Poing',
  'Pied',
  'Genou',
  'Coude',
  'Tête',
  'Projection',
  'Balayage',
  'Soumission',
  'Contrôle / Clinch',
  'Déplacement',
  'Défense',
  'Sol',
] as const;

export const TECHNIQUE_TYPES = [
  'Offensive',
  'Défensive',
  'Contre',
  'Feinte',
  'Préparation',
  'Transition',
] as const;

export const RESULTS = [
  'Victoire',
  'Défaite',
  'Nul',
  'Sans décision',
  'Non comptabilisé',
] as const;

export const HORIZONS = ['Court terme', 'Moyen terme', 'Long terme'] as const;

export const OBJECTIVE_STATUS = ['À faire', 'En cours', 'Atteint', 'Abandonné'] as const;

export const VALIDATIONS = [
  'Non testée',
  'En cours de test',
  'Validée',
  'Invalidée',
  'Partiellement validée',
] as const;

/**
 * §2.2 groups the library under five prefixes; §4.12 additionally lists "jeux
 * vidéo" with no prefix assigned, so JV is introduced here. One module with a
 * kind rather than six near-identical modules.
 */
export const RESOURCE_KINDS = {
  Article: 'AR',
  Livre: 'BK',
  Vidéo: 'V',
  Stage: 'ST',
  Podcast: 'PD',
  'Jeu vidéo': 'JV',
} as const;

/* ── Field fragments reused across modules ────────────────────────────────── */

const TAGS: FieldDef = { name: 'tags', label: 'Tags', type: 'tags' };
const NOTES: FieldDef = { name: 'notes', label: 'Commentaires', type: 'longtext' };
const OBJECTIVE: FieldDef = {
  name: 'objectif',
  label: 'Objectif',
  type: 'longtext',
  placeholder: 'Ce que la chose cherche à provoquer',
};
const RISKS: FieldDef = { name: 'risques', label: 'Risques', type: 'longtext' };
const VARIANTS: FieldDef = { name: 'variantes', label: 'Variantes', type: 'longtext' };

/** Fields shared by sparrings (§4.9) and official fights, which extend them. */
const BOUT_FIELDS: readonly FieldDef[] = [
  { name: 'date', label: 'Date', type: 'date', inList: true },
  { name: 'lieu', label: 'Lieu', type: 'text' },
  { name: 'discipline', label: 'Discipline', type: 'select', options: DISCIPLINES, inList: true },
  { name: 'adversaire', label: 'Adversaire', type: 'text' },
  { name: 'poids', label: 'Poids (kg)', type: 'number', searchable: false },
  { name: 'grade', label: 'Grade', type: 'text' },
  { name: 'style', label: "Style de l'adversaire", type: 'longtext' },
  { name: 'duree', label: 'Durée (min)', type: 'number', searchable: false },
  { name: 'resultat', label: 'Résultat', type: 'select', options: RESULTS, inList: true },
  { name: 'lecons', label: 'Leçons', type: 'longtext' },
];

/* ── The 15 modules ───────────────────────────────────────────────────────── */

export const ENTITY_DEFS: readonly EntityDef[] = [
  /* §4.2 */
  {
    key: 'technique',
    prefix: 'K',
    label: 'Technique',
    plural: 'Techniques',
    section: 'arsenal',
    titleLabel: 'Nom',
    titlePlaceholder: 'Mae Geri, Jab, O Soto Gari…',
    spec: '§4.2',
    fields: [
      { name: 'discipline', label: 'Discipline', type: 'select', options: DISCIPLINES, inList: true },
      { name: 'famille', label: 'Famille', type: 'select', options: FAMILIES, inList: true },
      { name: 'distance', label: 'Distance', type: 'select', options: DISTANCES, inList: true },
      { name: 'garde', label: 'Garde', type: 'select', options: GUARDS },
      { name: 'cote', label: 'Côté', type: 'select', options: SIDES },
      { name: 'type', label: 'Type', type: 'select', options: TECHNIQUE_TYPES },
      { name: 'description', label: 'Description', type: 'longtext' },
      OBJECTIVE,
      { name: 'applications', label: 'Applications', type: 'longtext' },
      TAGS,
      NOTES,
    ],
    relations: ['principle', 'biomechanics', 'combo', 'counter', 'situation', 'exercise', 'error'],
  },

  /* §4.3 */
  {
    key: 'combo',
    prefix: 'A',
    label: 'Combinaison',
    plural: 'Combinaisons offensives',
    section: 'arsenal',
    titleLabel: 'Nom',
    titlePlaceholder: 'Jab → Low kick',
    spec: '§4.3',
    fields: [
      OBJECTIVE,
      { name: 'declencheur', label: 'Déclencheur', type: 'longtext', help: 'Ce qui ouvre la séquence' },
      { name: 'distance', label: 'Distance', type: 'select', options: DISTANCES, inList: true },
      { name: 'sequence', label: 'Séquence', type: 'sequence', help: 'Un coup par ligne, dans l’ordre' },
      { name: 'branches', label: 'Branches', type: 'longtext', help: 'Ce que devient la séquence selon la réaction' },
      VARIANTS,
      RISKS,
      { name: 'reussite', label: 'Probabilité de réussite (%)', type: 'percent', searchable: false, inList: true },
      TAGS,
      NOTES,
    ],
    relations: ['technique', 'counter', 'situation', 'tactic', 'principle'],
  },

  /* §4.4 */
  {
    key: 'counter',
    prefix: 'C',
    label: 'Contre',
    plural: 'Contres',
    section: 'arsenal',
    titleLabel: 'Nom',
    titlePlaceholder: 'Check → Mae Geri',
    spec: '§4.4',
    fields: [
      { name: 'attaque', label: 'Attaque adverse', type: 'text', inList: true },
      { name: 'reponse', label: 'Réponse', type: 'longtext' },
      { name: 'timing', label: 'Timing', type: 'longtext' },
      { name: 'distance', label: 'Distance', type: 'select', options: DISTANCES, inList: true },
      OBJECTIVE,
      RISKS,
      VARIANTS,
      { name: 'reussite', label: 'Taux de réussite (%)', type: 'percent', searchable: false, inList: true },
      TAGS,
      NOTES,
    ],
    relations: ['technique', 'situation', 'combo', 'principle'],
  },

  /* §4.7 */
  {
    key: 'biomechanics',
    prefix: 'B',
    label: 'Biomécanique',
    plural: 'Biomécanique',
    section: 'arsenal',
    titleLabel: 'Intitulé',
    titlePlaceholder: 'Chaîne cinétique du direct',
    spec: '§4.7',
    fields: [
      { name: 'description', label: 'Description', type: 'longtext' },
      { name: 'chaine', label: 'Chaîne cinétique', type: 'longtext' },
      { name: 'appuis', label: 'Appuis', type: 'longtext' },
      { name: 'rotation', label: 'Rotation', type: 'longtext' },
      { name: 'equilibre', label: 'Équilibre', type: 'longtext' },
      { name: 'erreurs', label: 'Erreurs', type: 'longtext' },
      { name: 'corrections', label: 'Corrections', type: 'longtext' },
      TAGS,
      NOTES,
    ],
    relations: ['technique', 'error', 'exercise'],
  },

  /* §4.5 */
  {
    key: 'tactic',
    prefix: 'T',
    label: 'Tactique',
    plural: 'Tactiques',
    section: 'strategy',
    titleLabel: 'Nom',
    titlePlaceholder: 'Créer une réaction, Faire avancer, Piéger…',
    spec: '§4.5',
    fields: [
      { name: 'description', label: 'Description', type: 'longtext' },
      OBJECTIVE,
      { name: 'applications', label: 'Applications', type: 'longtext' },
      TAGS,
      NOTES,
    ],
    relations: ['situation', 'technique', 'combo', 'principle'],
  },

  /* §4.6 */
  {
    key: 'situation',
    prefix: 'S',
    label: 'Situation',
    plural: 'Situations',
    section: 'strategy',
    titleLabel: 'Intitulé',
    titlePlaceholder: 'Adversaire très agressif, Coin du tatami…',
    spec: '§4.6',
    fields: [
      { name: 'description', label: 'Description', type: 'longtext' },
      OBJECTIVE,
      TAGS,
      NOTES,
    ],
    relations: ['technique', 'combo', 'counter', 'tactic'],
  },

  /* §4.8 */
  {
    key: 'read',
    prefix: 'L',
    label: 'Lecture adverse',
    plural: 'Lecture adverse',
    section: 'strategy',
    titleLabel: 'Signal observé',
    titlePlaceholder: 'Baisse la main avant de kicker',
    spec: '§4.8',
    fields: [
      { name: 'hypothese', label: 'Hypothèse', type: 'longtext' },
      { name: 'reponse', label: 'Réponse recommandée', type: 'longtext' },
      {
        name: 'confiance',
        label: 'Indice de confiance (%)',
        type: 'percent',
        searchable: false,
        inList: true,
      },
      TAGS,
      NOTES,
    ],
    relations: ['sparring', 'fight', 'technique', 'counter', 'situation'],
  },

  /* §4.11 */
  {
    key: 'principle',
    prefix: 'PR',
    label: 'Principe',
    plural: 'Principes',
    section: 'strategy',
    titleLabel: 'Énoncé',
    titlePlaceholder: 'La simplicité résiste mieux à la fatigue',
    spec: '§4.11',
    fields: [
      { name: 'description', label: 'Développement', type: 'longtext' },
      { name: 'origine', label: 'Origine', type: 'text', help: 'Qui / quoi t’a amené là' },
      TAGS,
      NOTES,
    ],
    relations: ['technique', 'combo', 'counter', 'tactic', 'situation', 'sparring', 'fight'],
  },

  /* §4.9 */
  {
    key: 'sparring',
    prefix: 'R',
    label: 'Sparring',
    plural: 'Sparrings',
    section: 'journal',
    titleLabel: 'Intitulé',
    titlePlaceholder: 'Séance du 15/10',
    spec: '§4.9',
    fields: [...BOUT_FIELDS, TAGS, NOTES],
    relations: ['technique', 'combo', 'counter', 'error', 'hypothesis', 'objective', 'read', 'principle'],
  },

  /* §4.9 — official fight: the sparring sheet plus the competition-only parts */
  {
    key: 'fight',
    prefix: 'F',
    label: 'Combat officiel',
    plural: 'Combats officiels',
    section: 'journal',
    titleLabel: 'Intitulé',
    titlePlaceholder: 'Championnat régional',
    spec: '§4.9',
    fields: [
      ...BOUT_FIELDS,
      { name: 'preparation', label: 'Préparation', type: 'longtext' },
      { name: 'pesee', label: 'Pesée', type: 'longtext' },
      { name: 'echauffement', label: 'Échauffement', type: 'longtext' },
      { name: 'stress', label: 'Gestion du stress', type: 'longtext' },
      { name: 'analyse', label: 'Analyse détaillée', type: 'longtext' },
      { name: 'arbitrage', label: 'Décisions arbitrales', type: 'longtext' },
      TAGS,
      NOTES,
    ],
    relations: ['technique', 'combo', 'counter', 'error', 'hypothesis', 'objective', 'read', 'principle'],
  },

  /* §4.10 */
  {
    key: 'hypothesis',
    prefix: 'H',
    label: 'Hypothèse',
    plural: 'Hypothèses',
    section: 'journal',
    titleLabel: 'Question',
    titlePlaceholder: 'Tester le switch avant Mae Geri',
    spec: '§4.10',
    fields: [
      { name: 'pourquoi', label: 'Pourquoi', type: 'longtext' },
      { name: 'experience', label: 'Expérience prévue', type: 'longtext' },
      { name: 'resultat', label: 'Résultat', type: 'longtext' },
      { name: 'validation', label: 'Validation', type: 'select', options: VALIDATIONS, inList: true },
      { name: 'date', label: 'Date', type: 'date', inList: true },
      { name: 'conclusion', label: 'Conclusion', type: 'longtext' },
      TAGS,
    ],
    relations: ['sparring', 'fight', 'technique', 'combo', 'counter', 'principle'],
  },

  /* §4.15 */
  {
    key: 'error',
    prefix: 'ER',
    label: 'Erreur technique',
    plural: 'Erreurs techniques',
    section: 'journal',
    titleLabel: 'Intitulé',
    titlePlaceholder: 'Armement trop lent du genou',
    spec: '§4.15',
    fields: [
      { name: 'description', label: 'Description', type: 'longtext' },
      { name: 'cause', label: 'Cause', type: 'longtext' },
      { name: 'correction', label: 'Correction', type: 'longtext' },
      TAGS,
      NOTES,
    ],
    relations: ['technique', 'biomechanics', 'exercise', 'sparring', 'fight'],
  },

  /* §4.13 */
  {
    key: 'objective',
    prefix: 'O',
    label: 'Objectif',
    plural: 'Objectifs',
    section: 'progress',
    titleLabel: 'Intitulé',
    titlePlaceholder: 'Améliorer la défense en garde basse',
    spec: '§4.13',
    fields: [
      { name: 'horizon', label: 'Horizon', type: 'select', options: HORIZONS, inList: true },
      { name: 'echeance', label: 'Échéance', type: 'date', inList: true },
      { name: 'progression', label: 'Progression (%)', type: 'percent', searchable: false, inList: true },
      { name: 'statut', label: 'Statut', type: 'select', options: OBJECTIVE_STATUS, inList: true },
      NOTES,
      TAGS,
    ],
    relations: ['technique', 'combo', 'counter', 'exercise', 'error', 'sparring', 'fight'],
  },

  /* §4.14 */
  {
    key: 'exercise',
    prefix: 'E',
    label: 'Exercice',
    plural: 'Exercices',
    section: 'progress',
    titleLabel: 'Nom',
    titlePlaceholder: 'Thème : contre sur jab',
    spec: '§4.14',
    fields: [
      OBJECTIVE,
      { name: 'materiel', label: 'Matériel', type: 'text' },
      { name: 'description', label: 'Description', type: 'longtext' },
      { name: 'progression', label: 'Progression', type: 'longtext' },
      TAGS,
      NOTES,
    ],
    relations: ['technique', 'tactic', 'situation', 'error', 'objective'],
  },

  /* §4.12 */
  {
    key: 'resource',
    prefix: 'AR',
    prefixByField: { field: 'kind', map: RESOURCE_KINDS },
    label: 'Ressource',
    plural: 'Bibliothèque',
    section: 'resources',
    titleLabel: 'Titre',
    titlePlaceholder: 'Analyse vidéo MMA',
    spec: '§4.12',
    fields: [
      {
        name: 'kind',
        label: 'Type',
        type: 'select',
        options: Object.keys(RESOURCE_KINDS),
        inList: true,
        help: 'Détermine le préfixe : AR, BK, V, ST, PD, JV',
      },
      { name: 'auteur', label: 'Auteur / source', type: 'text', inList: true },
      { name: 'url', label: 'Lien', type: 'url', searchable: false },
      { name: 'resume', label: 'Résumé', type: 'longtext' },
      { name: 'aRetenir', label: 'À retenir', type: 'longtext' },
      TAGS,
      NOTES,
    ],
    relations: ['technique', 'principle', 'situation', 'combo', 'counter', 'tactic'],
  },
] as const;

/* ── Lookups ──────────────────────────────────────────────────────────────── */

const BY_KEY = new Map<EntityKey, EntityDef>(ENTITY_DEFS.map((d) => [d.key, d]));

export function entityDef(key: EntityKey): EntityDef {
  const def = BY_KEY.get(key);
  if (!def) throw new Error(`unknown entity type: ${key}`);
  return def;
}

export function isEntityKey(value: string): value is EntityKey {
  return BY_KEY.has(value as EntityKey);
}

/** Modules of a section, in declaration order. */
export function defsInSection(key: SectionKey): EntityDef[] {
  return ENTITY_DEFS.filter((d) => d.section === key);
}

/** Every prefix a module can mint, for code parsing. */
export function prefixesOf(def: EntityDef): string[] {
  return def.prefixByField ? Object.values(def.prefixByField.map) : [def.prefix];
}

/** The prefix a record should carry, honouring `resource`'s kind field. */
export function prefixFor(def: EntityDef, data: Record<string, unknown>): string {
  if (!def.prefixByField) return def.prefix;
  const value = data[def.prefixByField.field];
  return (typeof value === 'string' ? def.prefixByField.map[value] : undefined) ?? def.prefix;
}

/** Reverse lookup: which module owns a code prefix (longest match first). */
export function defForPrefix(prefix: string): EntityDef | undefined {
  return ENTITY_DEFS.find((d) => prefixesOf(d).includes(prefix));
}
