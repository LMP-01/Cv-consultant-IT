'use strict';

const config = require('./config');
const { DataDragon } = require('./data/ddragon');
const { LiveClient } = require('./liveclient/liveClient');
const { LcuClient } = require('./lcu/lcuClient');
const { AiAdvisor } = require('./advisor/ai');
const { analyzeInGame, OBJ_PATCH } = require('./advisor/heuristics');
const { analyzeChampSelect } = require('./advisor/pickAdvisor');
const { buildItemPlan } = require('./advisor/itemPlan');
const { GameHistory } = require('./data/history');
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
    this.onCue = null; // émetteur de cues (bip/voix) vers les clients WS
    this.state = this._emptyState();
    this.feed = []; // conseils récents, plus récent en tête
    this.emittedAt = new Map(); // id de conseil -> timestamp d'émission
    this.recentAiMsgs = new Map(); // contenu IA récent -> timestamp (anti-doublon)
    this.lastPhase = 'offline';
    this.mockStart = Date.now();
    this.timer = null;
    this.prevGame = null; // état précédent (PV/mort/events) pour les déclencheurs IA
    this.prevDraftSig = null; // signature du draft précédent (picks/bans) pour rafraîchir l'IA
    this.prevMatchupSig = null; // signature (pick vs lane) du dernier plan de lane demandé
    this.matchupPlan = null; // { sig, data } plan de lane IA en cache
    this.history = new GameHistory();
    this.lastInGame = null; // dernier instantané de partie (chat + historique)
    this.gameFinalized = false; // évite de sauvegarder deux fois la même partie
    this.playerProfile = null; // profil de faiblesses récurrentes (coach personnalisé)
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
    // Détection du patch : avertit si les timings d'objectifs ne sont plus à jour.
    const patch = this.ddragon.version || null;
    const patchMinor = patch ? patch.split('.').slice(0, 2).join('.') : null;
    this.state.connection.patch = patch;
    this.state.connection.patchVerified = OBJ_PATCH;
    this.state.connection.patchOk = patchMinor ? patchMinor === OBJ_PATCH : null;
    this.tick();
    this._schedule(config.pollIntervalLobbyMs);
  }

  _schedule(ms) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.tick(), ms);
  }

  // Ajoute des conseils au flux en respectant les cooldowns + dédoublonnage IA.
  _pushAdvice(adviceList) {
    const now = Date.now();
    let changed = false;
    for (const a of adviceList) {
      const isAi = a.source === 'ai';
      const cooldown = (COOLDOWN_OVERRIDES[a.id] != null ? COOLDOWN_OVERRIDES[a.id] : DEFAULT_COOLDOWN) * 1000;
      const last = this.emittedAt.get(a.id);
      if (!isAi && last && now - last < cooldown) continue;
      // Cache IA : évite de réafficher un conseil IA au contenu identique (45 s).
      if (isAi) {
        const sig = (a.message || a.title || '').trim().toLowerCase().slice(0, 120);
        const seen = this.recentAiMsgs.get(sig);
        if (seen && now - seen < 45000) continue;
        this.recentAiMsgs.set(sig, now);
        if (this.recentAiMsgs.size > 50) {
          for (const [k, t] of this.recentAiMsgs) if (now - t > 120000) this.recentAiMsgs.delete(k);
        }
      }
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
    this.state.connection.aiUsage = this.ai.usage();
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
      this._handleInGame(gameData, false);
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
        return config.pollIntervalChampSelectMs;
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
    this._handleInGame(gameData, true);
    return config.pollIntervalInGameMs;
  }

  // ── Handlers de phase ──────────────────────────────────────────────────────
  _handleInGame(gameData, isMock) {
    const fresh = this.lastPhase !== 'ingame';
    if (fresh) {
      this._resetFeed();
      this.prevGame = null;
      this.gameFinalized = false;
      this.playerProfile = this._computePlayerProfile();
      this.deathTimes = [];
      this.seenDeaths = new Set();
      this.winProfile = (this.history.list().stats.profileByResult || {}).win || null;
      this.csMilestones = { m10: null, m20: null };
    }
    this.lastPhase = 'ingame';

    const result = analyzeInGame(gameData, this.ddragon);
    this._captureDeaths(result, gameData);
    this._captureMilestones(result);
    this._pushAdvice(result.advice);

    // Déclencheur réactif : mort, chute de PV, kill/objectif... => conseil immédiat.
    const trigger = this._detectTrigger(result, gameData, fresh);

    // Plan d'objets (règles, instantané) : prochains achats + build complet.
    const itemPlan = buildItemPlan(result, this.ddragon);

    // 1) On diffuse IMMÉDIATEMENT le tableau de bord — l'IA ne doit jamais le bloquer.
    this.state = {
      phase: isMock ? 'ingame-demo' : 'ingame',
      connection: this.state.connection,
      game: {
        summary: result.summary,
        objectives: result.objectives,
        scoreboard: result.scoreboard,
        itemPlan,
        benchmark: this._benchmark(result.summary),
        milestones: this._milestones(result.summary),
      },
      pick: null,
      feed: this.feed,
      timestamp: Date.now(),
    };
    this._broadcast();

    // Mémorise le contexte courant (chat + historique de fin de partie).
    this.lastInGame = { result, events: (gameData.events && gameData.events.Events) || [], at: Date.now() };

    // 2) Conseils IA EN ARRIÈRE-PLAN (ne bloque pas le live) ; re-diffuse à l'arrivée.
    if (this.ai.available) {
      const snapshot = this._aiSnapshot(result, trigger);
      this._fireAi(() => this.ai.getInGameTips(snapshot, { force: fresh || Boolean(trigger) }));
    }
  }

  // Lance un appel IA sans bloquer la boucle ; pousse les conseils quand ils arrivent.
  _fireAi(fn) {
    Promise.resolve()
      .then(fn)
      .then((tips) => {
        if (tips && tips.length) {
          this._pushAdvice(tips);
          this._broadcast();
        }
      })
      .catch(() => {
        /* l'IA ne doit jamais casser la boucle */
      });
  }

  _handleChampSelect(session, isMock) {
    if (this.lastPhase !== 'champselect') {
      this._finalizeGameIfNeeded();
      this._resetFeed();
      this.prevDraftSig = null;
      this.prevMatchupSig = null;
      this.matchupPlan = null;
    }
    this.lastPhase = 'champselect';

    const pick = analyzeChampSelect(session, this.ddragon);

    // Plan de lane IA (en cache) : on l'attache si le matchup courant correspond.
    const topPick = pick.pickSuggestions && pick.pickSuggestions[0];
    const matchupSig = pick.laneOpponent && topPick ? `${topPick.id}|${pick.laneOpponent.id}` : null;
    if (this.matchupPlan && this.matchupPlan.sig === matchupSig) pick.matchupPlan = this.matchupPlan.data;

    // 1) Diffuse IMMÉDIATEMENT les picks/build — pas d'attente sur l'IA.
    this.state = {
      phase: isMock ? 'champselect-demo' : 'champselect',
      connection: this.state.connection,
      game: null,
      pick,
      feed: this.feed,
      timestamp: Date.now(),
    };
    this._broadcast();

    // 2) Conseils IA de draft EN ARRIÈRE-PLAN : on rafraîchit dès que le draft change.
    if (this.ai.available) {
      const sig = this._draftSignature(pick);
      const changed = sig !== this.prevDraftSig;
      this.prevDraftSig = sig;
      this._fireAi(() => this.ai.getChampSelectTips(this._draftSnapshot(pick), { force: changed }));

      // 3) Plan de lane détaillé : 1 appel par matchup (pick vs adversaire de lane).
      if (matchupSig && matchupSig !== this.prevMatchupSig) {
        this.prevMatchupSig = matchupSig;
        const ctx = {
          lang: config.lang,
          yourRole: pick.myRoleLabel,
          yourPick: topPick.name,
          autofilled: Boolean(pick.autofilled),
          autofillNote: pick.autofillNote || null,
          laneOpponent: pick.laneOpponent.name,
          enemyTeam: (pick.enemyChamps || []).map((c) => c.name),
          yourTeam: (pick.myChamps || []).map((c) => c.name),
          enemyComp: pick.enemyComp
            ? { profile: pick.enemyComp.profile, cc: pick.enemyComp.ccLevel, burst: pick.enemyComp.burstLevel }
            : null,
          enemySummonerSpells: (pick.recommendedSetup && pick.recommendedSetup.enemySpells) || [],
          suggestedSetup: pick.recommendedSetup
            ? { summoners: pick.recommendedSetup.summoners, runes: pick.recommendedSetup.runes }
            : null,
        };
        Promise.resolve()
          .then(() => this.ai.getMatchupPlan(ctx))
          .then((plan) => {
            if (!plan) return;
            this.matchupPlan = { sig: matchupSig, data: plan };
            if (this.state.pick) this.state.pick.matchupPlan = plan;
            this._broadcast();
          })
          .catch(() => {});
      }
    }
  }

  // Signature compacte du draft : change quand un pick/ban/rôle évolue.
  _draftSignature(pick) {
    const en = (pick.enemyChamps || []).map((c) => c.id).sort().join(',');
    const al = (pick.myChamps || []).map((c) => c.id).sort().join(',');
    const lane = pick.laneOpponent ? pick.laneOpponent.id : '';
    return `${pick.myRole}|lane:${lane}|en:${en}|al:${al}`;
  }

  // Instantané compact du champ select pour l'IA de draft.
  _draftSnapshot(pick) {
    return {
      lang: config.lang,
      phase: 'champ-select',
      yourRole: pick.myRoleLabel,
      laneOpponent: pick.laneOpponent ? pick.laneOpponent.name : null,
      enemyTeam: (pick.enemyChamps || []).map((c) => c.name),
      yourTeam: (pick.myChamps || []).map((c) => c.name),
      enemyComposition: pick.enemyComp
        ? { profile: pick.enemyComp.profile, cc: pick.enemyComp.ccLevel, burst: pick.enemyComp.burstLevel }
        : null,
      yourComposition: pick.teamComp ? { profile: pick.teamComp.profile } : null,
      candidatePicks: (pick.pickSuggestions || []).slice(0, 5).map((p) => ({
        champion: p.name,
        mastery: p.mastery != null ? p.mastery : undefined,
        reasons: p.reasons || [],
      })),
      defensiveBuildHints: (pick.buildSuggestions || []).map((b) => `${b.item} — ${b.reason}`),
      runeHints: pick.runeHints || [],
    };
  }

  _handleIdle(phase) {
    if (this.lastPhase === 'ingame') this._finalizeGameIfNeeded();
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

  // ── Historique de fin de partie ─────────────────────────────────────────────
  // Sauvegarde la dernière partie (si non encore faite) + critique IA async.
  // Enregistre l'horodatage de tes morts (events ChampionKill dont tu es la
  // victime), dédoublonné, pour la heatmap temporelle de l'historique.
  _captureDeaths(result, gameData) {
    if (!this.seenDeaths) { this.seenDeaths = new Set(); this.deathTimes = []; }
    const me = result.scoreboard && result.scoreboard.me;
    if (!me) return;
    const meName = me.summoner;
    const events = (gameData.events && gameData.events.Events) || [];
    for (const e of events) {
      if (e.EventName !== 'ChampionKill' || e.VictimName !== meName) continue;
      const key = e.EventID != null ? 'id' + e.EventID : 't' + e.EventTime;
      if (this.seenDeaths.has(key)) continue;
      this.seenDeaths.add(key);
      this.deathTimes.push(Math.round(e.EventTime || 0));
    }
  }

  _emitCue(cue) {
    if (this.onCue) { try { this.onCue(cue); } catch { /* ignore */ } }
  }

  // Fige ton CS aux jalons 10:00 et 20:00 (repères de farm).
  _captureMilestones(result) {
    if (!this.csMilestones) this.csMilestones = { m10: null, m20: null };
    const t = result.summary.gameTime || 0;
    const cs = result.summary.me ? result.summary.me.cs : null;
    if (cs == null) return;
    if (this.csMilestones.m10 == null && t >= 600) this.csMilestones.m10 = cs;
    if (this.csMilestones.m20 == null && t >= 1200) this.csMilestones.m20 = cs;
  }

  // Jalons de CS + objectif dérivé de ton rythme de win (ou 8/min par défaut).
  _milestones(summary) {
    const m = this.csMilestones || {};
    if (m.m10 == null && m.m20 == null) return null;
    const pace = this.winProfile && this.winProfile.csPerMin ? this.winProfile.csPerMin : 8;
    const out = { pace: +pace.toFixed ? +pace.toFixed(1) : pace };
    if (m.m10 != null) out.m10 = { cs: m.m10, target: Math.round(pace * 10), delta: m.m10 - Math.round(pace * 10) };
    if (m.m20 != null) out.m20 = { cs: m.m20, target: Math.round(pace * 20), delta: m.m20 - Math.round(pace * 20) };
    return out;
  }

  // Compare tes stats LIVE à ton profil moyen des games GAGNÉES (rythme de win).
  _benchmark(summary) {
    const wp = this.winProfile;
    if (!wp || !summary || !summary.me) return null;
    const me = summary.me;
    const out = { basedOn: wp.games };
    if (wp.csPerMin != null && me.csPerMin != null) {
      out.csPerMin = { you: me.csPerMin, win: wp.csPerMin, delta: +(me.csPerMin - wp.csPerMin).toFixed(1) };
    }
    if (wp.kp != null && me.kp != null) {
      out.kp = { you: me.kp, win: Math.round(wp.kp), delta: me.kp - Math.round(wp.kp) };
    }
    return out.csPerMin || out.kp ? out : null;
  }

  // Court résumé parlé de fin de partie (règles) : résultat, KDA, 1 axe clé.
  _endgameSummary(record) {
    const res = record.win === true ? 'Victoire' : record.win === false ? 'Défaite' : 'Partie terminée';
    const kda = record.kills != null ? `${record.kills}, ${record.deaths}, ${record.assists}` : '';
    let txt = `${res}. ${kda ? 'KDA ' + kda + '. ' : ''}`;
    if (record.csPerMin != null) txt += `${record.csPerMin} CS par minute. `;
    const early = (record.deathTimes || []).filter((t) => t < 600).length;
    if (early >= 2) txt += `Attention, ${early} morts avant la dixième minute — soigne ton début de partie.`;
    else if ((record.deaths || 0) >= 8) txt += `Trop de morts cette partie, joue plus prudemment.`;
    else if (record.csPerMin != null && record.csPerMin < 6 && record.role !== 'JUNGLE') txt += `Ton farm est bas, récupère mieux tes vagues.`;
    else if (record.win === true) txt += `Belle partie, continue comme ça.`;
    else txt += `Analyse la critique pour progresser.`;
    return txt;
  }

  _finalizeGameIfNeeded() {
    if (this.gameFinalized || !this.lastInGame) return;
    const { result, events } = this.lastInGame;
    // Ignore les parties trop courtes (remake / écran de chargement).
    if (!result || !result.summary || (result.summary.gameTime || 0) < 300) return;
    this.gameFinalized = true;

    const me = result.scoreboard.me;
    const endEvent = (events || []).find((e) => e.EventName === 'GameEnd');
    const win = endEvent ? endEvent.Result === 'Win' : null;
    const record = {
      date: new Date().toISOString(),
      durationSec: Math.round(result.summary.gameTime || 0),
      durationText: result.summary.gameTimeText,
      win,
      champion: me ? me.championDisplay || me.champion : null,
      role: me ? me.position : null,
      kda: me ? `${me.kills}/${me.deaths}/${me.assists}` : null,
      kills: me ? me.kills : null,
      deaths: me ? me.deaths : null,
      assists: me ? me.assists : null,
      cs: me ? me.cs : null,
      csPerMin: result.summary.me ? result.summary.me.csPerMin : null,
      wardScore: me ? me.wardScore : null,
      kp: result.summary.me ? result.summary.me.kp : null,
      deathTimes: Array.isArray(this.deathTimes) ? this.deathTimes.slice() : [],
      allies: result.scoreboard.allies.map((p) => p.championDisplay || p.champion),
      enemies: result.scoreboard.enemies.map((p) => p.championDisplay || p.champion),
      enemyProfile: result.summary.enemyComp ? result.summary.enemyComp.profile : null,
      review: null, // rempli par l'IA ci-dessous (async)
    };
    const id = this.history.add(record);

    // Résumé vocal de fin de partie (lu si la voix est active côté client).
    this._emitCue({ kind: 'note', text: this._endgameSummary(record) });

    // Critique IA (axes positifs / à améliorer) en arrière-plan.
    if (this.ai.available) {
      this.ai
        .reviewGame(record)
        .then((review) => {
          if (review) this.history.update(id, { review });
        })
        .catch(() => {
          /* la critique est optionnelle */
        });
    }
  }

  // Contexte compact pour le chat (selon la phase courante).
  chatContext() {
    if (this.lastPhase === 'ingame' && this.lastInGame) {
      const r = this.lastInGame.result;
      return {
        phase: 'in-game',
        gameTime: r.summary.gameTimeText,
        you: r.summary.me,
        objectivesSoon: (r.objectives || []).filter((o) => o.etaSeconds <= 60).map((o) => ({ name: o.name, inSeconds: o.etaSeconds })),
        allies: r.scoreboard.allies.map((p) => ({ champion: p.championDisplay || p.champion, kda: `${p.kills}/${p.deaths}/${p.assists}` })),
        enemies: r.scoreboard.enemies.map((p) => ({ champion: p.championDisplay || p.champion, kda: `${p.kills}/${p.deaths}/${p.assists}` })),
        enemyComposition: r.summary.enemyComp ? { profile: r.summary.enemyComp.profile, cc: r.summary.enemyComp.ccLevel, burst: r.summary.enemyComp.burstLevel } : null,
      };
    }
    if (this.state && this.state.pick) {
      const p = this.state.pick;
      return {
        phase: 'champ-select',
        yourRole: p.myRoleLabel,
        laneOpponent: p.laneOpponent ? p.laneOpponent.name : null,
        enemyTeam: (p.enemyChamps || []).map((c) => c.name),
        yourTeam: (p.myChamps || []).map((c) => c.name),
        candidatePicks: (p.pickSuggestions || []).slice(0, 5).map((s) => s.name),
      };
    }
    return { phase: this.state ? this.state.phase : 'idle' };
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
      items: (p.items || []).slice(0, 6),
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
      // Données live enrichies pour des conseils stratégiques.
      risk: summary.risk ? { level: summary.risk.level, title: summary.risk.title } : null,
      killParticipation: summary.me && summary.me.kp != null ? summary.me.kp + '%' : null,
      objectivesTaken: summary.objectivesTaken || null,
      platesActive: summary.plates ? summary.plates.active : null,
      nextCannonWaveSeconds: summary.waves ? summary.waves.nextCannonSeconds : null,
      recall: summary.recall ? { nextItem: summary.recall.item.name, affordable: summary.recall.affordable, missingGold: summary.recall.missing } : null,
      goldLead: summary.teamGold ? { team: summary.teamGold.diff, lane: summary.laneGold ? summary.laneGold.diff : null } : null,
      dragons: summary.dragons ? { ally: summary.dragons.ally, enemy: summary.dragons.enemy, soulTeam: summary.dragons.soulTeam, soulPointTeam: summary.dragons.soulPointTeam } : null,
      towers: summary.towers || null,
      enemyKeystones: summary.enemyKeystones || [],
      enemySummonerSpells: summary.enemySpells || [],
      playerProfile: this.playerProfile || null,
      rulesEngineTips: result.advice.map((a) => a.title),
    };
  }

  // Profil compact du joueur (faiblesses récurrentes) pour personnaliser l'IA.
  _computePlayerProfile() {
    try {
      const h = this.history.list();
      if (!h.stats.played) return null;
      const champs = (h.stats.byChampion || []).slice(0, 3).map((c) => `${c.champion} ${Math.round((c.wins / c.games) * 100)}%`);
      const recurring = [];
      for (const g of h.games.slice(0, 8)) {
        if (g.review && Array.isArray(g.review.toImprove)) recurring.push(...g.review.toImprove);
      }
      const top = [...new Set(recurring)].slice(0, 4);
      return {
        winrate: h.stats.winrate,
        avgDeaths: h.stats.avgKda ? h.stats.avgKda.d : null,
        topChampions: champs,
        recurringWeaknesses: top,
      };
    } catch {
      return null;
    }
  }
}

module.exports = { CoachLoop };
