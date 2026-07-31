/**
 * Device-local preferences.
 *
 * Deliberately in localStorage rather than the SQLite graph: these are settings
 * for THIS device (which theme, which API keys, which server) and must not
 * travel to your other devices when the knowledge base syncs.
 */

import type { ProviderId } from './ai/providers';

const KEY = 'waza.settings';

export type ThemePref = 'system' | 'light' | 'dark';

export interface Settings {
  theme: ThemePref;
  /** Provider id → API key. Stays on this device; sent only to that provider. */
  aiKeys: Record<string, string>;
  /** Provider ids in fallback order. */
  aiOrder: ProviderId[];
  /** Chosen model per provider id. */
  aiModels: Record<string, string>;
  /** Model used for cheap, structured work (natural-language → filter). */
  aiFastModel: Record<string, string>;
  syncUrl: string;
  syncToken: string;
}

const DEFAULTS: Settings = {
  theme: 'system',
  aiKeys: {},
  aiOrder: ['gemini', 'groq', 'mistral'],
  aiModels: {},
  aiFastModel: {},
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
  applyTheme(next.theme);
  return next;
}

/** Stamp the root element so CSS (and the chart palette) follow the choice. */
export function applyTheme(pref: ThemePref): void {
  const root = document.documentElement;
  if (pref === 'system') delete root.dataset.theme;
  else root.dataset.theme = pref;
}
