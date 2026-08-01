/**
 * Icônes.
 *
 * Tracés au style Lucide (grille 24, trait 1,75, extrémités arrondies),
 * recopiés dans le dépôt plutôt qu'importés d'un paquet : `lucide-react`
 * pèse plusieurs centaines de kilo-octets et n'est pas secouable de façon
 * fiable derrière une table d'indirection comme celle-ci. Ici, chaque icône
 * réellement utilisée coûte une ligne de données.
 *
 * Règle du cahier des charges : « très simples, jamais d'illustrations
 * réalistes ». Une icône ne porte donc jamais seule une information — elle
 * accompagne toujours un libellé, sauf dans la barre supérieure où le bouton
 * porte un `aria-label`.
 */
import { createElement, type ReactNode, type SVGProps } from 'react';
import type { EntityKey } from '../domain/schema';

type Shape = readonly [string, Record<string, string | number>];

const p = (d: string): Shape => ['path', { d }];
const c = (cx: number, cy: number, r: number): Shape => ['circle', { cx, cy, r }];
const r_ = (x: number, y: number, w: number, h: number, rx = 2): Shape => [
  'rect',
  { x, y, width: w, height: h, rx },
];

const ICONS = {
  /* Navigation des modules */
  dashboard: [r_(3, 3, 7, 9, 1), r_(14, 3, 7, 5, 1), r_(14, 12, 7, 9, 1), r_(3, 16, 7, 5, 1)],
  technique: [p('M13 2 3 14h9l-1 8 10-12h-9l1-8z')],
  combo: [p('m6 17 5-5-5-5'), p('m13 17 5-5-5-5')],
  counter: [p('M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z')],
  situation: [
    p('M14.1 5.55a2 2 0 0 0 1.79 0l3.66-1.83A1 1 0 0 1 21 4.62v12.76a1 1 0 0 1-.55.9l-4.56 2.27a2 2 0 0 1-1.78 0l-4.22-2.1a2 2 0 0 0-1.78 0l-3.66 1.82A1 1 0 0 1 3 19.38V6.62a1 1 0 0 1 .55-.9l4.56-2.27a2 2 0 0 1 1.78 0z'),
    p('M15 5.76v15'),
    p('M9 3.24v15'),
  ],
  tactic: [c(12, 12, 10), c(12, 12, 6), c(12, 12, 2)],
  biomechanics: [p('M22 12h-2.5a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2')],
  read: [p('M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0'), c(12, 12, 3)],
  principle: [c(12, 12, 10), p('m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36z')],
  sparring: [p('M10 2h4'), p('m12 14 3-3'), c(12, 14, 8)],
  fight: [
    p('M6 9H4.5a2.5 2.5 0 0 1 0-5H6'),
    p('M18 9h1.5a2.5 2.5 0 0 0 0-5H18'),
    p('M4 22h16'),
    p('M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22'),
    p('M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22'),
    p('M18 2H6v7a6 6 0 0 0 12 0V2z'),
  ],
  hypothesis: [
    p('M14 2v6a2 2 0 0 0 .25.96l5.5 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.75-2.96l5.5-10.08A2 2 0 0 0 10 8V2'),
    p('M6.45 15h11.1'),
    p('M8.5 2h7'),
  ],
  error: [
    p('m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3'),
    p('M12 9v4'),
    p('M12 17h.01'),
  ],
  decision: [c(6, 6, 3), c(18, 6, 3), c(12, 18, 3), p('M18 9v2a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V9'), p('M12 12v3')],
  objective: [p('M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z'), p('M4 22v-7')],
  exercise: [p('m17 2 4 4-4 4'), p('M3 11v-1a4 4 0 0 1 4-4h14'), p('m7 22-4-4 4-4'), p('M21 13v1a4 4 0 0 1-4 4H3')],
  resource: [
    p('M12 7v14'),
    p('M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z'),
  ],

  /* Pages transverses */
  graph: [c(18, 5, 3), c(6, 12, 3), c(18, 19, 3), p('m8.59 13.51 6.83 3.98'), p('m15.41 6.51-6.82 3.98')],
  search: [c(11, 11, 8), p('m21 21-4.3-4.3')],
  analytics: [p('M3 3v16a2 2 0 0 0 2 2h16'), p('M18 17V9'), p('M13 17V5'), p('M8 17v-3')],
  timeline: [c(12, 12, 10), p('M12 6v6l4 2')],
  calendar: [p('M8 2v4'), p('M16 2v4'), r_(3, 4, 18, 18), p('M3 10h18')],
  settings: [p('M20 7h-9'), p('M14 17H5'), c(17, 17, 3), c(7, 7, 3)],

  /* Barre supérieure et actions */
  bell: [
    p('M10.27 21a2 2 0 0 0 3.46 0'),
    p('M3.26 15.33A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.67C19.41 13.96 18 12.5 18 8A6 6 0 0 0 6 8c0 4.5-1.41 5.96-2.74 7.33'),
  ],
  sun: [
    c(12, 12, 4),
    p('M12 2v2'),
    p('M12 20v2'),
    p('m4.93 4.93 1.41 1.41'),
    p('m17.66 17.66 1.41 1.41'),
    p('M2 12h2'),
    p('M20 12h2'),
    p('m6.34 17.66-1.41 1.41'),
    p('m19.07 4.93-1.41 1.41'),
  ],
  moon: [p('M20.99 12.49a9 9 0 1 1-9.48-9.48c.41-.02.62.46.4.8a6 6 0 0 0 8.27 8.27c.35-.21.83 0 .81.41')],
  user: [p('M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2'), c(12, 7, 4)],
  menu: [p('M4 6h16'), p('M4 12h16'), p('M4 18h16')],
  close: [p('M18 6 6 18'), p('m6 6 12 12')],
  plus: [p('M5 12h14'), p('M12 5v14')],
  check: [p('M20 6 9 17l-5-5')],
  copy: [r_(8, 8, 14, 14), p('M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2')],
  chevron: [p('m9 18 6-6-6-6')],
  arrow: [p('M5 12h14'), p('m12 5 7 7-7 7')],
  edit: [
    p('M21.17 6.81a1 1 0 0 0-3.98-3.98L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z'),
    p('m15 5 4 4'),
  ],
  trash: [p('M3 6h18'), p('M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6'), p('M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2')],
  link: [p('M9 17H7A5 5 0 0 1 7 7h2'), p('M15 7h2a5 5 0 1 1 0 10h-2'), p('M8 12h8')],
  media: [r_(3, 3, 18, 18), c(9, 9, 2), p('m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21')],
  video: [p('m16 13 5.22 3.15a.5.5 0 0 0 .78-.42V8.27a.5.5 0 0 0-.78-.42L16 11'), r_(2, 6, 14, 12)],
  file: [p('M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z'), p('M14 2v5h5'), p('M9 13h6'), p('M9 17h4')],
  refresh: [
    p('M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8'),
    p('M21 3v5h-5'),
    p('M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16'),
    p('M3 21v-5h5'),
  ],
  cloud: [p('M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9')],
  cloudOff: [
    p('m2 2 20 20'),
    p('M5.78 5.78A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.72-.34'),
    p('M21.66 15.5a4.5 4.5 0 0 0-4.16-6.5h-1.79a7 7 0 0 0-6.4-4.9'),
  ],
  text: [p('M4 7V4h16v3'), p('M9 20h6'), p('M12 4v16')],
  contrast: [c(12, 12, 10), p('M12 18a6 6 0 0 0 0-12z')],

  /* LUIS AI — un œil dans un viseur : observer, puis orienter. */
  luis: [c(12, 12, 3), c(12, 12, 8), p('M12 1v3'), p('M12 20v3'), p('M1 12h3'), p('M20 12h3')],

  /* Statuts — toujours accompagnés d'un mot */
  ok: [c(12, 12, 10), p('m9 12 2 2 4-4')],
  warn: [c(12, 12, 10), p('M12 8v4'), p('M12 16h.01')],
  bad: [c(12, 12, 10), p('m15 9-6 6'), p('m9 9 6 6')],
  info: [c(12, 12, 10), p('M12 16v-4'), p('M12 8h.01')],
} as const satisfies Record<string, readonly Shape[]>;

export type IconName = keyof typeof ICONS;

/**
 * Chaque module a son icône, et son nom d'icône EST sa clé de module.
 *
 * L'annotation de type ci-dessous n'est pas décorative : elle fait échouer la
 * compilation le jour où un module est ajouté au schéma sans icône. Un module
 * sans icône passerait inaperçu à la relecture et laisserait un trou dans la
 * barre latérale.
 */
export const moduleIcon: (key: EntityKey) => IconName = (key) => key;

interface Props extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 16, ...rest }: Props): ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {ICONS[name].map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs }))}
    </svg>
  );
}

/** Le logotype : deux traits croisés dans un cadre. Aucun cliché martial. */
export function Mark({ size = 20 }: { size?: number }): ReactNode {
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="var(--accent)" opacity="0.16" />
      <path
        d="M7 17 17 7M7 7l4.2 4.2M17 17l-2.6-2.6"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
