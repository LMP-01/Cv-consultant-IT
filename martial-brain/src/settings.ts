/**
 * Device-local preferences.
 *
 * Deliberately in localStorage rather than the SQLite graph: these are settings
 * for THIS device (which theme, which API keys, which server) and must not
 * travel to your other devices when the knowledge base syncs.
 */

import type { ProviderId } from './ai/providers';

const KEY = 'waza.settings';

/**
 * Le thème ne vit PAS ici — il vit dans `ui/prefs.ts`, avec le contraste et la
 * taille du texte.
 *
 * Il y a eu un temps deux réglages de thème, chacun posant `data-theme` sur
 * `<html>` de son côté. Deux sources de vérité pour une même question, c'est
 * une seule chose : un bug qui attend son heure — celui qui écrit en dernier
 * gagne, et l'autre écran affiche un état qui n'est plus vrai. Les réglages
 * d'affichage sont regroupés là où le script d'amorçage d'`index.html` les
 * lit, ce qui est aussi la seule façon de les appliquer sans clignotement.
 */

export interface Settings {
  /** Provider id → API key. Stays on this device; sent only to that provider. */
  aiKeys: Record<string, string>;
  /** Provider ids in fallback order. */
  aiOrder: ProviderId[];
  /** Chosen model per provider id. */
  aiModels: Record<string, string>;
  /** Model used for cheap, structured work (natural-language → filter). */
  aiFastModel: Record<string, string>;
  /**
   * Les modèles que CETTE clé a listés, par fournisseur.
   *
   * Sert au repli : quand le modèle choisi épuise son quota, le routeur essaie
   * les autres modèles du même fournisseur avant de changer de clé. Sans cette
   * liste il n'aurait rien à essayer — et changer de fournisseur pour un quota
   * de modèle épuisé, c'est abandonner une clé encore valable.
   */
  aiModelList: Record<string, string[]>;
  syncUrl: string;
  syncToken: string;
}

const DEFAULTS: Settings = {
  aiKeys: {},
  aiOrder: ['gemini', 'groq', 'mistral'],
  aiModels: {},
  aiFastModel: {},
  aiModelList: {},
  syncUrl: '',
  syncToken: '',
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const next = { ...loadSettings(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private browsing with storage disabled: settings simply don't persist.
  }
  return next;
}
