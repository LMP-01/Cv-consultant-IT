'use strict';

/* Jeu d'icônes SVG (style ligne, thème sombre LoL) — remplace les emojis pour un
   rendu pro. Aucune dépendance : SVG inline, couleur héritée (currentColor).
   Usage HTML :  <span class="ic" data-ic="dragon"></span>
   Usage JS   :  iconSvg('dragon', 'ic-lg')   -> chaîne <svg…>                    */

const ICONS = {
  // marque / objectifs
  dragon: '<path d="M4 14c2 2 5 3 8 3s6-1 8-3"/><path d="M12 17v4"/><path d="M7 8c0-2 2-4 5-4s5 2 5 4c0 3-2 5-5 5S7 11 7 8Z"/><path d="M9 8h.01M15 8h.01"/>',
  baron: '<path d="M12 3l2 4 4 1-3 3 1 4-4-2-4 2 1-4-3-3 4-1 2-4Z"/>',
  herald: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  grubs: '<ellipse cx="12" cy="12" rx="5" ry="7"/><path d="M9 9h.01M15 9h.01M8 13h8"/>',
  // sections
  chat: '<path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2Z"/>',
  draft: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  dashboard: '<path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="6"/><rect x="12" y="7" width="3" height="10"/><rect x="17" y="13" width="3" height="4"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 13V9M9 2h6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  build: '<path d="M14.5 4.5 20 10l-9.5 9.5L5 14Z"/><path d="m14 7 3 3"/><path d="M5 14 3 21l7-2"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.4 12.4a1 1 0 0 0 1 .8H18a1 1 0 0 0 1-.8L21 7H6"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6 18.4 18.4"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
  shield: '<path d="M12 3 5 6v5c0 4 3 7 7 9 4-2 7-5 7-9V6Z"/>',
  swords: '<path d="M14.5 4.5 20 10 9 21l-2-2L14.5 4.5Z"/><path d="M3 4l5 5M4 14l-1 6 6-1"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2Z"/><path d="M19 17H6a2 2 0 0 0-2 2"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M17 7h4v4"/>',
  trendDown: '<path d="M3 7l6 6 4-4 8 8"/><path d="M17 17h4v-4"/>',
  gamepad: '<rect x="2" y="7" width="20" height="11" rx="4"/><path d="M7 11v3M5.5 12.5h3M15 12h.01M18 14h.01"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  volume: '<path d="M11 5 6 9H3v6h3l5 4Z"/><path d="M16 9a4 4 0 0 1 0 6"/>',
  volumeOff: '<path d="M11 5 6 9H3v6h3l5 4Z"/><path d="m22 9-6 6M16 9l6 6"/>',
  maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M3 16v3a2 2 0 0 0 2 2h3"/>',
  minimize: '<path d="M8 3v3a2 2 0 0 1-2 2H3M16 3v3a2 2 0 0 0 2 2h3M21 16h-3a2 2 0 0 0-2 2v3M3 16h3a2 2 0 0 1 2 2v3"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  map: '<path d="m9 4 6 2 6-2v14l-6 2-6-2-6 2V6Z"/><path d="M9 4v14M15 6v14"/>',
  alert: '<path d="M12 3 2 20h20Z"/><path d="M12 10v4M12 17h.01"/>',
  star: '<path d="m12 3 2.7 5.5 6 .9-4.3 4.2 1 6L12 17l-5.4 2.6 1-6L3.3 9.4l6-.9Z"/>',
  dot: '<circle cx="12" cy="12" r="7"/>',
  tree: '<path d="M12 22v-5M8 13a4 4 0 0 1-1-8 5 5 0 0 1 10 0 4 4 0 0 1-1 8Z"/>',
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
  check: '<path d="M4 12.5 9 17.5 20 6.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6Z"/>',
  trophy: '<path d="M7 4h10v4a5 5 0 0 1-10 0Z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M9 16h6M10 20h4M12 13v3"/>',
  repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  bulb: '<path d="M9 18h6M10 22h4M12 2a6 6 0 0 1 4 10c-1 1-1 2-1 3H9c0-1 0-2-1-3a6 6 0 0 1 4-10Z"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  hand: '<path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8a7 7 0 0 0 7 7h1a6 6 0 0 0 6-6v-3a2 2 0 0 0-4 0"/>',
  pause: '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>',
  sparkles: '<path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8Z"/><path d="M19 14l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9Z"/>',
  gold: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M9.5 9.5a2.5 2.5 0 0 1 5 0c0 2.5-5 1.5-5 4a2.5 2.5 0 0 0 5 0"/>',
  flame: '<path d="M12 22c4 0 7-3 7-7 0-4-3-6-4-9-2 2-3 3-3 5-1-1-1-2-1-4-2 2-3 4-3 7 0 5 3 8 7 8Z"/>',
};

function iconSvg(name, cls) {
  const body = ICONS[name];
  if (!body) return '';
  return `<svg class="ic ${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

// Remplit tous les <… data-ic="name"> de la page par l'icône correspondante.
function hydrateIcons(root) {
  (root || document).querySelectorAll('[data-ic]').forEach((el) => {
    if (el.dataset.icDone) return;
    el.innerHTML = iconSvg(el.dataset.ic, el.dataset.icClass || '');
    el.dataset.icDone = '1';
  });
}

if (typeof window !== 'undefined') {
  window.iconSvg = iconSvg;
  window.hydrateIcons = hydrateIcons;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => hydrateIcons());
  else hydrateIcons();
}
