'use strict';

const $ = (id) => document.getElementById(id);

let ws = null;
let latestObjectives = [];
let objReceivedAt = Date.now();
const renderedKeys = new Set();

// État de la synthèse vocale (Web Speech API, 100% navigateur, sans clé).
// `endpoint` (optionnel) = serveur TTS externe (ex. Piper) qui renvoie de l'audio.
const tts = { enabled: false, enabledAt: 0, voiceURI: '', scope: 'important', pending: 0, endpoint: '' };

// ── WebSocket ──────────────────────────────────────────────────────────────
function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);

  ws.onopen = () => setBadge('wsBadge', 'Serveur', 'ok');
  ws.onclose = () => {
    setBadge('wsBadge', 'Serveur', 'off');
    setTimeout(connect, 2000);
  };
  ws.onerror = () => ws.close();
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'state') applyState(msg.payload);
      else if (msg.type === 'cue') handleCue(msg.payload);
    } catch (e) {
      /* ignore */
    }
  };
}

// Bip court (Web Audio) — fonctionne même onglet en arrière-plan.
let audioCtx = null;
function beep(freq, ms) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.value = freq || 880;
    g.gain.value = 0.06;
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + (ms || 180) / 1000);
  } catch {
    /* audio indispo */
  }
}

function notify(title, body) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, silent: true });
    }
  } catch {
    /* notifications indispo */
  }
}

// Déclencheur externe (via /api/cue) : timer Flash, bip, ou note.
function handleCue(cue) {
  if (!cue || !cue.kind) return;
  if (cue.kind === 'beep') {
    beep(cue.freq, cue.ms);
  } else if (cue.kind === 'note' && cue.text) {
    if (tts.enabled) speak(cue.text);
  } else if ((cue.kind === 'flash' || cue.kind === 'ult') && cue.champ) {
    const want = String(cue.champ).toLowerCase();
    document.querySelectorAll('#timersList .timer-row').forEach((row) => {
      const name = (row.querySelector('.timer-name') || {}).textContent || '';
      if (name.toLowerCase().includes(want)) {
        const btn = row.querySelector('.timer-btn.' + (cue.kind === 'ult' ? 'ult' : 'flash'));
        if (btn) btn.click();
      }
    });
  }
}

function setBadge(id, text, cls) {
  const el = $(id);
  if (!el) return;
  el.textContent = text;
  el.className = 'badge ' + (cls || 'dim');
}

// ── Application de l'état ───────────────────────────────────────────────────
const PHASE_LABELS = {
  offline: 'Hors client',
  idle: 'En attente',
  champselect: 'Champ Select',
  'champselect-demo': 'Champ Select (démo)',
  ingame: 'En partie',
  'ingame-demo': 'En partie (démo)',
};

function applyState(state) {
  // Badges de statut
  setBadge('phaseBadge', PHASE_LABELS[state.phase] || state.phase, 'phase');
  const c = state.connection || {};
  setBadge('liveBadge', 'Jeu', c.liveClient ? 'ok' : 'off');
  setBadge('lcuBadge', 'Client', c.lcu ? 'ok' : 'off');
  const u = c.aiUsage;
  const aiTxt = 'IA: ' + shortAi(c.ai) + (u && u.calls ? ` · ${u.calls} appel${u.calls > 1 ? 's' : ''}` : '');
  const aiCls = !(c.ai && c.ai.includes('Claude')) ? 'dim' : u && u.lastOk === false ? 'off' : 'ok';
  setBadge('aiBadge', aiTxt, aiCls);
  if (c.patch) {
    const ok = c.patchOk !== false;
    setBadge('patchBadge', 'Patch ' + c.patch, ok ? 'dim' : 'off');
    const pb = $('patchBadge');
    if (pb) pb.title = ok ? `Patch détecté : ${c.patch}` : `Patch ${c.patch} — timings d'objectifs vérifiés pour ${c.patchVerified}. Vérifie data dans heuristics.js si nécessaire.`;
  }

  // Flux de conseils
  addFeedItems(state.feed || []);

  // Panneaux contextuels
  const inGame = state.phase === 'ingame' || state.phase === 'ingame-demo';
  const champSelect = state.phase === 'champselect' || state.phase === 'champselect-demo';
  toggle('idleCard', !inGame && !champSelect);
  toggle('champSelect', champSelect);
  toggle('inGame', inGame);

  // Fond d'écran = splash du champion pické / joué.
  if (inGame && state.game && state.game.scoreboard && state.game.scoreboard.me) {
    setChampionBg(state.game.scoreboard.me.championId);
  } else if (champSelect && state.pick) {
    const myC = state.pick.myChampion;
    const top = state.pick.pickSuggestions && state.pick.pickSuggestions[0];
    setChampionBg((myC && myC.id) || (top && top.id) || null);
  } else {
    setChampionBg(null);
  }

  if (champSelect && state.pick) renderChampSelect(state.pick);
  if (inGame && state.game) renderInGame(state.game);
}

// Affiche le splash art du champion en fond (Data Dragon CDN).
let curChampBg = '';
function setChampionBg(championId) {
  let el = document.getElementById('champBg');
  if (!championId) {
    if (el) el.classList.remove('show');
    document.body.classList.remove('has-champ');
    curChampBg = '';
    return;
  }
  if (championId === curChampBg) return;
  curChampBg = championId;
  if (!el) {
    el = document.createElement('div');
    el.id = 'champBg';
    document.body.prepend(el);
  }
  el.style.backgroundImage = `url('https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${championId}_0.jpg')`;
  el.classList.add('show');
  document.body.classList.add('has-champ');
}

function shortAi(ai) {
  if (!ai) return '—';
  if (/claude code|abonnement/i.test(ai)) return 'Max';
  if (/claude/i.test(ai)) return 'Claude';
  return 'règles';
}

function toggle(id, show) {
  const el = $(id);
  if (el) el.classList.toggle('hidden', !show);
}

// ── Flux de conseils ────────────────────────────────────────────────────────
function addFeedItems(feed) {
  const container = $('feed');
  const empty = $('feedEmpty');
  const newItems = feed.filter((a) => !renderedKeys.has(a.id + '-' + a.at));
  if (newItems.length && empty) empty.remove();

  for (let i = newItems.length - 1; i >= 0; i--) {
    const a = newItems[i];
    const key = a.id + '-' + a.at;
    renderedKeys.add(key);
    const el = buildAdviceEl(a);
    el.dataset.key = key;
    container.prepend(el);
    maybeSpeak(a);
  }
  // Limite le DOM et purge les clés des éléments évincés (évite une fuite mémoire
  // sur une session longue couvrant plusieurs parties).
  while (container.children.length > 40) {
    const removed = container.lastChild;
    if (removed && removed.dataset && removed.dataset.key) renderedKeys.delete(removed.dataset.key);
    container.removeChild(removed);
  }
}

const PRIO_LABEL = { high: 'Urgent', medium: 'Important', low: 'Conseil', info: 'Info' };

// Filtre macro/micro du flux.
const MACRO_CATS = ['Macro', 'Objectif', 'Tempo', 'Économie', 'Build', 'Draft IA', 'Vision'];
const MICRO_CATS = ['Survie', 'Farm', 'Spike', 'Trade', 'Combat'];
let feedFocus = 'all';
function adviceVisible(cat) {
  if (feedFocus === 'all') return true;
  if (cat === 'Coach IA') return true; // les conseils IA généraux restent visibles
  if (feedFocus === 'macro') return MACRO_CATS.includes(cat);
  return MICRO_CATS.includes(cat);
}
function applyFeedFilter() {
  document.querySelectorAll('#feed .advice').forEach((el) => {
    el.style.display = adviceVisible(el.dataset.cat || '') ? '' : 'none';
  });
}

// Retire les emojis d'un texte (rendu pro — les icônes SVG / chips suffisent).
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{2705}\u{274C}\u{2728}\u{26A1}\u{FE0F}]/gu;
function noEmoji(s) {
  return String(s == null ? '' : s).replace(EMOJI_RE, '').replace(/\s{2,}/g, ' ').trim();
}

function buildAdviceEl(a) {
  const el = document.createElement('div');
  const isAi = a.source === 'ai';
  el.className = 'advice ' + (isAi ? 'ai' : a.priority || 'info');
  el.dataset.at = a.at;
  el.dataset.cat = a.category || '';
  if (!adviceVisible(a.category || '')) el.style.display = 'none';
  const prio = isAi ? 'IA' : PRIO_LABEL[a.priority] || 'Info';
  el.innerHTML = `
    <div class="advice-accent"></div>
    <div class="advice-body">
      <div class="advice-head">
        <span class="advice-title">${esc(noEmoji(a.title))}</span>
        <span class="rel" data-at="${a.at}"></span>
      </div>
      <div class="advice-msg">${esc(noEmoji(a.message))}</div>
      <div class="advice-foot">
        ${a.category ? `<span class="chip chip-cat">${esc(a.category)}</span>` : ''}
        <span class="chip chip-prio">${esc(prio)}</span>
      </div>
    </div>`;
  return el;
}

function updateRelTimes() {
  const now = Date.now();
  document.querySelectorAll('.rel').forEach((el) => {
    const at = parseInt(el.dataset.at, 10);
    const s = Math.max(0, Math.round((now - at) / 1000));
    el.textContent = s < 3 ? "à l'instant" : s < 60 ? `il y a ${s}s` : `il y a ${Math.floor(s / 60)}m`;
  });
}

// Couleur d'une probabilité de win (vert >55, rouge <47).
function wpClass(wp) {
  if (wp == null) return '';
  if (wp >= 55) return 'wp-good';
  if (wp < 47) return 'wp-bad';
  return 'wp-mid';
}

// ── Champ select ────────────────────────────────────────────────────────────
function renderChampSelect(pick) {
  $('myRole').textContent = pick.myRoleLabel || '';

  // Bandeau autofill (rôle hors de ta pool) — conseils ajustés vers la sûreté.
  const af = $('autofillBanner');
  if (af) {
    if (pick.autofilled && pick.autofillNote) {
      af.innerHTML = `${iconSvg('alert', 'ic-amber')} <span>${esc(pick.autofillNote)}</span>`;
      af.classList.remove('hidden');
    } else {
      af.innerHTML = '';
      af.classList.add('hidden');
    }
  }

  const lane = $('laneOpponent');
  lane.innerHTML = pick.laneOpponent
    ? `Adversaire de lane : <strong>${esc(pick.laneOpponent.name)}</strong>`
    : 'Adversaire de lane : non encore choisi';

  // Bans conseillés
  const banEl = $('banSuggest');
  if (banEl) {
    const bans = pick.banSuggestions || [];
    banEl.innerHTML = bans.length
      ? bans
          .map(
            (b) =>
              `<span class="ban-chip" title="${esc(b.reason || '')}">${b.portrait ? `<img src="${b.portrait}" alt="" onerror="this.remove()"/>` : ''}<span>${esc(b.name)}</span></span>`
          )
          .join('')
      : '<span class="profile-line">En attente des picks adverses…</span>';
  }

  // Sorts d'invoc + runes adaptés au matchup ET à toute l'équipe adverse
  // (règles, instantané — pas d'attente IA). Le plan IA affine ensuite.
  const setupEl = $('matchupSetup');
  if (setupEl) {
    const s = pick.recommendedSetup;
    if (s && (s.summoners || s.runes)) {
      const forWho = s.forChampion ? ` <span class="ms-for">${esc(s.forChampion.name)}</span>` : '';
      const notes = (s.notes && s.notes.length ? s.notes : [s.summonerNote, s.runeNote].filter(Boolean))
        .map((n) => `<li>${esc(n)}</li>`)
        .join('');
      setupEl.innerHTML = `
        <h3 class="sub">${iconSvg('sliders')} Sorts d'invoc &amp; runes (matchup + équipe)${forWho}</h3>
        <div class="ms-card">
          ${s.summoners ? `<div class="ms-row"><span class="ms-k">${iconSvg('flame')} Sorts</span><span class="ms-v">${esc(s.summoners)}</span></div>` : ''}
          ${s.runes ? `<div class="ms-row"><span class="ms-k">${iconSvg('tree')} Runes</span><span class="ms-v">${esc(s.runes)}</span></div>` : ''}
          ${notes ? `<ul class="ms-notes">${notes}</ul>` : ''}
        </div>`;
    } else {
      setupEl.innerHTML = '';
    }
  }

  // Plan de lane détaillé (IA) — apparaît dès qu'il est prêt.
  const mp = $('matchupPlan');
  if (mp) {
    const p = pick.matchupPlan;
    if (p) {
      const dangers = (p.dangers || []).map((d) => `<li>${esc(d)}</li>`).join('');
      mp.innerHTML = `
        <h3 class="sub">${iconSvg('map')} Plan de lane (IA)</h3>
        <div class="mplan-card">
          <div class="mplan-row"><span class="mplan-k">Lane</span><span>${esc(p.lanePlan)}</span></div>
          ${p.summoners ? `<div class="mplan-row"><span class="mplan-k">Sorts d'invoc</span><span>${esc(p.summoners)}</span></div>` : ''}
          ${p.runes ? `<div class="mplan-row"><span class="mplan-k">Runes</span><span>${esc(p.runes)}</span></div>` : ''}
          ${p.winCondition ? `<div class="mplan-row"><span class="mplan-k">Win condition</span><span>${esc(p.winCondition)}</span></div>` : ''}
          ${p.powerSpikes ? `<div class="mplan-row"><span class="mplan-k">Spikes</span><span>${esc(p.powerSpikes)}</span></div>` : ''}
          ${dangers ? `<div class="mplan-danger"><b>${iconSvg('alert','ic-amber')} Dangers</b><ul>${dangers}</ul></div>` : ''}
        </div>`;
    } else {
      mp.innerHTML = '';
    }
  }

  const heading = $('pickHeading');
  if (heading) heading.innerHTML = pick.picksFromPool ? iconSvg('target') + ' Tes picks (ta pool)' : 'Picks conseill\u00e9s';

  const unres = $('poolUnresolved');
  if (unres) {
    unres.textContent =
      pick.poolUnresolved && pick.poolUnresolved.length
        ? `Non reconnus dans ta pool (nouveau champion ?) : ${pick.poolUnresolved.join(', ')}`
        : '';
  }

  const grid = $('pickSuggestions');
  grid.innerHTML = '';
  if (!pick.pickSuggestions || !pick.pickSuggestions.length) {
    grid.innerHTML = '<div class="empty">En attente des picks adverses…</div>';
  } else {
    pick.pickSuggestions.forEach((p, i) => {
      const el = document.createElement('div');
      el.className = 'pick' + (i === 0 ? ' top-pick' : '');
      const wp = p.winProb != null ? `<span class="pick-wp ${wpClass(p.winProb)}">${p.winProb}%<small>win est.</small></span>` : '';
      el.innerHTML = `
        ${p.portrait ? `<img src="${p.portrait}" alt="" onerror="this.style.visibility='hidden'"/>` : ''}
        <div class="pick-info">
          <div class="pick-name">${esc(p.name)} ${i === 0 ? '<span class="pick-rank">' + iconSvg('star') + ' TOP</span>' : ''}</div>
          <div class="pick-reasons">${esc((p.reasons || []).join(' · ') || 'pick solide')}</div>
        </div>
        ${wp}`;
      grid.appendChild(el);
    });
  }
  // Probabilité de win projetée (avec le pick conseillé).
  const wpBadge = $('teamWinProb');
  if (wpBadge) {
    if (pick.teamWinProb != null) {
      const note = pick.winProbGrounded ? '(basé sur winrate réel de matchup)' : '(estimation indicative)';
      wpBadge.innerHTML = `Probabilité de win avec le pick conseillé : <b class="${wpClass(pick.teamWinProb)}">${pick.teamWinProb}%</b> <span class="wp-note">${note}</span>`;
    } else {
      wpBadge.innerHTML = '';
    }
  }

  const enemyRow = $('enemyChamps');
  enemyRow.innerHTML = '';
  (pick.enemyChamps || []).forEach((c) => {
    const chip = document.createElement('div');
    chip.className = 'champ-chip';
    chip.innerHTML = `${c.portrait ? `<img src="${c.portrait}" alt="" onerror="this.remove()"/>` : ''}<span>${esc(c.name)}</span>`;
    enemyRow.appendChild(chip);
  });
  if (!(pick.enemyChamps || []).length) enemyRow.innerHTML = '<span class="profile-line">Aucun champion adverse encore visible.</span>';

  const prof = $('enemyProfile');
  const parts = [];
  if (pick.enemyComp) parts.push(`Adverse : ${esc(pick.enemyComp.profile)} · CC ${esc(pick.enemyComp.ccLevel)} · burst ${esc(pick.enemyComp.burstLevel)}`);
  if (pick.teamComp) parts.push(`Ton équipe : ${esc(pick.teamComp.profile)}`);
  prof.innerHTML = parts.join('<br>');

  const build = $('buildSuggestions');
  build.innerHTML = '';
  (pick.buildSuggestions || []).forEach((b) => {
    const li = document.createElement('li');
    li.innerHTML = `<b>${esc(b.item)}</b> — <span>${esc(b.reason)}</span>`;
    build.appendChild(li);
  });
  if (!(pick.buildSuggestions || []).length) build.innerHTML = '<li><span>Build en attente de la composition adverse.</span></li>';

  const runes = $('runeHints');
  runes.innerHTML = '';
  (pick.runeHints || []).forEach((h) => {
    const d = document.createElement('div');
    d.className = 'rune-hint';
    d.textContent = h;
    runes.appendChild(d);
  });
}

// ── In game ─────────────────────────────────────────────────────────────────
function renderInGame(game) {
  // Objectifs : on mémorise pour le compte à rebours local
  latestObjectives = (game.objectives || []).map((o) => ({ ...o }));
  objReceivedAt = Date.now();
  renderObjectives();

  $('gameTime').textContent = game.summary ? game.summary.gameTimeText : '';

  // Stats joueur
  const s = game.summary && game.summary.me;
  const stats = $('myStats');
  stats.innerHTML = '';
  if (s) {
    const items = [
      ['Champion', s.champion],
      ['Niveau', s.level],
      ['KDA', s.kda],
      ['KP', s.kp != null ? s.kp + '%' : '—'],
      ['CS', `${s.cs} (${s.csPerMin}/min)`],
      ['Or', s.gold != null ? s.gold : '—'],
      ['PV', s.hpPct != null ? s.hpPct + '%' : '—'],
    ];
    items.forEach(([k, v]) => {
      const d = document.createElement('div');
      d.className = 'stat';
      d.innerHTML = `${k} : <b>${esc(String(v))}</b>`;
      stats.appendChild(d);
    });
  }

  renderRisk(game.summary && game.summary.risk);
  renderCsTracker(s, game.benchmark, game.milestones);
  renderRankCard();
  renderObjectivesTaken(game.summary);
  renderRecall(game.summary);

  renderGoldLead(game.summary);
  renderTeam('allies', game.scoreboard ? game.scoreboard.allies : []);
  renderTeam('enemies', game.scoreboard ? game.scoreboard.enemies : []);

  renderHudBuys(game.itemPlan);
  renderCombat(game);
  renderItemPlan(game.itemPlan);
  renderTimers(game.scoreboard ? game.scoreboard.enemies : []);
}

// ── Duel : proba de trade / all-in (interactif) ─────────────────────────────
// L'API live ne donne ni positions ni vision : TU choisis qui tu affrontes
// (clique les portraits) et combien d'alliés sont proches — le calcul s'actualise.
const combatSel = { keys: null, allies: 0, sig: null };
const combatVoice = { band: null, at: 0 }; // pour la lecture auto (transition de bande)
let lastCombatGame = null;

// Persistance de la sélection de cible/alliés (mémorisée entre fights et reloads),
// par signature d'équipe adverse (localStorage).
function combatKey(sig) { return 'coach_combat_' + sig; }
function saveCombatSel() {
  try {
    if (combatSel.sig) localStorage.setItem(combatKey(combatSel.sig), JSON.stringify({ keys: [...combatSel.keys], allies: combatSel.allies }));
  } catch { /* stockage indispo */ }
}
function loadCombatSel(sig, enemies, combat) {
  try {
    const raw = localStorage.getItem(combatKey(sig));
    if (raw) {
      const o = JSON.parse(raw);
      const valid = new Set((enemies || []).map((e) => e.championKey));
      const keys = (o.keys || []).filter((k) => valid.has(k));
      if (keys.length) return { keys: new Set(keys), allies: Math.max(0, Math.min(4, o.allies || 0)) };
    }
  } catch { /* ignore */ }
  const def = combat && combat.defaultTargetKey;
  return { keys: new Set(def ? [def] : (enemies[0] ? [enemies[0].championKey] : [])), allies: 0 };
}

function renderCombat(game) {
  lastCombatGame = game;
  const el = $('combatBody');
  if (!el) return;
  const enemies = (game.scoreboard && game.scoreboard.enemies) || [];
  const meS = game.summary && game.summary.me;
  const combat = game.summary && game.summary.combat;
  if (!enemies.length || !meS) { el.innerHTML = '<div class="rc-empty">En attente des données de partie…</div>'; return; }

  // Restaure la sélection mémorisée pour cette équipe (ou défaut = adversaire de lane).
  const teamSig = enemies.map((e) => e.championKey).join(',');
  if (combatSel.keys === null || combatSel.sig !== teamSig) {
    combatSel.sig = teamSig;
    const restored = loadCombatSel(teamSig, enemies, combat);
    combatSel.keys = restored.keys;
    combatSel.allies = restored.allies;
    combatVoice.band = null; // réinitialise la lecture auto pour cette équipe
  }

  // Ne re-render que si les données pertinentes OU la sélection ont changé
  // (évite le scintillement et l'interruption des clics à chaque tick).
  const renderSig = [
    teamSig, meS.level, meS.hpPct, meS.netWorth, meS.hasUlt, meS.hasSpike,
    enemies.map((e) => `${e.level}:${e.itemGold}:${e.isDead ? 1 : 0}`).join(','),
    [...combatSel.keys].sort().join('|'), combatSel.allies,
  ].join('#');
  if (combatSel.renderSig === renderSig) return;
  combatSel.renderSig = renderSig;

  const targets = enemies.filter((e) => combatSel.keys.has(e.championKey));
  const duel = targets.length && window.Combat
    ? window.Combat.computeDuel({
        me: { level: meS.level, hpPct: meS.hpPct, netWorth: meS.netWorth, hasUlt: meS.hasUlt, hasSpike: meS.hasSpike },
        targets: targets.map((t) => ({ name: t.championDisplay || t.champion, level: t.level, netWorth: t.itemGold, ...(t.traits || {}) })),
        alliesNearby: combatSel.allies,
      })
    : null;

  // Portraits ennemis cliquables (icône du champion = stylé).
  const portraits = enemies
    .map((e) => {
      const on = combatSel.keys.has(e.championKey) ? ' cbt-on' : '';
      const dead = e.isDead ? ' cbt-dead' : '';
      const img = e.portrait ? `<img src="${esc(e.portrait)}" alt="" onerror="this.style.visibility='hidden'"/>` : '';
      return `<button class="cbt-portrait${on}${dead}" data-key="${e.championKey}" title="${esc(e.championDisplay || e.champion)}">${img}<span class="cbt-lvl">${e.level || ''}</span></button>`;
    })
    .join('');
  const allyBtns = [0, 1, 2, 3, 4]
    .map((n) => `<button class="cbt-ally${combatSel.allies === n ? ' cbt-ally-on' : ''}" data-allies="${n}">+${n}</button>`)
    .join('');

  let odds = '<div class="rc-empty">Sélectionne au moins un adversaire.</div>';
  if (duel) {
    const bar = (label, val) => {
      const cls = val >= 60 ? 'cs-good' : val <= 42 ? 'cs-bad' : 'cs-mid';
      return `<div class="cbt-odds">
        <div class="cbt-odds-top"><span>${label}</span><b class="${cls}">${val}%</b></div>
        <div class="cs-bar"><div class="cs-fill ${cls}" style="width:${val}%"></div></div>
      </div>`;
    };
    const factors = (duel.factors.allIn || [])
      .slice()
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 3)
      .map((f) => `<span class="cbt-fac ${f.delta >= 0 ? 'cs-good' : 'cs-bad'}">${esc(f.label)} ${f.delta >= 0 ? '+' : ''}${Math.round(f.delta)}</span>`)
      .join('');
    odds = `
      <div class="cbt-numbers">Combat <b>${duel.numbers}</b> · <span class="cbt-verdict cbt-${duel.verdict}">${duel.verdict}</span>
        <button class="cbt-read" title="Lire la reco à voix haute">${iconSvg('volume')}</button></div>
      ${bar('Trade court', duel.trade)}
      ${bar('All-in', duel.allIn)}
      <div class="cbt-facs">${factors}</div>`;

    // Lecture vocale AUTO : quand la bande d'all-in bascule (favorable/défavorable),
    // au plus une fois toutes les 8 s, si la voix est activée.
    const band = duel.allIn >= 65 ? 'fav' : duel.allIn <= 38 ? 'def' : 'neu';
    if (combatVoice.band !== null && band !== 'neu' && band !== combatVoice.band && tts.enabled && Date.now() - combatVoice.at > 8000) {
      combatVoice.at = Date.now();
      speakCombat(duel);
    }
    combatVoice.band = band;
    combatSel.lastDuel = duel;
  }

  el.innerHTML = `
    <div class="cbt-label">Qui affrontes-tu ? (clique)</div>
    <div class="cbt-portraits">${portraits}</div>
    <div class="cbt-allies"><span>Alliés proches :</span>${allyBtns}</div>
    ${odds}
    ${combat && combat.combo ? `<div class="cbt-combo"><b>${iconSvg('swords')} Combo</b> ${esc(combat.combo)}</div>` : ''}
    <div class="cbt-note">Estimation (or/objets, niveau, PV, spikes, sorts, nombre). L'API ne voit pas la map : à toi de sélectionner la cible.</div>`;
  if (window.hydrateIcons) hydrateIcons();
}
// Énonce la reco de combat (trade/all-in) via la synthèse vocale.
function speakCombat(duel) {
  if (!duel) return;
  const best = duel.allIn >= duel.trade ? { k: 'all-in', v: duel.allIn } : { k: 'trade', v: duel.trade };
  const dir = duel.verdict === 'favorable' ? 'favorable' : duel.verdict === 'défavorable' ? 'défavorable, recule' : 'équilibré';
  speak(`${best.k} ${dir}. ${best.v} pour cent en ${duel.numbers}.`);
}

// Délégation de clic pour le panneau de duel (portraits + alliés + lecture).
document.addEventListener('click', (ev) => {
  if (!ev.target.closest) return;
  const p = ev.target.closest('.cbt-portrait');
  if (p && combatSel.keys) {
    const k = Number(p.dataset.key);
    if (combatSel.keys.has(k)) combatSel.keys.delete(k);
    else combatSel.keys.add(k);
    saveCombatSel();
    if (lastCombatGame) renderCombat(lastCombatGame);
    return;
  }
  const a = ev.target.closest('.cbt-ally');
  if (a) {
    combatSel.allies = Number(a.dataset.allies) || 0;
    saveCombatSel();
    if (lastCombatGame) renderCombat(lastCombatGame);
    return;
  }
  if (ev.target.closest('.cbt-read')) {
    speakCombat(combatSel.lastDuel);
  }
});

// ── Panneaux réductibles / masquables (chaque overlay individuellement) ─────
// Ajoute un bouton "réduire" à chaque panneau ; l'état est mémorisé (localStorage).
function panelKey(panel) {
  const t = panel.querySelector('.panel-title');
  const base = (t ? t.textContent : panel.id || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return base || 'panel';
}
function loadCollapsed() {
  try { return new Set(JSON.parse(localStorage.getItem('coach_collapsed') || '[]')); } catch { return new Set(); }
}
function saveCollapsed(set) {
  try { localStorage.setItem('coach_collapsed', JSON.stringify([...set])); } catch { /* ignore */ }
}
function initPanelControls() {
  const collapsed = loadCollapsed();
  const panels = document.querySelectorAll('#inGame .panel, #champSelect.panel, #champSelect .panel');
  panels.forEach((panel) => {
    const title = panel.querySelector('.panel-title');
    if (!title || title.querySelector('.panel-collapse')) return;
    const key = panelKey(panel);
    panel.dataset.pkey = key;
    const btn = document.createElement('button');
    btn.className = 'panel-collapse';
    btn.type = 'button';
    btn.title = 'Réduire / afficher ce panneau';
    btn.setAttribute('aria-label', 'Réduire ce panneau');
    title.appendChild(btn);
    const paint = () => {
      const isC = panel.classList.contains('panel-collapsed');
      btn.innerHTML = iconSvg(isC ? 'maximize' : 'minimize');
      if (window.hydrateIcons) hydrateIcons();
    };
    if (collapsed.has(key)) panel.classList.add('panel-collapsed');
    paint();
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.classList.toggle('panel-collapsed');
      const set = loadCollapsed();
      if (panel.classList.contains('panel-collapsed')) set.add(key); else set.delete(key);
      saveCollapsed(set);
      paint();
    });
  });
}
document.addEventListener('DOMContentLoaded', initPanelControls);

// Cycle la cible du duel vers l'ennemi VIVANT précédent/suivant (dir = -1 / +1).
// Sélection unique (remplace) — pensé pour les flèches gauche/droite en jeu.
// Exposé en global pour être appelé par le raccourci global Electron.
window.coachCycleTarget = function (dir) {
  if (!lastCombatGame || !combatSel.keys) return;
  const enemies = (lastCombatGame.scoreboard && lastCombatGame.scoreboard.enemies) || [];
  const alive = enemies.filter((e) => !e.isDead);
  const list = alive.length ? alive : enemies;
  if (!list.length) return;
  let idx = list.findIndex((e) => combatSel.keys.has(e.championKey));
  if (idx < 0) idx = dir > 0 ? -1 : 0;
  const next = list[(idx + dir + list.length) % list.length];
  combatSel.keys = new Set([next.championKey]);
  saveCombatSel();
  renderCombat(lastCombatGame);
  flashCombatTarget(next.championDisplay || next.champion);
};

// Petit repère visuel (et vocal si activé) du changement de cible.
function flashCombatTarget(name) {
  let t = $('cbtToast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'cbtToast';
    t.className = 'cbt-toast';
    document.body.appendChild(t);
  }
  t.innerHTML = `${iconSvg('target')} Cible : <b>${esc(name)}</b>`;
  if (window.hydrateIcons) hydrateIcons();
  t.classList.remove('show');
  void t.offsetWidth;
  t.classList.add('show');
  clearTimeout(flashCombatTarget._to);
  flashCombatTarget._to = setTimeout(() => t.classList.remove('show'), 1400);
}

// Flèches gauche/droite quand la fenêtre du coach a le focus (2e écran / alt-tab).
// En jeu (League focus), c'est le raccourci global Electron qui appelle la fonction.
document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
  const el = document.activeElement;
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
  const ig = document.getElementById('inGame');
  if (ig && !ig.classList.contains('hidden')) {
    ev.preventDefault();
    window.coachCycleTarget(ev.key === 'ArrowLeft' ? -1 : 1);
  }
});

// ── 3 prochains achats (icônes réelles) — bandeau HUD/overlay ───────────────
function renderHudBuys(plan) {
  const el = $('hudBuys');
  if (!el) return;
  if (!plan || !plan.next || !plan.next.length) { el.classList.add('hidden'); el.innerHTML = ''; return; }
  el.classList.remove('hidden');
  const chips = plan.next
    .map((it, i) => {
      const prio = it.priority ? ' hb-prio' : '';
      const img = it.icon
        ? `<img src="${esc(it.icon)}" alt="" loading="lazy" onerror="this.style.display='none'"/>`
        : `<span class="hb-noimg">${iconSvg('cart')}</span>`;
      const badge = it.priority ? `<span class="hb-badge">${iconSvg('shield')} prioritaire</span>` : '';
      return `<div class="hb-item${prio}" title="${esc(it.name || '')}">
          <span class="hb-step">${i + 1}</span>${img}
          <span class="hb-txt"><span class="hb-name">${esc(it.name || '')}</span>${badge}</span>
        </div>`;
    })
    .join('');
  const prioReason = (plan.next.find((n) => n.priority && n.reason) || {}).reason;
  el.innerHTML = `
    <div class="hb-head">${iconSvg('cart')} Prochains achats</div>
    <div class="hb-row">${chips}</div>
    ${prioReason ? `<div class="hb-reason">${iconSvg('shield', 'ic-amber')} ${esc(prioReason)}</div>` : ''}`;
  if (window.hydrateIcons) hydrateIcons();
}

// ── Objectifs pris (dragons / tours / baron) + plaques ──────────────────────
function renderObjectivesTaken(summary) {
  const el = $('objectivesTaken');
  if (!el || !summary) return;
  const o = summary.objectivesTaken;
  const chips = [];
  const chip = (icon, label, ally, enemy) => {
    const cls = ally > enemy ? 'ot-good' : enemy > ally ? 'ot-bad' : 'ot-even';
    return `<span class="ot-chip ${cls}">${iconSvg(icon)} ${label} <b>${ally}</b><span class="ot-sep">–</span><b>${enemy}</b></span>`;
  };
  if (o) {
    chips.push(chip('dragon', 'Drakes', o.dragons.ally, o.dragons.enemy));
    chips.push(chip('shield', 'Tours', o.towers.ally, o.towers.enemy));
    if (o.baron && (o.baron.ally || o.baron.enemy)) chips.push(chip('baron', 'Nashor', o.baron.ally, o.baron.enemy));
  }
  // Fenêtre de plaques (avant 14:00).
  if (summary.plates && summary.plates.active) {
    const left = summary.plates.secondsLeft;
    const mm = Math.floor(left / 60), ss = String(left % 60).padStart(2, '0');
    const urgent = left <= 90 ? ' ot-plate-urgent' : '';
    chips.push(`<span class="ot-chip ot-plate${urgent}">${iconSvg('shield')} Plaques ${mm}:${ss}</span>`);
  }
  el.innerHTML = chips.join('');
  if (window.hydrateIcons) hydrateIcons();
}

// ── Alerte move risqué (ping ATTENTION) ─────────────────────────────────────
let lastRiskKey = null;
let lastRiskAt = 0;
function renderRisk(risk) {
  const el = $('riskBanner');
  if (!el) return;
  if (!risk) {
    el.classList.add('hidden');
    el.innerHTML = '';
    lastRiskKey = null;
    return;
  }
  const key = risk.title;
  el.className = 'risk-banner ' + (risk.level === 'danger' ? 'risk-danger' : 'risk-warn');
  el.innerHTML =
    `<span class="risk-ic">${iconSvg('alert')}</span>` +
    `<span class="risk-txt"><b>ATTENTION — ${esc(risk.title)}</b>${risk.message ? `<span>${esc(risk.message)}</span>` : ''}</span>`;
  // Ping (bip + flash) seulement à l'apparition d'un NOUVEAU risque, pas à chaque tick.
  const now = Date.now();
  if (key !== lastRiskKey && now - lastRiskAt > 4000) {
    lastRiskKey = key;
    lastRiskAt = now;
    if (risk.level === 'danger') { beep(300, 180); setTimeout(() => beep(300, 180), 230); }
    else beep(420, 160);
    el.classList.remove('risk-flash');
    void el.offsetWidth; // relance l'animation
    el.classList.add('risk-flash');
    notify('ATTENTION', risk.title);
    if (tts.enabled) speak('Attention, ' + risk.title);
  }
}

// ── Suivi CS/min (objectif 10) + benchmark rythme de win + jalons 10/20 min ──
function renderCsTracker(s, benchmark, milestones) {
  const el = $('csTracker');
  if (!el) return;
  if (!s) { el.innerHTML = ''; return; }
  // Comparaison à ton rythme des games GAGNÉES (si l'historique le permet).
  let bench = '';
  if (benchmark && benchmark.csPerMin) {
    const d = benchmark.csPerMin.delta;
    const cls = d >= 0 ? 'cs-good' : 'cs-bad';
    bench = `<div class="cs-bench">vs ton rythme de win (${benchmark.csPerMin.win}/min) : <span class="${cls}">${d >= 0 ? '+' : ''}${d}</span></div>`;
  }
  // Jalons de CS figés à 10:00 / 20:00 (repères de farm vs objectif).
  let mile = '';
  if (milestones && (milestones.m10 || milestones.m20)) {
    const chip = (label, mm) => {
      if (!mm) return '';
      const cls = mm.delta >= 0 ? 'cs-good' : 'cs-bad';
      return `<span class="cs-mile"><b>${label}</b> ${mm.cs} <span class="${cls}">(${mm.delta >= 0 ? '+' : ''}${mm.delta})</span></span>`;
    };
    mile = `<div class="cs-miles">${chip('@10', milestones.m10)}${chip('@20', milestones.m20)}<span class="cs-mile-note">vs objectif ${milestones.pace}/min</span></div>`;
  }
  if (s.csIsJungle) {
    el.innerHTML = `<div class="cs-head"><span class="ic" data-ic="swords"></span> CS/min <b>${s.csPerMin}</b> <span class="cs-note">(jungle)</span></div>${bench}${mile}`;
    if (window.hydrateIcons) hydrateIcons();
    return;
  }
  const target = s.csTarget || 10;
  const pctBar = Math.max(0, Math.min(100, (s.csPerMin / target) * 100));
  const delta = s.cs - (s.csExpected || 0); // vs le rythme 10/min
  const cls = s.csPerMin >= target ? 'cs-good' : s.csPerMin >= target * 0.7 ? 'cs-mid' : 'cs-bad';
  const deltaTxt =
    delta >= 0
      ? `<span class="cs-good">+${delta} CS d'avance</span> sur le rythme 10/min`
      : `<span class="cs-bad">${delta} CS</span> sous le rythme 10/min`;
  el.innerHTML = `
    <div class="cs-head"><span class="ic" data-ic="swords"></span> CS/min
      <b class="${cls}">${s.csPerMin}</b> <span class="cs-target">/ ${target} objectif</span>
    </div>
    <div class="cs-bar"><div class="cs-fill ${cls}" style="width:${pctBar}%"></div><div class="cs-goal"></div></div>
    <div class="cs-sub">${s.cs} CS · ${deltaTxt}</div>${bench}${mile}`;
  if (window.hydrateIcons) hydrateIcons();
}

// ── Planificateur de recall + timing des vagues ─────────────────────────────
function renderRecall(summary) {
  const el = $('recallBody');
  if (!el || !summary) return;
  const w = summary.waves;
  const r = summary.recall;
  const parts = [];
  if (w && w.nextCannonSeconds != null) {
    const urgent = w.nextCannonSeconds <= 20 ? ' rc-cannon-soon' : '';
    parts.push(`<div class="rc-wave${urgent}">${iconSvg('swords')} Vague de canon dans <b>${mmssShort(w.nextCannonSeconds)}</b></div>`);
  }
  if (r) {
    const pctCls = r.affordable ? 'cs-good' : 'cs-mid';
    parts.push(`
      <div class="rc-item">
        <div class="rc-item-head">${iconSvg('cart')} Prochain achat : <b>${esc(r.item.name)}</b>
          <span class="rc-gold">${r.gold} / ${r.item.cost} or</span></div>
        <div class="cs-bar"><div class="cs-fill ${pctCls}" style="width:${r.pct}%"></div></div>
        <div class="rc-tip ${r.affordable ? 'rc-ready' : ''}">${esc(r.tip)}</div>
        ${r.objectiveReset ? `<div class="rc-reset">${iconSvg('alert', 'ic-amber')} ${esc(r.objectiveReset)}</div>` : ''}
      </div>`);
  }
  if (!parts.length) parts.push('<div class="rc-empty">Recall optimal et vagues s’affichent en partie (or + objets résolus).</div>');
  el.innerHTML = parts.join('');
  if (window.hydrateIcons) hydrateIcons();
}
function mmssShort(sec) {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return m ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}

// ── Carte de rang (emblème + LP + games à Master) ───────────────────────────
let rankCache = null;
let rankFetchedAt = 0;
function renderRankCard() {
  const el = $('rankCard');
  if (!el) return;
  const now = Date.now();
  // Rafraîchit toutes les ~3 min si on a déjà des données ; retente vite sinon.
  if (now - rankFetchedAt > (rankCache ? 180000 : 5000)) {
    rankFetchedAt = now;
    fetch('/api/riot/profile')
      .then((r) => r.json())
      .then((d) => {
        rankCache = d && d.enabled && d.profile ? d.profile : (d || { enabled: false });
        paintRankCard();
      })
      .catch(() => {});
  }
  paintRankCard();
}
const TIER_FR_HUD = { IRON: 'Fer', BRONZE: 'Bronze', SILVER: 'Argent', GOLD: 'Or', PLATINUM: 'Platine', EMERALD: 'Émeraude', DIAMOND: 'Diamant', MASTER: 'Maître', GRANDMASTER: 'Grand Maître', CHALLENGER: 'Challenger' };
const TIER_COLOR = { IRON: '#7a6a5d', BRONZE: '#b3743c', SILVER: '#9aa8b4', GOLD: '#f0b330', PLATINUM: '#3fb6a8', EMERALD: '#2ecc71', DIAMOND: '#4aa3e0', MASTER: '#b15cff', GRANDMASTER: '#e0403e', CHALLENGER: '#f4c95d' };
function rankCrestSvg(tier, size) {
  const c = TIER_COLOR[tier] || '#8aa';
  const s = size || 46;
  // Petit blason SVG coloré par palier — fallback garanti si l'emblème CDN ne charge pas.
  return `<svg width="${s}" height="${s}" viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="rg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="#0b0f1a"/></linearGradient></defs><path d="M24 3l17 6v13c0 11-7.5 18.5-17 23C14.5 41.5 7 34 7 22V9z" fill="url(#rg)" stroke="${c}" stroke-width="1.6"/><path d="M24 13l5.5 10L24 33l-5.5-10z" fill="${c}" opacity=".9"/></svg>`;
}
function paintRankCard() {
  const el = $('rankCard');
  if (!el) return;
  const d = rankCache;
  if (!d) return;
  if (d.enabled === false) {
    el.innerHTML = `<div class="rank-empty">${iconSvg('gamepad')} Rang : ajoute <code>RIOT_ID</code> + <code>RIOT_API_KEY</code> au <code>.env</code> (clé dev = 24 h).</div>`;
    return;
  }
  if (d.error) {
    const hint = /manquant|Riot ID/i.test(d.error)
      ? 'ajoute <code>RIOT_ID</code> (format « Pseudo#TAG ») au <code>.env</code>'
      : /expir|invalide/i.test(d.error)
        ? 'clé Riot expirée — régénère-la (dev = 24 h)'
        : esc(d.error);
    el.innerHTML = `<div class="rank-empty">${iconSvg('gamepad')} Rang indisponible : ${hint}.</div>`;
    return;
  }
  const r = d.rank;
  if (!r) { el.innerHTML = `<div class="rank-empty">${esc(d.riotId || '')} · non classé cette saison</div>`; return; }
  const tierFr = TIER_FR_HUD[r.tier] || r.tier;
  const games = (r.wins || 0) + (r.losses || 0);
  const wr = games ? Math.round((r.wins / games) * 100) : 0;
  // Blason SVG coloré en base (repli) + vraie image d'emblème LoL par-dessus.
  // À la charge de l'image officielle, on masque le blason ; sinon (hors-ligne)
  // l'image se retire et le blason reste visible.
  const crest = rankCrestSvg(r.tier);
  const emblem =
    `<span class="rank-emblem-stack">${crest}` +
    (r.emblem
      ? `<img class="rank-emblem" src="${r.emblem}" alt="${esc(tierFr)}" onload="var c=this.previousElementSibling; if(c) c.style.opacity=0;" onerror="this.remove()"/>`
      : '') +
    `</span>`;
  let climb = '';
  if (r.toMaster && r.toMaster.reached) {
    climb = `<span class="rank-climb rank-master">${iconSvg('trophy')} Master atteint</span>`;
  } else if (r.toMaster) {
    climb = `<span class="rank-climb">${iconSvg('trophy')} <b>${r.toMaster.gamesToWin}</b> games à win → Master <span class="rank-climb-lp">(${r.toMaster.remainingLp} LP)</span></span>`;
  }
  el.innerHTML = `
    <div class="rank-emblem-wrap" style="--tier:${TIER_COLOR[r.tier] || '#8aa'}">${emblem}</div>
    <div class="rank-body">
      <div class="rank-line1"><b class="rank-tier">${esc(tierFr)} ${esc(r.rank || '')}</b> <span class="rank-lp">${r.lp} LP</span></div>
      <div class="rank-line2">${r.wins}V/${r.losses}D · <b class="${wr >= 50 ? 'cs-good' : 'cs-bad'}">${wr}%</b></div>
      ${climb}
    </div>`;
}

// ── Timers Flash / ultimes ennemis ───────────────────────────────────────────
let cooldowns = { flashSeconds: 300, ult: {} };
const spellTimers = {}; // `${champId}|flash|ult` -> endsAt (ms)
const timerAlerted = {};
let timersSig = '';

function fetchCooldowns() {
  fetch('/api/cooldowns')
    .then((r) => r.json())
    .then((d) => { if (d && d.ult) cooldowns = d; })
    .catch(() => {});
}

function renderTimers(enemies) {
  const list = $('timersList');
  if (!list) return;
  enemies = enemies || [];
  const sig = enemies.map((e) => e.championId || e.champion).join(',');
  if (sig === timersSig) return; // ne reconstruit que si la liste change
  timersSig = sig;
  if (!enemies.length) {
    list.innerHTML = '<div class="dex-none">En attente des adversaires…</div>';
    return;
  }
  list.innerHTML = enemies
    .map((e) => {
      const id = e.championId || e.champion;
      const name = esc(e.championDisplay || e.champion);
      const ult = cooldowns.ult && cooldowns.ult[id];
      return `<div class="timer-row" data-id="${esc(String(id))}">
        <span class="timer-name">${name}</span>
        <button class="timer-btn flash" data-key="${esc(id + '|flash')}" data-cd="flash">Flash</button>
        ${ult ? `<button class="timer-btn ult" data-key="${esc(id + '|ult')}" data-cd="ult" data-secs="${ult}">Ulti</button>` : '<span class="timer-na">ulti —</span>'}
      </div>`;
    })
    .join('');
}

let junglerSeenAt = 0;
function updateTimers() {
  const now = Date.now();
  const running = {}; // champId -> {flash, ult}
  document.querySelectorAll('#timersList .timer-btn').forEach((btn) => {
    const key = btn.dataset.key;
    const base = btn.dataset.cd === 'flash' ? 'Flash' : 'Ulti';
    const champId = key.split('|')[0];
    const ends = spellTimers[key];
    if (!ends) {
      btn.textContent = base;
      btn.classList.remove('running', 'ready');
      return;
    }
    const rem = Math.round((ends - now) / 1000);
    if (rem > 0) {
      btn.textContent = `${base} ${mmss(rem)}`;
      btn.classList.add('running');
      btn.classList.remove('ready');
      (running[champId] = running[champId] || {})[btn.dataset.cd] = true;
      if (rem <= 8 && !timerAlerted[key] && tts.enabled) {
        timerAlerted[key] = true;
        const champ = btn.closest('.timer-row').querySelector('.timer-name').textContent;
        speak(`${base} de ${champ} bientôt disponible`);
      }
    } else if (rem > -6) {
      btn.textContent = `${base} UP`;
      btn.classList.add('ready');
      btn.classList.remove('running');
    } else {
      delete spellTimers[key];
      delete timerAlerted[key];
      btn.textContent = base;
      btn.classList.remove('running', 'ready');
    }
  });

  // Fenêtre d'engage : un ennemi dont Flash ET Ulti sont down est tuable.
  const go = $('goWindow');
  if (go) {
    const targets = [];
    document.querySelectorAll('#timersList .timer-row').forEach((row) => {
      const id = row.dataset.id;
      if (running[id] && running[id].flash && running[id].ult) {
        targets.push(row.querySelector('.timer-name').textContent);
      }
    });
    if (targets.length) {
      go.classList.remove('hidden');
      go.innerHTML = `${iconSvg('dot','ic-good')} Fenêtre d'engage : <b>${targets.map(esc).join(', ')}</b> sans Flash ni Ulti — go si tu as l'avantage.`;
    } else {
      go.classList.add('hidden');
    }
  }

  // Jungler : statut de disparition.
  const jg = $('jgStatus');
  if (jg) {
    if (!junglerSeenAt) jg.textContent = 'pas encore repéré';
    else {
      const s = Math.round((now - junglerSeenAt) / 1000);
      jg.textContent = `vu il y a ${s < 60 ? s + 's' : Math.floor(s / 60) + 'm' + (s % 60) + 's'}`;
      jg.className = 'jt-status' + (s >= 30 ? ' warn' : '');
      if (s === 35 && tts.enabled) speak('Jungler adverse invisible, attention aux ganks');
    }
  }
}

function initTimers() {
  fetchCooldowns();
  const list = $('timersList');
  if (!list) return;
  // Clic = démarre/redémarre le compte à rebours ; clic droit = annule.
  list.addEventListener('click', (e) => {
    const btn = e.target.closest('.timer-btn');
    if (!btn) return;
    const key = btn.dataset.key;
    const secs = btn.dataset.cd === 'flash' ? cooldowns.flashSeconds || 300 : Number(btn.dataset.secs || 100);
    spellTimers[key] = Date.now() + secs * 1000;
    timerAlerted[key] = false;
    updateTimers();
  });
  list.addEventListener('contextmenu', (e) => {
    const btn = e.target.closest('.timer-btn');
    if (!btn) return;
    e.preventDefault();
    delete spellTimers[btn.dataset.key];
    delete timerAlerted[btn.dataset.key];
    updateTimers();
  });
  const jgBtn = $('jgSeen');
  if (jgBtn) jgBtn.addEventListener('click', () => { junglerSeenAt = Date.now(); updateTimers(); });
}

// Icône d'item (objet {name, icon}) + nom, avec repli texte si pas d'icône.
function itemIco(it, cls) {
  if (!it) return '';
  const name = it.name || '';
  return `<span class="${cls || 'plan-item'}" title="${esc(name)}">${
    it.icon ? `<img src="${esc(it.icon)}" alt="" loading="lazy" onerror="this.style.display='none'"/>` : ''
  }<span class="plan-item-name">${esc(name)}</span></span>`;
}

function renderItemPlan(plan) {
  const panel = $('itemPlanPanel');
  if (!panel) return;
  if (!plan) {
    panel.classList.add('hidden');
    return;
  }
  panel.classList.remove('hidden');
  $('itemPlanChamp').innerHTML =
    esc(plan.champion || '') + (plan.source ? ` <span class="plan-source">${esc(plan.source)}</span>` : '');

  // Runes recommandées + ajustements selon la compo adverse.
  const runesEl = $('itemPlanRunes');
  const rparts = [];
  if (plan.runes) {
    const k = plan.runes.keystone ? esc(plan.runes.keystone) : '';
    const sec = plan.runes.secondary ? ' · ' + esc(plan.runes.secondary) : '';
    rparts.push(`<div class="plan-rune-line"><span class="plan-k">Runes</span> ${k}${sec}</div>`);
  }
  if (plan.summoners) rparts.push(`<div class="plan-rune-line"><span class="plan-k">Sorts</span> ${esc(plan.summoners)}</div>`);
  if (plan.skillOrder) rparts.push(`<div class="plan-rune-line"><span class="plan-k">Sorts max</span> ${esc(plan.skillOrder)}</div>`);
  (plan.runeHints || []).forEach((h) => rparts.push(`<div class="plan-rune-hint">${iconSvg('shield')} ${esc(h)}</div>`));
  runesEl.innerHTML = rparts.join('');

  // Prochains achats : pour chaque cible, ses composants (mini-items) en dessous.
  const nextEl = $('itemPlanNext');
  if (!plan.next || !plan.next.length) {
    nextEl.innerHTML = '<div class="dex-none">Build compl\u00e9t\u00e9 </div>';
  } else {
    nextEl.innerHTML = plan.next
      .map((it, i) => {
        const comps =
          it.components && it.components.length
            ? `<div class="plan-comp">${it.components.map((c) => itemIco(c, 'plan-mini')).join('<span class="plan-plus">+</span>')}</div>`
            : '';
        const prio = it.priority
          ? `<div class="plan-prio">${iconSvg('shield', 'ic-amber')} ${esc(it.reason || 'conseillé maintenant')}</div>`
          : '';
        return `<div class="plan-next-item ${i === 0 ? 'first' : ''}${it.priority ? ' plan-prio-item' : ''}">
            <div class="plan-next-head"><span class="plan-step">${i + 1}</span>${itemIco(it, 'plan-target')}</div>
            ${prio}${comps}
          </div>`;
      })
      .join('');
  }

  // Build complet ordonné.
  const fullEl = $('itemPlanFull');
  fullEl.innerHTML = (plan.full || [])
    .map((it) => `<span class="plan-full-item">${itemIco(it)}<span class="plan-slot">${esc(it.slot || '')}</span></span>`)
    .join('<span class="plan-arrow">' + iconSvg('arrowRight') + '</span>');

  $('itemPlanStrategy').textContent = plan.strategy || '';
}

// Avance économique d'équipe : barre + sparkline du différentiel dans le temps.
let goldDiffHistory = [];
let goldDiffGame = '';
function sparkline(values, color) {
  if (values.length < 2) return '';
  const W = 120, H = 26;
  const max = Math.max(1, ...values.map((v) => Math.abs(v)));
  const x = (i) => (i * W) / (values.length - 1);
  const y = (v) => H / 2 - (v / max) * (H / 2 - 2);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" class="gl-spark" preserveAspectRatio="none"><line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" stroke="rgba(255,255,255,.12)" stroke-width="1"/><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.6"/></svg>`;
}
function renderGoldLead(summary) {
  const el = $('goldLead');
  if (!el) return;
  const tg = summary && summary.teamGold;
  if (!tg) { el.innerHTML = ''; return; }
  // reset l'historique sparkline à chaque nouvelle partie
  const gameKey = summary.gameTimeText && summary.gameTime < 60 ? 'new' : goldDiffGame;
  if (summary.gameTime != null && summary.gameTime < 30) goldDiffHistory = [];
  goldDiffGame = gameKey;
  if (!goldDiffHistory.length || goldDiffHistory[goldDiffHistory.length - 1] !== tg.diff) {
    goldDiffHistory.push(tg.diff);
    if (goldDiffHistory.length > 60) goldDiffHistory.shift();
  }
  const total = tg.allies + tg.enemies || 1;
  const allyPct = Math.round((tg.allies / total) * 100);
  const ahead = tg.diff >= 0;
  const k = (n) => (n >= 0 ? '+' : '') + (Math.round(n / 100) / 10) + 'k';
  const lane = summary.laneGold;
  el.innerHTML = `
    <div class="gl-head">
      <span>Or d'équipe (estimé)</span>
      <b class="${ahead ? 'wp-good' : 'wp-bad'}">${k(tg.diff)}</b>
      ${sparkline(goldDiffHistory, ahead ? '#34d399' : '#fb7185')}
    </div>
    <div class="gl-bar"><div class="gl-fill" style="width:${allyPct}%"></div></div>
    ${lane ? `<div class="gl-lane">Ta lane : <b class="${lane.diff >= 0 ? 'wp-good' : 'wp-bad'}">${k(lane.diff)}</b> vs ton adversaire</div>` : ''}`;
}

function renderTeam(id, players) {
  const c = $(id);
  c.innerHTML = '';
  players.forEach((p) => {
    const el = document.createElement('div');
    el.className = 'player' + (p.isYou ? ' you' : '') + (p.isDead ? ' dead' : '');
    el.innerHTML = `
      ${p.portrait ? `<img src="${p.portrait}" alt="" onerror="this.style.visibility='hidden'"/>` : ''}
      <div class="player-main">
        <div class="player-name">${esc(p.championDisplay || p.champion)}${p.isYou ? ' (toi)' : ''}</div>
        <div class="player-sub">${p.kills}/${p.deaths}/${p.assists} · ${p.cs} CS${p.isDead ? ` · mort ${p.respawnTimer}s` : ''}</div>
      </div>`;
    c.appendChild(el);
  });
}

const OBJ_IC = { Dragon: 'dragon', Baron: 'baron', 'Héraut': 'herald', Voidgrubs: 'grubs' };
const objAlerted = {};
function renderObjectives() {
  const c = $('objectives');
  if (!c) return;
  const elapsed = (Date.now() - objReceivedAt) / 1000;
  c.innerHTML = '';
  latestObjectives.forEach((o) => {
    const eta = Math.max(0, Math.round(o.etaSeconds - elapsed));
    const cls = eta === 0 ? 'ready' : eta <= 45 ? 'soon' : '';
    // Alerte sonore + notif quand un objectif majeur devient disponible (1x).
    const akey = o.name + ':' + (o.spawnAt != null ? o.spawnAt : '');
    if (eta === 0 && !objAlerted[akey] && (o.name === 'Dragon' || o.name === 'Baron' || o.name === 'Héraut' || o.name === 'Voidgrubs')) {
      objAlerted[akey] = true;
      beep(o.name === 'Baron' ? 660 : 880, 200);
      notify(`${o.name} disponible`, 'Prends la vision et regroupe pour le contester.');
    }
    const el = document.createElement('div');
    el.className = 'obj ' + cls;
    el.innerHTML = `
      <div class="obj-name">${iconSvg(OBJ_IC[o.name] || 'target')} ${esc(o.name)}</div>
      <div class="obj-eta">${eta === 0 ? 'PRÊT' : mmss(eta)}</div>`;
    c.appendChild(el);
  });
  if (!latestObjectives.length) c.innerHTML = '<div class="empty">Pas d’objectif suivi pour le moment.</div>';
}

// ── Synthèse vocale (Web Speech API) ────────────────────────────────────────
function ttsSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

// Nettoie le texte pour une lecture propre : retire emojis/symboles.
function cleanForSpeech(text) {
  return String(text == null ? '' : text)
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}️‍]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function listVoices() {
  return ttsSupported() ? window.speechSynthesis.getVoices() : [];
}

function selectedVoice() {
  const voices = listVoices();
  return (
    voices.find((v) => v.voiceURI === tts.voiceURI) ||
    voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('fr')) ||
    voices[0] ||
    null
  );
}

// Repère les voix de meilleure qualité (neuronales) pour les mettre en avant.
const HQ_VOICE = /natural|neural|online|enhanced|premium|wavenet|journey|google|amélior/i;
const isFr = (v) => v.lang && v.lang.toLowerCase().startsWith('fr');

function populateVoices() {
  const sel = $('ttsVoice');
  if (!sel) return;
  const voices = listVoices()
    .slice()
    .sort((a, b) => {
      // français d'abord, puis voix HD, puis ordre alpha
      return (isFr(b) - isFr(a)) || (HQ_VOICE.test(b.name) - HQ_VOICE.test(a.name)) || a.name.localeCompare(b.name);
    });
  const saved = tts.voiceURI || localStorage.getItem('tts_voice') || '';
  sel.innerHTML = '';
  voices.forEach((v) => {
    const o = document.createElement('option');
    o.value = v.voiceURI;
    const hq = HQ_VOICE.test(v.name) ? ' \u2022 HD' : '';
    o.textContent = `${v.name} (${v.lang})${hq}${v.localService ? '' : ' \u2022 r\u00e9seau'}`;
    sel.appendChild(o);
  });
  // Défaut : meilleure voix française dispo (HD si possible), sinon meilleure HD, sinon 1re.
  let chosen = saved && voices.some((v) => v.voiceURI === saved) ? saved : '';
  if (!chosen) {
    const best =
      voices.find((v) => isFr(v) && HQ_VOICE.test(v.name)) ||
      voices.find((v) => isFr(v)) ||
      voices.find((v) => HQ_VOICE.test(v.name)) ||
      voices[0];
    chosen = best ? best.voiceURI : '';
  }
  if (chosen) {
    sel.value = chosen;
    tts.voiceURI = chosen;
  }
}

// Lecture via un serveur TTS externe (ex. Piper) : POST {text} -> audio.
function speakViaEndpoint(text) {
  fetch(tts.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
    .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('TTS ' + r.status))))
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      return audio.play();
    })
    .catch(() => {
      // Repli sur la voix navigateur si le serveur échoue.
      tts.endpoint = '';
      speak(text);
    });
}

function speak(text) {
  const clean = cleanForSpeech(text);
  if (!clean) return;
  if (tts.endpoint) {
    speakViaEndpoint(clean);
    return;
  }
  if (!ttsSupported()) return;
  // Anti-retard : si la file s'allonge, on repart sur le conseil le plus récent.
  if (tts.pending > 2) {
    window.speechSynthesis.cancel();
    tts.pending = 0;
  }
  const u = new SpeechSynthesisUtterance(clean);
  const v = selectedVoice();
  if (v) {
    u.voice = v;
    u.lang = v.lang;
  } else {
    u.lang = 'fr-FR';
  }
  u.rate = 1.05;
  u.pitch = 1;
  u.volume = 1;
  tts.pending++;
  u.onend = u.onerror = () => {
    tts.pending = Math.max(0, tts.pending - 1);
  };
  window.speechSynthesis.speak(u);
}

// Lit un conseil si la voix est active et qu'il passe le filtre choisi.
function maybeSpeak(a) {
  if (!tts.enabled || !a) return;
  if (a.at <= tts.enabledAt) return; // ne pas relire l'historique au démarrage
  const isAi = a.source === 'ai';
  let ok;
  if (tts.scope === 'ai') ok = isAi;
  else if (tts.scope === 'all') ok = true;
  else ok = isAi || a.priority === 'high' || a.priority === 'medium';
  if (!ok) return;
  speak(a.message || a.title);
}

function setTtsEnabled(on) {
  tts.enabled = on;
  tts.enabledAt = Date.now();
  localStorage.setItem('tts_enabled', on ? '1' : '0');
  if (on) {
    // Geste utilisateur : on en profite pour autoriser notifications + audio.
    try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch {}
    try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume(); } catch {}
  }
  const btn = $('ttsToggle');
  if (btn) {
    btn.innerHTML = (on ? iconSvg('volume') : iconSvg('volumeOff')) + (on ? ' Voix on' : ' Voix off');
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  if (ttsSupported()) window.speechSynthesis.cancel();
  tts.pending = 0;
  if (on) speak('Coach vocal activé.');
}

// Configure / efface le serveur TTS externe (Piper, etc.).
function setupTtsServerButton() {
  const btn = $('ttsServerBtn');
  if (!btn) return;
  const refresh = () => {
    btn.classList.toggle('on', Boolean(tts.endpoint));
    btn.innerHTML = iconSvg('sliders') + ' Voix HD';
  };
  refresh();
  btn.addEventListener('click', () => {
    const cur = tts.endpoint || '';
    const url = window.prompt(
      'URL d’un serveur TTS local renvoyant de l’audio pour {"text":"…"} (ex. Piper).\nLaisse vide pour utiliser la voix du navigateur.',
      cur
    );
    if (url === null) return;
    tts.endpoint = url.trim();
    if (tts.endpoint) localStorage.setItem('tts_endpoint', tts.endpoint);
    else localStorage.removeItem('tts_endpoint');
    refresh();
    if (tts.endpoint) speak('Voix serveur activée.');
  });
}

function initTts() {
  // Charge un éventuel serveur TTS externe et configure son bouton (même si la
  // synthèse navigateur est absente, la voix serveur peut fonctionner).
  tts.endpoint = localStorage.getItem('tts_endpoint') || '';
  setupTtsServerButton();

  const voiceSelEl = $('ttsVoice');
  if (!ttsSupported() && voiceSelEl) {
    voiceSelEl.innerHTML = '<option>Voix navigateur indisponible</option>';
    voiceSelEl.disabled = true;
  }

  tts.scope = localStorage.getItem('tts_scope') || 'important';
  const scopeSel = $('ttsScope');
  if (scopeSel) scopeSel.value = tts.scope;

  if (ttsSupported()) {
    populateVoices();
    // Les voix se chargent parfois de façon asynchrone.
    window.speechSynthesis.onvoiceschanged = populateVoices;
  }

  const toggle = $('ttsToggle');
  if (toggle) toggle.addEventListener('click', () => setTtsEnabled(!tts.enabled));
  const test = $('ttsTest');
  if (test)
    test.addEventListener('click', () =>
      speak('Ceci est un test de la voix du coach. Dragon dans vingt secondes, place ta vision et regroupe.')
    );
  const voiceSel = $('ttsVoice');
  if (voiceSel)
    voiceSel.addEventListener('change', (e) => {
      tts.voiceURI = e.target.value;
      localStorage.setItem('tts_voice', tts.voiceURI);
    });
  if (scopeSel)
    scopeSel.addEventListener('change', (e) => {
      tts.scope = e.target.value;
      localStorage.setItem('tts_scope', tts.scope);
    });

  if (localStorage.getItem('tts_enabled') === '1') setTtsEnabled(true);

  // Filtre macro/micro du flux.
  feedFocus = localStorage.getItem('feed_focus') || 'all';
  const focusSel = $('feedFocus');
  if (focusSel) {
    focusSel.value = feedFocus;
    focusSel.addEventListener('change', (e) => {
      feedFocus = e.target.value;
      localStorage.setItem('feed_focus', feedFocus);
      applyFeedFilter();
    });
  }
}

// ── Chat avec Claude ─────────────────────────────────────────────────────────
function appendChat(role, text) {
  const log = $('chatLog');
  const hint = $('chatHint');
  if (hint) hint.remove();
  const el = document.createElement('div');
  el.className = 'chat-msg chat-' + role;
  el.innerHTML = `<span class="chat-role">${role === 'you' ? 'Toi' : 'Claude'}</span><span class="chat-text"></span>`;
  el.querySelector('.chat-text').textContent = text;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
  return el;
}

function initChat() {
  const form = $('chatForm');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('chatInput');
    const q = (input.value || '').trim();
    if (!q) return;
    input.value = '';
    appendChat('you', q);
    const pending = appendChat('ai', '…');
    pending.classList.add('pending');
    const setText = (t) => {
      pending.classList.remove('pending');
      pending.querySelector('.chat-text').textContent = t;
      $('chatLog').scrollTop = $('chatLog').scrollHeight;
    };
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q }),
      });
      const data = await res.json();
      const reply = data.reply || data.hint || 'Pas de réponse (IA indisponible ? Vérifie la CLI Claude).';
      setText(reply);
      if (tts.enabled && data.reply) speak(data.reply);
    } catch (err) {
      setText('Erreur de connexion au coach.');
    }
  });
}

// Dictée vocale de la question (Web Speech Recognition, Chrome/Edge).
function initVoiceInput() {
  const mic = $('chatMic');
  const input = $('chatInput');
  if (!mic || !input) return;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    mic.style.display = 'none';
    return;
  }
  let rec = null;
  let listening = false;
  mic.addEventListener('click', () => {
    if (listening && rec) {
      rec.stop();
      return;
    }
    rec = new SR();
    rec.lang = 'fr-FR';
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onstart = () => {
      listening = true;
      mic.classList.add('listening');
    };
    rec.onresult = (e) => {
      let txt = '';
      for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript;
      input.value = txt;
    };
    rec.onend = () => {
      listening = false;
      mic.classList.remove('listening');
      // Boucle mains-libres : si on a dicté quelque chose, on envoie tout seul
      // (la réponse est lue à voix haute si la voix est active).
      if ((input.value || '').trim()) {
        const form = $('chatForm');
        if (form) (form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true })));
      } else {
        input.focus();
      }
    };
    rec.onerror = () => {
      listening = false;
      mic.classList.remove('listening');
    };
    try {
      rec.start();
    } catch {
      /* déjà en cours */
    }
  });
}

// ── Utilitaires ─────────────────────────────────────────────────────────────
function mmss(sec) {
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function esc(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

// Tick local : compteurs d'objectifs + temps relatifs du flux.
setInterval(() => {
  if (latestObjectives.length) renderObjectives();
  updateRelTimes();
  updateTimers();
}, 1000);

// Mode compact (2e écran) : bascule une classe sur <body>, persistée.
function initCompact() {
  // ?overlay=1 (fenêtre Electron / source OBS) : rendu transparent + compact.
  if (new URLSearchParams(location.search).has('overlay')) {
    document.body.classList.add('overlay', 'compact');
  }
  const btn = $('compactToggle');
  const apply = (on) => {
    document.body.classList.toggle('compact', on);
    if (btn) {
      btn.classList.toggle('on', on);
      btn.innerHTML = (on ? iconSvg('minimize') : iconSvg('maximize')) + (on ? ' Compact' : ' Normal');
    }
  };
  apply(localStorage.getItem('coach_compact') === '1');
  if (btn)
    btn.addEventListener('click', () => {
      const on = !document.body.classList.contains('compact');
      localStorage.setItem('coach_compact', on ? '1' : '0');
      apply(on);
    });
}

initTts();
initChat();
initVoiceInput();
initTimers();
initCompact();
connect();
