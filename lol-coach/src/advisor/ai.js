'use strict';

const config = require('../config');

// Schéma de sortie structuré : Claude renvoie un JSON strict de conseils.
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
- Réponds UNIQUEMENT avec le JSON demandé, en français, sans texte autour.`;

const SYSTEM_PROMPT_EN = `You are a professional League of Legends coach assisting a player in REAL TIME during their game.
You receive a JSON snapshot of the game state (time, your champion, scores, upcoming objectives, enemy composition, and tips already detected by a rules engine).
Give 1 to 3 SHORT, concrete, actionable tips like a high-level coach would: macro (objectives, vision, rotations, timings), micro (trades, positioning, power spikes), and decisions (recall, contest, disengage).
Rules:
- Put the single most important tip first.
- Be context-specific (use the provided numbers). Avoid vague generalities.
- Do not invent data not present in the snapshot.
- Do not repeat the rules-engine tips verbatim: complement them or add a higher-level perspective.
- Reply ONLY with the requested JSON, in English, with no surrounding text.`;

// Parse robuste : tente JSON direct, sinon extrait le 1er objet {...} du texte
// (au cas où le SDK/modèle entoure la sortie de texte).
function parseTips(text) {
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

class AiAdvisor {
  constructor() {
    this.client = null;
    this.disabledReason = null;
    this.lastCallTs = 0;
    this.inFlight = false;
    this.warned = false;

    if (!config.ai.enabled) {
      this.disabledReason = 'Aucune clé ANTHROPIC_API_KEY — moteur de règles uniquement.';
      return;
    }
    try {
      // Chargement paresseux : si le SDK n'est pas installé, on reste en mode règles.
      const Anthropic = require('@anthropic-ai/sdk');
      this.client = new Anthropic({ apiKey: config.ai.apiKey });
    } catch {
      this.disabledReason = "SDK @anthropic-ai/sdk non installé (npm install) — moteur de règles uniquement.";
    }
  }

  get available() {
    return Boolean(this.client);
  }

  get system() {
    return config.lang === 'en' ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT_FR;
  }

  // Renvoie des conseils IA ou null si indisponible/limité/échec.
  // `force` ignore la limite de cadence (ex: événement marquant).
  async getInGameTips(snapshot, { force = false } = {}) {
    if (!this.available || this.inFlight) return null;
    const now = Date.now();
    if (!force && now - this.lastCallTs < config.ai.minIntervalSeconds * 1000) return null;

    this.inFlight = true;
    this.lastCallTs = now;
    try {
      const msg = await this.client.messages.create({
        model: config.ai.model,
        max_tokens: 700,
        system: [{ type: 'text', text: this.system, cache_control: { type: 'ephemeral' } }],
        output_config: {
          effort: 'low',
          format: { type: 'json_schema', schema: TIPS_SCHEMA },
        },
        messages: [{ role: 'user', content: JSON.stringify(snapshot) }],
      });
      const textBlock = (msg.content || []).find((b) => b.type === 'text');
      if (!textBlock) return null;
      const parsed = parseTips(textBlock.text);
      if (!parsed) return null;
      const tips = Array.isArray(parsed.tips) ? parsed.tips.slice(0, 3) : [];
      return tips.map((t, i) => ({
        id: `ai-${Math.floor(now / 1000)}-${i}`,
        priority: t.priority || 'medium',
        category: 'Coach IA',
        title: t.title,
        message: t.message,
        source: 'ai',
      }));
    } catch (err) {
      if (!this.warned) {
        this.warned = true;
        console.warn('[IA] Appel Claude en échec, bascule sur le moteur de règles:', err.message);
      }
      return null;
    } finally {
      this.inFlight = false;
    }
  }

  statusLabel() {
    if (this.available) return `Claude (${config.ai.model})`;
    return this.disabledReason || 'désactivé';
  }
}

module.exports = { AiAdvisor };
