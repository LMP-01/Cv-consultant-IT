/**
 * Préférences d'affichage — thème, contraste, taille du texte.
 *
 * Le cahier des charges les classe sous « Accessibilité », et c'est bien de
 * cela qu'il s'agit : ce ne sont pas des options cosmétiques mais les réglages
 * qui rendent l'application utilisable au quotidien pendant des années, y
 * compris avec une vue fatiguée ou un écran mal calibré.
 *
 * Elles sont appliquées sur `<html>` par des attributs de données plutôt que
 * par des classes React, pour trois raisons : le CSS peut les combiner
 * (`sombre + contraste élevé` reste une combinaison valide), le réglage
 * survit à un rendu raté, et le script d'amorçage d'`index.html` peut les
 * poser avant le premier pixel — donc sans clignotement.
 */
export type ThemeChoice = 'system' | 'light' | 'dark';
export type ContrastChoice = 'normal' | 'high';

export interface Prefs {
  theme: ThemeChoice;
  contrast: ContrastChoice;
  /** Multiplicateur appliqué à toute la typographie. */
  fontScale: number;
}

export const FONT_SCALES = [0.9, 1, 1.15, 1.3] as const;

const KEY = 'combat-os.prefs';

/**
 * « Mode sombre par défaut », dit le cahier des charges — donc `dark`, et non
 * `system`. `system` reste proposé, mais c'est un choix que l'utilisateur fait,
 * pas celui qu'il subit.
 */
const DEFAULTS: Prefs = { theme: 'dark', contrast: 'normal', fontScale: 1 };

function read(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      theme:
        parsed.theme === 'light' || parsed.theme === 'dark' || parsed.theme === 'system'
          ? parsed.theme
          : DEFAULTS.theme,
      contrast: parsed.contrast === 'high' ? 'high' : 'normal',
      fontScale:
        typeof parsed.fontScale === 'number' && parsed.fontScale >= 0.8 && parsed.fontScale <= 1.6
          ? parsed.fontScale
          : DEFAULTS.fontScale,
    };
  } catch {
    // Stockage refusé (navigation privée verrouillée) : les valeurs par défaut
    // font parfaitement l'affaire, ce n'est pas une raison de ne pas démarrer.
    return DEFAULTS;
  }
}

let current: Prefs = read();
const listeners = new Set<() => void>();

export function applyPrefs(prefs: Prefs): void {
  const root = document.documentElement;

  /*
   * `system` est résolu ICI, et l'attribut est toujours posé.
   *
   * Laisser `data-theme` absent pour « système » serait un piège : la feuille
   * de style peint le mode sombre par défaut, mais le code qui choisit les
   * teintes de section interroge, lui, la préférence du système. Sur une
   * machine réglée en clair, on obtenait la palette claire peinte sur les
   * surfaces sombres — deux sources de vérité pour une seule question.
   */
  root.dataset.theme = resolvedTheme(prefs);

  if (prefs.contrast === 'high') root.dataset.contrast = 'high';
  else delete root.dataset.contrast;

  root.style.setProperty('--font-scale', String(prefs.fontScale));
}

export function getPrefs(): Prefs {
  return current;
}

export function setPrefs(patch: Partial<Prefs>): void {
  current = { ...current, ...patch };
  applyPrefs(current);
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Idem : le réglage reste actif pour la session, il ne survivra pas.
  }
  for (const listener of listeners) listener();
}

export function subscribePrefs(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Le thème effectivement peint, `system` résolu.
 *
 * Utile au bouton de la barre supérieure : il doit montrer ce vers quoi il
 * bascule, pas la valeur stockée.
 */
export function resolvedTheme(prefs: Prefs = current): 'light' | 'dark' {
  if (prefs.theme !== 'system') return prefs.theme;
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}

/**
 * Suivre le système quand — et seulement quand — l'utilisateur a choisi
 * « Auto ». Sans cela, basculer son ordinateur en mode nuit à 19 h ne
 * changerait rien tant que la page n'est pas rechargée.
 */
export function watchSystemTheme(): () => void {
  if (typeof matchMedia !== 'function') return () => undefined;
  const mq = matchMedia('(prefers-color-scheme: light)');
  const onChange = (): void => {
    if (current.theme === 'system') applyPrefs(current);
  };
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}
