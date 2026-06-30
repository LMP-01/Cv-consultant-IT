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
- Si le champ "evenement" est renseigné, PRIORISE un conseil directement lié à cet événement (réaction immédiate, priorité high).
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
- If the "evenement" field is set, PRIORITIZE a tip directly related to that event (immediate reaction, high priority).
- Reply ONLY with a JSON object {"tips":[{"title","message","priority"}]}, in English, with no surrounding text.`;

const SYSTEM_DRAFT_FR = `Tu es un coach de DRAFT (champ select) de League of Legends de très haut niveau.
On te donne un instantané JSON du champ select : ton rôle, ton adversaire de lane, la composition adverse et la tienne (champions déjà choisis), le profil de dégâts des deux équipes, tes picks candidats (avec maîtrise et raisons), et des pistes de build/runes défensifs.
Donne 1 à 3 conseils COURTS et actionnables pour CE moment du draft :
- quel champion PICK privilégier et POURQUOI (counter de ta lane / de la team adverse, et synergie/équilibre avec TA team) ;
- l'ajustement de BUILD ou de RUNES le plus important contre cette composition (AD/AP, CC, burst).
Règles :
- Base-toi UNIQUEMENT sur les champions présents dans l'instantané. N'invente pas de picks adverses non révélés.
- Privilégie les champions de "candidatePicks" (la pool du joueur) quand c'est pertinent ; cite-les par leur nom.
- Sois concret (cite les champions et le profil). Priorise le conseil le plus important.
- "priority" doit valoir exactement "high", "medium" ou "low".
- Réponds UNIQUEMENT avec un objet JSON {"tips":[{"title","message","priority"}]}, en français, sans aucun texte autour.`;

const SYSTEM_DRAFT_EN = `You are a top-level League of Legends DRAFT (champ select) coach.
You receive a JSON snapshot of champ select: your role, your lane opponent, the enemy and your own composition (champions already locked), both teams' damage profile, your candidate picks (with mastery and reasons), and defensive build/rune hints.
Give 1 to 3 SHORT, actionable tips for THIS draft moment:
- which champion to PICK and WHY (counters your lane / the enemy team, and synergy/balance with YOUR team);
- the single most important BUILD or RUNE adjustment against this composition (AD/AP, CC, burst).
Rules:
- Use ONLY champions present in the snapshot. Do not invent enemy picks not revealed yet.
- Prefer champions from "candidatePicks" (the player's pool) when relevant; name them.
- Be concrete (cite champions and profile). Put the most important tip first.
- "priority" must be exactly "high", "medium" or "low".
- Reply ONLY with a JSON object {"tips":[{"title","message","priority"}]}, in English, with no surrounding text.`;

// Schéma de la critique de fin de partie.
const REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'didWell', 'toImprove'],
  properties: {
    summary: { type: 'string' },
    rating: { type: 'string', enum: ['great', 'good', 'mixed', 'rough'] },
    didWell: { type: 'array', items: { type: 'string' } },
    toImprove: { type: 'array', items: { type: 'string' } },
    focusNextGame: { type: 'string' },
  },
};

const REVIEW_FR = `Tu es un coach de League of Legends qui débriefe une partie TERMINÉE pour aider le joueur à progresser vers le Challenger.
On te donne un résumé JSON de la partie (champion, rôle, KDA, CS/min, durée, résultat si connu, compositions alliée et adverse).
Donne une critique HONNÊTE mais BIENVEILLANTE, et des axes d'amélioration concrets et actionnables.
Réponds UNIQUEMENT avec un objet JSON :
{"summary":"...","rating":"great|good|mixed|rough","didWell":["..."],"toImprove":["..."],"focusNextGame":"..."}
- "didWell" : 2 à 4 points positifs concrets (déduits des chiffres / du contexte).
- "toImprove" : 2 à 4 axes précis (farm, morts, vision, macro, timings...).
- "focusNextGame" : UN seul objectif prioritaire pour la prochaine partie.
N'invente pas de faits absents du résumé. En français, sans aucun texte autour du JSON.`;

const REVIEW_EN = `You are a League of Legends coach debriefing a FINISHED game to help the player climb toward Challenger.
You receive a JSON summary (champion, role, KDA, CS/min, duration, result if known, ally and enemy compositions).
Give an HONEST but constructive critique and concrete, actionable improvement areas.
Reply ONLY with a JSON object:
{"summary":"...","rating":"great|good|mixed|rough","didWell":["..."],"toImprove":["..."],"focusNextGame":"..."}
- "didWell": 2-4 concrete positives (from the numbers/context).
- "toImprove": 2-4 precise areas (farm, deaths, vision, macro, timings...).
- "focusNextGame": ONE priority goal for the next game.
Do not invent facts absent from the summary. In English, no text around the JSON.`;

// Schéma de l'analyse de l'historique (faiblesses récurrentes).
const HISTORY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'patterns', 'priorities'],
  properties: {
    summary: { type: 'string' },
    patterns: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'detail'],
        properties: { title: { type: 'string' }, detail: { type: 'string' } },
      },
    },
    priorities: { type: 'array', items: { type: 'string' } },
  },
};

const HISTORY_FR = `Tu es un coach de League of Legends qui analyse l'HISTORIQUE de parties d'un joueur pour identifier ses FAIBLESSES RÉCURRENTES et l'aider à monter en Challenger.
On te donne des statistiques agrégées et la liste de ses parties (champion, rôle, résultat, KDA, morts, CS/min, profil adverse, et axes d'amélioration déjà notés).
Identifie les PATTERNS récurrents (pas une seule partie) : tendances de morts, farm, choix de champion/matchup, écarts de résultats par champion, etc.
Réponds UNIQUEMENT avec un objet JSON :
{"summary":"...","patterns":[{"title":"...","detail":"..."}],"priorities":["..."]}
- "patterns" : 3 à 5 faiblesses récurrentes concrètes, chiffrées quand c'est possible.
- "priorities" : les 3 chantiers prioritaires pour progresser, par ordre d'impact.
Base-toi UNIQUEMENT sur les données fournies (n'invente pas). En français, sans aucun texte autour du JSON.`;

const HISTORY_EN = `You are a League of Legends coach analyzing a player's GAME HISTORY to find RECURRING WEAKNESSES and help them climb to Challenger.
You receive aggregate stats and the list of games (champion, role, result, KDA, deaths, CS/min, enemy profile, and already-noted improvement areas).
Identify RECURRING patterns (not a single game): death trends, farm, champion/matchup choices, result gaps per champion, etc.
Reply ONLY with a JSON object:
{"summary":"...","patterns":[{"title":"...","detail":"..."}],"priorities":["..."]}
- "patterns": 3-5 concrete recurring weaknesses, quantified when possible.
- "priorities": the top 3 focus areas to improve, ordered by impact.
Use ONLY the provided data (don't invent). In English, no text around the JSON.`;

const CHAT_FR = `Tu es un coach expert de League of Legends qui répond au joueur PENDANT sa partie (il est peut-être mort, en attente de respawn, ou en alt-tab).
On te donne sa question et un contexte de jeu JSON.
Réponds de façon CONCISE (2 à 4 phrases), concrète et actionnable. Appuie-toi sur le contexte (chiffres, champions, objectifs) quand c'est pertinent. Si l'info n'est pas dans le contexte, donne ton meilleur conseil sans inventer de données précises.
Réponds en français, en texte simple (PAS de JSON, pas de markdown).`;

const CHAT_EN = `You are an expert League of Legends coach answering the player DURING their game (they may be dead, awaiting respawn, or alt-tabbed).
You receive their question and a JSON game context.
Answer CONCISELY (2-4 sentences), concrete and actionable. Use the context (numbers, champions, objectives) when relevant. If the info isn't in the context, give your best advice without inventing precise data.
Answer in English, plain text (NO JSON, no markdown).`;

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

  async generate(systemText, userText, opts = {}) {
    const body = {
      model: config.ai.model,
      max_tokens: opts.maxTokens || 700,
      system: [{ type: 'text', text: systemText, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userText }],
    };
    // Sortie structurée JSON par défaut ; texte libre si json === false (chat).
    if (opts.json !== false) {
      body.output_config = { effort: 'low', format: { type: 'json_schema', schema: opts.schema || TIPS_SCHEMA } };
    }
    const msg = await this.client.messages.create(body);
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

  async generate(systemText, userText, opts = {}) {
    // Claude Code conserve son prompt système ; on injecte nos instructions
    // dans le prompt utilisateur (envoyé via stdin). Le format (JSON ou texte)
    // est piloté par le prompt système ; opts est accepté pour la compatibilité.
    const prompt = `${systemText}\n\n=== CONTEXTE (JSON) ===\n${userText}`;
    const args = ['-p', '--output-format', 'json'];
    if (this.model) args.push('--model', this.model);
    const raw = await this._run(args, prompt, opts.timeoutMs || 30000);
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
    // Suivi d'usage (indicatif — la CLI n'expose pas le vrai quota Max).
    this.calls = 0;
    this.failures = 0;
    this.lastOk = null;
    this.lastCallAt = 0;
  }

  // Enveloppe un appel au backend en comptabilisant succès/échecs.
  async _call(systemText, userText, opts) {
    this.calls += 1;
    this.lastCallAt = Date.now();
    try {
      const text = await this.backend.generate(systemText, userText, opts);
      this.lastOk = text != null;
      if (text == null) this.failures += 1;
      return text;
    } catch (err) {
      this.failures += 1;
      this.lastOk = false;
      throw err;
    }
  }

  // État d'usage IA pour l'interface (nombre d'appels, dernier statut).
  usage() {
    return {
      enabled: this.available,
      label: this.available ? this.backend.label : null,
      calls: this.calls,
      failures: this.failures,
      lastOk: this.lastOk,
      lastCallAt: this.lastCallAt || null,
    };
  }

  get system() {
    return config.lang === 'en' ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT_FR;
  }

  get draftSystem() {
    return config.lang === 'en' ? SYSTEM_DRAFT_EN : SYSTEM_DRAFT_FR;
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

  // Conseils IA en partie (ou null si indisponible / limité / échec).
  async getInGameTips(snapshot, opts = {}) {
    return this._getTips(this.system, snapshot, { ...opts, category: 'Coach IA' });
  }

  // Conseils IA de draft pendant le champ select (pick + build, en direct).
  async getChampSelectTips(snapshot, opts = {}) {
    return this._getTips(this.draftSystem, snapshot, { ...opts, category: 'Draft IA' });
  }

  // Critique de fin de partie (axes positifs / à améliorer). Hors throttle :
  // déclenché une seule fois en fin de partie.
  async reviewGame(record) {
    if (!this.available) return null;
    const system = config.lang === 'en' ? REVIEW_EN : REVIEW_FR;
    try {
      const text = await this._call(system, JSON.stringify(record), { schema: REVIEW_SCHEMA, maxTokens: 800 });
      const parsed = parseTips(text);
      if (!parsed || !parsed.summary) return null;
      return {
        summary: String(parsed.summary),
        rating: parsed.rating || null,
        didWell: Array.isArray(parsed.didWell) ? parsed.didWell.slice(0, 6) : [],
        toImprove: Array.isArray(parsed.toImprove) ? parsed.toImprove.slice(0, 6) : [],
        focusNextGame: parsed.focusNextGame || null,
      };
    } catch {
      return null;
    }
  }

  // Analyse de l'historique : faiblesses récurrentes + chantiers prioritaires.
  async analyzeHistory(history) {
    if (!this.available) return null;
    const games = (history.games || []).slice(0, 30).map((g) => ({
      champion: g.champion,
      role: g.role,
      win: g.win,
      kda: g.kda,
      deaths: g.deaths,
      csPerMin: g.csPerMin,
      duration: g.durationText,
      enemyProfile: g.enemyProfile,
      toImprove: g.review ? g.review.toImprove : undefined,
    }));
    const payload = { stats: history.stats, games };
    const system = config.lang === 'en' ? HISTORY_EN : HISTORY_FR;
    try {
      const text = await this._call(system, JSON.stringify(payload), { schema: HISTORY_SCHEMA, maxTokens: 900 });
      const p = parseTips(text);
      if (!p || !Array.isArray(p.patterns)) return null;
      return {
        summary: p.summary || null,
        patterns: p.patterns.slice(0, 6),
        priorities: Array.isArray(p.priorities) ? p.priorities.slice(0, 3) : [],
      };
    } catch {
      return null;
    }
  }

  // Réponse libre à une question du joueur (chat), avec le contexte de jeu.
  async askQuestion(question, context) {
    if (!this.available) return null;
    const system = config.lang === 'en' ? CHAT_EN : CHAT_FR;
    const user = `Question du joueur : ${question}\n\nContexte de jeu (JSON) :\n${JSON.stringify(context)}`;
    try {
      const text = await this._call(system, user, { json: false, maxTokens: 600 });
      return text ? text.trim() : null;
    } catch {
      return null;
    }
  }

  // Cœur commun : génère, parse et formate les conseils, en respectant la cadence.
  async _getTips(systemText, snapshot, { force = false, category = 'Coach IA' } = {}) {
    if (!this.available || this.inFlight) return null;
    const now = Date.now();
    // En cadence normale on respecte minIntervalSeconds. Un moment réactif
    // (force) peut anticiper, mais jamais plus vite que reactiveFloorSeconds —
    // pour rester immédiat sans saturer le quota Claude Max.
    const floorSec = force ? config.ai.reactiveFloorSeconds : config.ai.minIntervalSeconds;
    if (now - this.lastCallTs < floorSec * 1000) return null;

    this.inFlight = true;
    this.lastCallTs = now;
    try {
      const text = await this._call(systemText, JSON.stringify(snapshot));
      const parsed = parseTips(text);
      if (!parsed) return null;
      const tips = Array.isArray(parsed.tips) ? parsed.tips.slice(0, 3) : [];
      return tips
        .filter((t) => t && t.title && t.message)
        .map((t, i) => ({
          id: `ai-${Math.floor(now / 1000)}-${i}`,
          priority: normalizePriority(t.priority),
          category,
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
