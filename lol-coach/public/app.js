'use strict';

const $ = (id) => document.getElementById(id);

let ws = null;
let latestObjectives = [];
let objReceivedAt = Date.now();
const renderedKeys = new Set();

// ── WebSocket ──────────────────────────────────────────────────────────────
function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);

  ws.onopen = () => setBadge('wsBadge', 'Serveur ✓', 'ok');
  ws.onclose = () => {
    setBadge('wsBadge', 'Serveur ✗', 'off');
    setTimeout(connect, 2000);
  };
  ws.onerror = () => ws.close();
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'state') applyState(msg.payload);
    } catch (e) {
      /* ignore */
    }
  };
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
  setBadge('liveBadge', 'Jeu ' + (c.liveClient ? '✓' : '✗'), c.liveClient ? 'ok' : 'off');
  setBadge('lcuBadge', 'Client ' + (c.lcu ? '✓' : '✗'), c.lcu ? 'ok' : 'off');
  setBadge('aiBadge', 'IA: ' + shortAi(c.ai), c.ai && c.ai.startsWith('Claude') ? 'ok' : 'dim');

  // Flux de conseils
  addFeedItems(state.feed || []);

  // Panneaux contextuels
  const inGame = state.phase === 'ingame' || state.phase === 'ingame-demo';
  const champSelect = state.phase === 'champselect' || state.phase === 'champselect-demo';
  toggle('idleCard', !inGame && !champSelect);
  toggle('champSelect', champSelect);
  toggle('inGame', inGame);

  if (champSelect && state.pick) renderChampSelect(state.pick);
  if (inGame && state.game) renderInGame(state.game);
}

function shortAi(ai) {
  if (!ai) return '—';
  if (ai.startsWith('Claude')) return 'Claude';
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
    renderedKeys.add(a.id + '-' + a.at);
    container.prepend(buildAdviceEl(a));
  }
  // Limite le DOM
  while (container.children.length > 40) container.lastChild.remove();
}

function buildAdviceEl(a) {
  const el = document.createElement('div');
  const cls = a.source === 'ai' ? 'ai' : a.priority || 'info';
  el.className = 'advice ' + cls;
  el.dataset.at = a.at;
  el.innerHTML = `
    <div class="advice-head">
      <span class="advice-title">${esc(a.title)}</span>
      <span class="advice-meta"><span class="rel" data-at="${a.at}"></span></span>
    </div>
    <div class="advice-msg"><span class="advice-cat">${esc(a.category || '')}</span>${esc(a.message)}</div>`;
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

// ── Champ select ────────────────────────────────────────────────────────────
function renderChampSelect(pick) {
  $('myRole').textContent = pick.myRoleLabel || '';

  const lane = $('laneOpponent');
  lane.innerHTML = pick.laneOpponent
    ? `Adversaire de lane : <strong>${esc(pick.laneOpponent.name)}</strong>`
    : 'Adversaire de lane : non encore choisi';

  const grid = $('pickSuggestions');
  grid.innerHTML = '';
  if (!pick.pickSuggestions || !pick.pickSuggestions.length) {
    grid.innerHTML = '<div class="empty">En attente des picks adverses…</div>';
  } else {
    pick.pickSuggestions.forEach((p, i) => {
      const el = document.createElement('div');
      el.className = 'pick' + (i === 0 ? ' top-pick' : '');
      el.innerHTML = `
        ${p.portrait ? `<img src="${p.portrait}" alt="" onerror="this.style.visibility='hidden'"/>` : ''}
        <div class="pick-info">
          <div class="pick-name">${esc(p.name)} ${i === 0 ? '<span class="pick-rank">★ TOP</span>' : ''}</div>
          <div class="pick-reasons">${esc((p.reasons || []).join(' · ') || 'pick solide')}</div>
        </div>`;
      grid.appendChild(el);
    });
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
  prof.textContent = pick.enemyComp
    ? `Profil : ${pick.enemyComp.profile} · CC ${pick.enemyComp.ccLevel} · burst ${pick.enemyComp.burstLevel}`
    : '';

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

  renderTeam('allies', game.scoreboard ? game.scoreboard.allies : []);
  renderTeam('enemies', game.scoreboard ? game.scoreboard.enemies : []);
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

function renderObjectives() {
  const c = $('objectives');
  if (!c) return;
  const elapsed = (Date.now() - objReceivedAt) / 1000;
  c.innerHTML = '';
  latestObjectives.forEach((o) => {
    const eta = Math.max(0, Math.round(o.etaSeconds - elapsed));
    const cls = eta === 0 ? 'ready' : eta <= 45 ? 'soon' : '';
    const el = document.createElement('div');
    el.className = 'obj ' + cls;
    el.innerHTML = `
      <div class="obj-name">${o.icon || ''} ${esc(o.name)}</div>
      <div class="obj-eta">${eta === 0 ? 'PRÊT' : mmss(eta)}</div>`;
    c.appendChild(el);
  });
  if (!latestObjectives.length) c.innerHTML = '<div class="empty">Pas d’objectif suivi pour le moment.</div>';
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
}, 1000);

connect();
