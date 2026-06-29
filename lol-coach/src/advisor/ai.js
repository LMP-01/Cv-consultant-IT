'use strict';

const { spawn } = require('child_process');
const config = require('../config');

// Schéma de sortie structuré : on demande au modèle un JSON strict de conseils.
const TIPS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['tips'],
  properties: {
    tips: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'message', 'priority'],
        properties: {
          title: { type: 'string' },
          message: { type: 'string' },
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
      },
    },
  },
};

const SYSTEM_PROMPT_FR = `Tu es un coach professionnel de League of Legends qui assiste un joueur EN TEMPS RÉEL pendant sa partie.
On te donne un instantané JSON de l'état du jeu (temps, ton champion, scores, objectifs à venir, composition adverse, et des conseils déjà détectés par un moteur de règles).
Donne 1 à 3 conseils COURTS, concrets et actionnables, comme le ferait un coach de haut niveau : macro (objectifs, vision, rotations, timings), micro (trades, positionnement, power spikes), et décisions (recall, contestation, repli).
Règles:
- Priorise le conseil le plus important en premier.
- Sois spécifique au contexte (utilise les chiffres fournis). Évite les généralités vagues.
- N'invente pas de données absentes de l'instantané.
- Ne répète pas mot pour mot les conseils déjà fournis par le moteur de règles : complète-les ou apporte une perspective de plus haut niveau.
- "priority" doit valoir exactement "high", "medium" ou "low".
- Réponds UNIQUEMENT avec un objet JSON {"tips":[{"title","message","priority"}]}, en français, sans aucun texte autour.`;

const SYSTEM_PROMPT_EN = `You are a professional League of Legends coach assisting a player in REAL TIME during their game.
You receive a JSON snapshot of the game state (time, your champion, scores, upcoming objectives, enemy composition, and tips already detected by a rules engine).
Give 1 to 3 SHORT, concrete, actionable tips like a high-level coach would: macro (objectives, vision, rotations, timings), micro (trades, positioning, power spikes), and decisions (recall, contest, disengage).
Rules:
- Put the single most important tip first.
- Be context-specific (use the provided numbers). Avoid vague generalities.
- Do not invent data not present in the snapshot.
- Do not repeat the rules-engine tips verbatim: complement them or add a higher-level perspective.
- "priority" must be exactly "high", "medium" or "low".
- Reply ONLY with a JSON object {"tips":[{"title","message","priority"}]}, in English, with no surrounding text.`;

// Normalise la priorité vers high|medium|low (les modèles renvoient parfois
// 1/2/3 ou des libellés FR/EN selon le backend).
function normalizePriority(p) {
  const s = String(p == null ? '' : p).toLowerCase().trim();
  if (['high', 'haute', 'élevé', 'eleve', 'elevee', '1'].includes(s)) return 'high';
  if (['low', 'basse', 'faible', '3'].includes(s)) return 'low';
  return 'medium';
}

// Parse robuste : tente JSON direct, sinon extrait le 1er objet {...} du texte.
function parseTips(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

// ── Backend 1 : API Anthropic (clé ANTHROPIC_API_KEY) ───────────────────────
class ApiBackend {
  constructor() {
    this.label = `API Claude (${config.ai.model})`;
    try {
      const Anthropic = require('@anthropic-ai/sdk');
      this.client = new Anthropic({ apiKey: config.ai.apiKey });
    } catch {
      this.client = null;
      this.initError = 'SDK @anthropic-ai/sdk non installé (npm install).';
    }
  }

  get available() {
    return Boolean(this.client);
  }

  async generate(systemText, userText) {
    const msg = await this.client.messages.create({
      model: config.ai.model,
      max_tokens: 700,
      system: [{ type: 'text', text: systemText, cache_control: { type: 'ephemeral' } }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: TIPS_SCHEMA } },
      messages: [{ role: 'user', content: userText }],
    });
    const block = (msg.content || []).find((b) => b.type === 'text');
    return block ? block.text : null;
  }
}

// ── Backend 2 : Claude Code (abonnement Claude Max/Pro, sans clé API) ────────
// On appelle la CLI locale `claude` en mode headless. L'authentification utilise
// ton abonnement (login Claude Code ou token `claude setup-token`).
class ClaudeCodeBackend {
  constructor() {
    this.model = config.ai.claudeCodeModel;
    this.label = `Claude Code / abonnement (${this.model})`;
    this.detected = false;
  }

  get available() {
    return this.detected;
  }

  // Détecte la présence de la CLI `claude`.
  async detect() {
    this.detected = await this._run(['--version'], null, 8000)
      .then((r) => r !== null)
      .catch(() => false);
    return this.detected;
  }

  // Exécute `claude` ; prompt passé via stdin pour éviter tout souci d'échappement.
  _run(args, stdinText, timeoutMs) {
    return new Promise((resolve) => {
      // On retire ANTHROPIC_API_KEY pour forcer l'usage de l'abonnement.
      const env = { ...process.env };
      delete env.ANTHROPIC_API_KEY;
      let child;
      try {
        child = spawn('claude', args, { env, shell: process.platform === 'win32' });
      } catch {
        return resolve(null);
      }
      let out = '';
      let done = false;
      const finish = (val) => {
        if (done) return;
        done = true;
        resolve(val);
      };
      const timer = setTimeout(() => {
        try {
          child.kill();
        } catch {
          /* ignore */
        }
        finish(null);
      }, timeoutMs);

      child.stdout.on('data', (d) => (out += d));
      child.on('error', () => {
        clearTimeout(timer);
        finish(null);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        finish(code === 0 ? out : null);
      });

      if (stdinText != null) {
        try {
          child.stdin.write(stdinText);
          child.stdin.end();
        } catch {
          /* le timeout/erreur gérera */
        }
      } else if (child.stdin) {
        child.stdin.end();
      }
    });
  }

  async generate(systemText, userText) {
    // Claude Code conserve son prompt système ; on injecte nos instructions
    // dans le prompt utilisateur (envoyé via stdin).
    const prompt = `${systemText}\n\n=== ÉTAT DE JEU (JSON) ===\n${userText}`;
    const args = ['-p', '--output-format', 'json'];
    if (this.model) args.push('--model', this.model);
    const raw = await this._run(args, prompt, 30000);
    if (!raw) return null;
    // En --output-format json, la CLI renvoie une enveloppe {result, ...}.
    try {
      const env = JSON.parse(raw);
      if (typeof env.result === 'string') return env.result;
    } catch {
      /* pas du JSON enveloppe : on tente le texte brut */
    }
    return raw;
  }
}

// ── Façade : choisit le backend selon la config et l'environnement ──────────
class AiAdvisor {
  constructor() {
    this.backend = null;
    this.disabledReason = 'détection…';
    this.lastCallTs = 0;
    this.inFlight = false;
    this.warned = false;
  }

  get system() {
    return config.lang === 'en' ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT_FR;
  }

  get available() {
    return Boolean(this.backend && this.backend.available);
  }

  // Résolution du backend (asynchrone car la détection de la CLI l'est).
  async init() {
    const provider = (config.ai.provider || 'auto').toLowerCase();
    const hasApi = config.ai.enabled;
    const api = hasApi ? new ApiBackend() : null;
    const cc = new ClaudeCodeBackend();

    const tryClaudeCode = async () => {
      await cc.detect();
      return cc.available ? cc : null;
    };

    if (provider === 'rules') {
      this.backend = null;
      this.disabledReason = 'Mode règles forcé (AI_PROVIDER=rules).';
    } else if (provider === 'api') {
      this.backend = api && api.available ? api : null;
      if (!this.backend) this.disabledReason = api ? api.initError || 'SDK manquant.' : 'Aucune clé ANTHROPIC_API_KEY.';
    } else if (provider === 'claude-code' || provider === 'claudecode' || provider === 'max') {
      this.backend = await tryClaudeCode();
      if (!this.backend) this.disabledReason = "CLI `claude` introuvable. Installe Claude Code et connecte ton abonnement.";
    } else {
      // auto : si une clé API est fournie on la privilégie ; sinon l'abonnement
      // via Claude Code ; sinon le moteur de règles.
      if (api && api.available) this.backend = api;
      else this.backend = await tryClaudeCode();
      if (!this.backend) this.disabledReason = 'Ni clé API, ni CLI Claude Code détectées — moteur de règles.';
    }

    if (this.backend) console.log(`[IA] Backend actif : ${this.backend.label}`);
    else console.log(`[IA] ${this.disabledReason} (moteur de règles)`);
    return this;
  }

  // Renvoie des conseils IA ou null si indisponible / limité / échec.
  async getInGameTips(snapshot, { force = false } = {}) {
    if (!this.available || this.inFlight) return null;
    const now = Date.now();
    if (!force && now - this.lastCallTs < config.ai.minIntervalSeconds * 1000) return null;

    this.inFlight = true;
    this.lastCallTs = now;
    try {
      const text = await this.backend.generate(this.system, JSON.stringify(snapshot));
      const parsed = parseTips(text);
      if (!parsed) return null;
      const tips = Array.isArray(parsed.tips) ? parsed.tips.slice(0, 3) : [];
      return tips
        .filter((t) => t && t.title && t.message)
        .map((t, i) => ({
          id: `ai-${Math.floor(now / 1000)}-${i}`,
          priority: normalizePriority(t.priority),
          category: 'Coach IA',
          title: t.title,
          message: t.message,
          source: 'ai',
        }));
    } catch (err) {
      if (!this.warned) {
        this.warned = true;
        console.warn('[IA] Appel en échec, bascule sur le moteur de règles:', err.message);
      }
      return null;
    } finally {
      this.inFlight = false;
    }
  }

  statusLabel() {
    if (this.available) return this.backend.label;
    return this.disabledReason || 'désactivé';
  }
}

module.exports = { AiAdvisor };
