'use strict';

const config = require('./config');
const { DataDragon } = require('./data/ddragon');
const { LiveClient } = require('./liveclient/liveClient');
const { LcuClient } = require('./lcu/lcuClient');
const { AiAdvisor } = require('./advisor/ai');
const { analyzeInGame } = require('./advisor/heuristics');
const { analyzeChampSelect } = require('./advisor/pickAdvisor');
const { mockAllGameData, mockChampSelectSession } = require('./mock/mockData');

// Cooldowns (s) avant de réafficher un conseil identique dans le flux.
const DEFAULT_COOLDOWN = 30;
const COOLDOWN_OVERRIDES = { 'low-hp': 12, 'game-start': 99999 };
const FEED_MAX = 40;

class CoachLoop {
  constructor() {
    this.ddragon = new DataDragon();
    this.live = new LiveClient();
    this.lcu = new LcuClient();
    this.ai = new AiAdvisor();

    this.onState = null;
    this.state = this._emptyState();
    this.feed = []; // conseils récents, plus récent en tête
    this.emittedAt = new Map(); // id de conseil -> timestamp d'émission
    this.lastPhase = 'offline';
    this.mockStart = Date.now();
    this.timer = null;
    this.prevGame = null; // état précédent (PV/mort/events) pour les déclencheurs IA
  }

  _emptyState() {
    return {
      phase: 'offline',
      connection: { liveClient: false, lcu: false, ai: this.ai ? this.ai.statusLabel() : 'désactivé', mock: config.mockMode },
      feed: [],
      timestamp: Date.now(),
    };
  }

  async init(onState) {
    this.onState = onState;
    await this.ai.init();
    this.state.connection.ai = this.ai.statusLabel();
    await this.ddragon.init();
    if (!this.ddragon.ready) {
      console.warn('[ddragon] Données statiques indisponibles:', this.ddragon.initError || '');
    } else {
      console.log(`[ddragon] Prêt (patch ${this.ddragon.version}, locale ${this.ddragon.locale}).`);
    }
    this.tick();
    this._schedule(config.pollIntervalLobbyMs);
  }

  _schedule(ms) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.tick(), ms);
  }

  // Ajoute des conseils au flux en respectant les cooldowns.
  _pushAdvice(adviceList) {
    const now = Date.now();
    let changed = false;
    for (const a of adviceList) {
      const isAi = a.source === 'ai';
      const cooldown = (COOLDOWN_OVERRIDES[a.id] != null ? COOLDOWN_OVERRIDES[a.id] : DEFAULT_COOLDOWN) * 1000;
      const last = this.emittedAt.get(a.id);
      if (!isAi && last && now - last < cooldown) continue;
      this.emittedAt.set(a.id, now);
      this.feed.unshift({ ...a, at: now });
      changed = true;
    }
    if (this.feed.length > FEED_MAX) this.feed.length = FEED_MAX;
    return changed;
  }

  _resetFeed() {
    this.feed = [];
    this.emittedAt.clear();
  }

  _broadcast() {
    this.state.feed = this.feed;
    this.state.timestamp = Date.now();
    if (this.onState) this.onState(this.state);
  }

  async tick() {
    let nextDelay = config.pollIntervalLobbyMs;
    try {
      if (config.mockMode) {
        nextDelay = await this._tickMock();
      } else {
        nextDelay = await this._tickLive();
      }
    } catch (err) {
      // Une erreur ne doit jamais arrêter la boucle.
      console.warn('[loop] erreur tick:', err.message);
    }
    this._schedule(nextDelay);
  }

  // ── Mode réel ─────────────────────────────────────────────────────────────
  async _tickLive() {
    // 1) Tente l'API in-game (port 2999).
    let gameData = null;
    try {
      gameData = await this.live.getAllGameData();
    } catch {
      gameData = null;
    }

    if (gameData && gameData.gameData) {
      await this._handleInGame(gameData, false);
      this.state.connection.liveClient = true;
      this.state.connection.lcu = true;
      return config.pollIntervalInGameMs;
    }
    this.state.connection.liveClient = false;

    // 2) Sinon, regarde la phase via la LCU.
    let phase = null;
    try {
      phase = await this.lcu.getGameflowPhase();
      this.state.connection.lcu = Boolean(phase);
    } catch {
      this.state.connection.lcu = false;
    }

    if (phase === 'ChampSelect') {
      let session = null;
      try {
        session = await this.lcu.getChampSelectSession();
      } catch {
        session = null;
      }
      if (session) {
        this._handleChampSelect(session);
        return config.pollIntervalLobbyMs;
      }
    }

    // 3) Idle / lobby / hors client.
    this._handleIdle(phase);
    return config.pollIntervalLobbyMs;
  }

  // ── Mode démo ──────────────────────────────────────────────────────────────
  async _tickMock() {
    const elapsed = (Date.now() - this.mockStart) / 1000;
    this.state.connection.liveClient = true;
    this.state.connection.lcu = true;

    const csWindow = config.mockChampSelectSeconds;
    if (elapsed < csWindow) {
      this._handleChampSelect(mockChampSelectSession(), true);
      return 1000;
    }
    const gameData = mockAllGameData(elapsed - csWindow);
    await this._handleInGame(gameData, true);
    return config.pollIntervalInGameMs;
  }

  // ── Handlers de phase ──────────────────────────────────────────────────────
  async _handleInGame(gameData, isMock) {
    const fresh = this.lastPhase !== 'ingame';
    if (fresh) {
      this._resetFeed();
      this.prevGame = null;
    }
    this.lastPhase = 'ingame';

    const result = analyzeInGame(gameData, this.ddragon);
    this._pushAdvice(result.advice);

    // Déclencheur réactif : mort, chute de PV, kill/objectif... => conseil immédiat.
    const trigger = this._detectTrigger(result, gameData, fresh);

    // Conseils IA (si disponibles), en complément du moteur de règles.
    if (this.ai.available) {
      const snapshot = this._aiSnapshot(result, trigger);
      const aiTips = await this.ai.getInGameTips(snapshot, { force: fresh || Boolean(trigger) });
      if (aiTips && aiTips.length) this._pushAdvice(aiTips);
    }

    this.state = {
      phase: isMock ? 'ingame-demo' : 'ingame',
      connection: this.state.connection,
      game: {
        summary: result.summary,
        objectives: result.objectives,
        scoreboard: result.scoreboard,
      },
      pick: null,
      feed: this.feed,
      timestamp: Date.now(),
    };
    this._broadcast();
  }

  _handleChampSelect(session, isMock) {
    if (this.lastPhase !== 'champselect') this._resetFeed();
    this.lastPhase = 'champselect';

    const pick = analyzeChampSelect(session, this.ddragon);
    this.state = {
      phase: isMock ? 'champselect-demo' : 'champselect',
      connection: this.state.connection,
      game: null,
      pick,
      feed: this.feed,
      timestamp: Date.now(),
    };
    this._broadcast();
  }

  _handleIdle(phase) {
    this.lastPhase = 'idle';
    this.state = {
      phase: this.state.connection.lcu ? 'idle' : 'offline',
      lcuPhase: phase || null,
      connection: this.state.connection,
      game: null,
      pick: null,
      feed: this.feed,
      timestamp: Date.now(),
    };
    this._broadcast();
  }

  // Détecte un moment "réactif" (prise de risque, action) entre deux ticks.
  _detectTrigger(result, gameData, fresh) {
    const me = result.scoreboard.me;
    const hp = result.summary.me ? result.summary.me.hpPct : null;
    const dead = me ? me.isDead : false;
    const events = (gameData.events && gameData.events.Events) || [];
    const NOTABLE = ['ChampionKill', 'Multikill', 'Ace', 'DragonKill', 'BaronKill', 'HeraldKill', 'FirstBlood', 'TurretKilled'];
    const notable = events.filter((e) => NOTABLE.includes(e.EventName));
    const lastNotableTime = notable.length ? notable[notable.length - 1].EventTime : -1;

    let trigger = null;
    const prev = this.prevGame;
    if (!fresh && prev) {
      // Déclencheurs sur FRONT (transition) uniquement : on évite de relancer
      // l'IA à chaque tick tant qu'un état (PV bas) persiste.
      if (dead && !prev.dead) trigger = 'Tu viens de mourir — analyse l’erreur et reviens prudemment.';
      else if (hp != null && prev.hp != null && prev.hp - hp >= 25 && !dead) trigger = 'Tes PV ont chuté brutalement (prise de risque) — recule si nécessaire.';
      else if (lastNotableTime > prev.lastNotableTime) trigger = 'Action de jeu récente (kill / objectif) — réagis à la situation sur la map.';
      else if (hp != null && hp < 30 && prev.hp != null && prev.hp >= 30 && !dead) trigger = 'PV bas, situation risquée — temporise et repositionne-toi.';
    }
    this.prevGame = { hp, dead, lastNotableTime };
    return trigger;
  }

  // Construit un instantané compact pour l'IA.
  _aiSnapshot(result, trigger) {
    const { summary, objectives, scoreboard } = result;
    const compact = (p) => ({
      champion: p.championDisplay || p.champion,
      kda: `${p.kills}/${p.deaths}/${p.assists}`,
      cs: p.cs,
      level: p.level,
    });
    return {
      lang: config.lang,
      gameTime: summary.gameTimeText,
      evenement: trigger || null,
      you: summary.me,
      objectivesSoon: objectives
        .filter((o) => o.etaSeconds <= 60)
        .map((o) => ({ name: o.name, inSeconds: o.etaSeconds })),
      allies: scoreboard.allies.map(compact),
      enemies: scoreboard.enemies.map(compact),
      enemyComposition: summary.enemyComp
        ? {
            profile: summary.enemyComp.profile,
            cc: summary.enemyComp.ccLevel,
            burst: summary.enemyComp.burstLevel,
          }
        : null,
      rulesEngineTips: result.advice.map((a) => a.title),
    };
  }
}

module.exports = { CoachLoop };
