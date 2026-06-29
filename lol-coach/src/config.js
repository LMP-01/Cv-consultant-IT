'use strict';

const fs = require('fs');
const path = require('path');

// Chargeur .env minimal (zéro dépendance). Les variables déjà présentes dans
// process.env ne sont jamais écrasées.
function loadDotEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  let raw;
  try {
    raw = fs.readFileSync(envPath, 'utf8');
  } catch {
    return; // pas de .env : on s'appuie sur l'environnement / les défauts
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // retire d'éventuels guillemets entourants
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv();

const argv = process.argv.slice(2);
const mockMode = argv.includes('--mock') || process.env.MOCK === '1';

function intEnv(name, fallback) {
  const v = parseInt(process.env[name], 10);
  return Number.isFinite(v) ? v : fallback;
}

// Langue de l'UI : variable DÉDIÉE (ne pas lire la variable POSIX `LANG`,
// qui contient la locale système, ex: en_US.UTF-8, et fausserait la détection).
const uiLang = (process.env.LANG_UI || process.env.COACH_LANG || 'fr').toLowerCase().startsWith('en') ? 'en' : 'fr';

const config = {
  port: intEnv('PORT', 3000),
  lang: uiLang,
  mockMode,

  ai: {
    // Backend : 'auto' (clé API si présente, sinon abonnement via Claude Code,
    // sinon règles), 'api', 'claude-code' (abonnement Max/Pro), 'rules'.
    provider: (process.env.AI_PROVIDER || 'auto').toLowerCase(),
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.CLAUDE_MODEL || 'claude-opus-4-8',
    // Modèle utilisé via Claude Code (abonnement). Sonnet 4.6 par défaut : bien
    // plus léger pour le quota et la latence en temps réel. Mets 'opus' si tu veux.
    claudeCodeModel: process.env.CLAUDE_CODE_MODEL || 'claude-sonnet-4-6',
    minIntervalSeconds: intEnv('AI_MIN_INTERVAL_SECONDS', 8),
    // Cadence minimale lors d'un moment "réactif" (mort, prise de risque,
    // objectif...). Plus courte que la cadence normale pour réagir vite, mais
    // garde un plancher pour ne pas saturer le quota Claude Max.
    reactiveFloorSeconds: intEnv('AI_REACTIVE_FLOOR_SECONDS', 4),
    get enabled() {
      return Boolean(this.apiKey);
    },
  },

  riot: {
    apiKey: process.env.RIOT_API_KEY || '',
    region: process.env.RIOT_REGION || 'europe',
    platform: process.env.RIOT_PLATFORM || 'euw1',
    get enabled() {
      return Boolean(this.apiKey);
    },
  },

  leaguePath: process.env.LEAGUE_PATH || '',
  ddragonLocale: process.env.DDRAGON_LOCALE || (uiLang === 'en' ? 'en_US' : 'fr_FR'),

  // Cadence des sondages (ms).
  pollIntervalInGameMs: intEnv('POLL_INGAME_MS', 1000),
  pollIntervalLobbyMs: intEnv('POLL_LOBBY_MS', 2000),

  // Démo : durée de la phase champ select avant de basculer en partie (s).
  mockChampSelectSeconds: intEnv('MOCK_CHAMPSELECT_SECONDS', 30),
};

module.exports = config;
