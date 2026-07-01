'use strict';

const $ = (id) => document.getElementById(id);

function esc(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

const RATING_LABEL = {
  great: { txt: 'Excellente partie', cls: 'r-great' },
  good: { txt: 'Bonne partie', cls: 'r-good' },
  mixed: { txt: 'Partie mitigée', cls: 'r-mixed' },
  rough: { txt: 'Partie difficile', cls: 'r-rough' },
};

function fmtDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) + ' ' +
      d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso || '';
  }
}

function statsBlock(stats) {
  if (!stats || !stats.played) return '';
  const wr = stats.winrate != null ? stats.winrate + '%' : '—';
  const kda = stats.avgKda ? `${stats.avgKda.k} / ${stats.avgKda.d} / ${stats.avgKda.a}` : '—';
  const champs = (stats.byChampion || [])
    .slice(0, 6)
    .map((c) => `<span class="hist-champ">${esc(c.champion)} <b>${c.games}</b>${c.wins ? ` · ${Math.round((c.wins / c.games) * 100)}%` : ''}</span>`)
    .join('');
  return `
    <div class="hist-kpis">
      <div class="kpi"><div class="kpi-v">${stats.played}</div><div class="kpi-k">parties</div></div>
      <div class="kpi"><div class="kpi-v">${wr}</div><div class="kpi-k">winrate (${stats.decided})</div></div>
      <div class="kpi"><div class="kpi-v">${stats.wins}<span class="kpi-sep">/</span>${stats.losses}</div><div class="kpi-k">V / D</div></div>
      <div class="kpi"><div class="kpi-v">${esc(kda)}</div><div class="kpi-k">KDA moyen</div></div>
    </div>
    ${champs ? `<div class="hist-champs">${champs}</div>` : ''}`;
}

function reviewBlock(review) {
  if (!review) {
    return '<div class="hist-review pending">Critique IA en attente (générée en fin de partie si l’abonnement Claude est actif).</div>';
  }
  const did = (review.didWell || []).map((x) => `<li>${esc(x)}</li>`).join('');
  const imp = (review.toImprove || []).map((x) => `<li>${esc(x)}</li>`).join('');
  return `
    <div class="hist-review">
      ${review.summary ? `<p class="hist-summary">${esc(review.summary)}</p>` : ''}
      <div class="hist-cols">
        <div class="hist-col good"><h4>${iconSvg('check','ic-good')} Bien joué</h4><ul>${did || '<li>—</li>'}</ul></div>
        <div class="hist-col bad"><h4>${iconSvg('target','ic-amber')} À améliorer</h4><ul>${imp || '<li>—</li>'}</ul></div>
      </div>
      ${review.focusNextGame ? `<div class="hist-focus">${iconSvg('compass')} Objectif prochaine partie : <b>${esc(review.focusNextGame)}</b></div>` : ''}
    </div>`;
}

function gameCard(g) {
  const win = g.win === true ? 'win' : g.win === false ? 'loss' : 'unknown';
  const winTxt = g.win === true ? 'Victoire' : g.win === false ? 'Défaite' : 'Résultat inconnu';
  const rating = g.review && g.review.rating && RATING_LABEL[g.review.rating];
  return `
    <article class="hist-card ${win}">
      <header class="hist-head">
        <div class="hist-id">
          <span class="hist-result ${win}">${winTxt}</span>
          <span class="hist-champ-name">${esc(g.champion || '—')}</span>
          ${g.role ? `<span class="hist-role">${esc(g.role)}</span>` : ''}
        </div>
        <div class="hist-meta">
          <span>${esc(g.kda || '—')}</span>
          <span>${g.csPerMin != null ? g.csPerMin + ' CS/min' : ''}</span>
          <span>${esc(g.durationText || '')}</span>
          <span class="hist-date">${esc(fmtDate(g.date))}</span>
        </div>
      </header>
      ${rating ? `<div class="hist-rating ${rating.cls}">${rating.txt}</div>` : ''}
      ${reviewBlock(g.review)}
      <div class="hist-comp">
        ${g.allies && g.allies.length ? `<span class="hist-side allies">Ton équipe : ${esc(g.allies.join(', '))}</span>` : ''}
        ${g.enemies && g.enemies.length ? `<span class="hist-side enemies">Adverse : ${esc(g.enemies.join(', '))}</span>` : ''}
      </div>
    </article>`;
}

// Mini graphique linéaire SVG (sans dépendance).
function lineChart(values, opts) {
  opts = opts || {};
  const W = 320, H = 90, P = 18;
  if (!values.length) return '<div class="dex-none">Pas assez de données.</div>';
  const min = Math.min(...values, opts.min != null ? opts.min : Infinity);
  const max = Math.max(...values, opts.max != null ? opts.max : -Infinity);
  const range = max - min || 1;
  const n = values.length;
  const x = (i) => P + (n === 1 ? (W - 2 * P) / 2 : (i * (W - 2 * P)) / (n - 1));
  const y = (v) => H - P - ((v - min) / range) * (H - 2 * P);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const dots = values
    .map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.6" fill="${opts.color || '#818cf8'}"/>`)
    .join('');
  const last = values[values.length - 1];
  return `
    <div class="chart">
      <div class="chart-head"><span>${esc(opts.label || '')}</span><b style="color:${opts.color || '#818cf8'}">${last}${opts.unit || ''}</b></div>
      <svg viewBox="0 0 ${W} ${H}" class="chart-svg" preserveAspectRatio="none">
        <polyline points="${pts}" fill="none" stroke="${opts.color || '#818cf8'}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
        ${dots}
      </svg>
    </div>`;
}

function renderCharts(games) {
  const box = $('histCharts');
  if (!box) return;
  // Du plus ancien au plus récent pour lire la progression de gauche à droite.
  const chrono = (games || []).slice().reverse();
  const deaths = chrono.filter((g) => g.deaths != null).map((g) => g.deaths);
  const cspm = chrono.filter((g) => g.csPerMin != null).map((g) => g.csPerMin);
  // Winrate glissant (cumulatif).
  let w = 0, t = 0;
  const wr = chrono
    .filter((g) => g.win === true || g.win === false)
    .map((g) => { t++; if (g.win === true) w++; return Math.round((w / t) * 100); });
  if (deaths.length < 2 && cspm.length < 2 && wr.length < 2) { box.innerHTML = ''; return; }
  box.innerHTML = `
    <h3 class="sub">${iconSvg('trendDown')} Progression (ancien → récent)</h3>
    <div class="charts-grid">
      ${lineChart(deaths, { label: 'Morts / partie', color: '#fb7185', unit: '', min: 0 })}
      ${lineChart(cspm, { label: 'CS / min', color: '#34d399', unit: '' })}
      ${lineChart(wr, { label: 'Winrate cumulé', color: '#818cf8', unit: '%', min: 0, max: 100 })}
    </div>`;
}

// Suivi d'un objectif perso (stocké en localStorage).
function renderGoal(games) {
  const box = $('goalTracker');
  if (!box) return;
  let goal = null;
  try { goal = JSON.parse(localStorage.getItem('coach_goal') || 'null'); } catch { goal = null; }
  const decided = (games || []).filter((g) => g.deaths != null || g.csPerMin != null);
  let adherence = '';
  if (goal && decided.length) {
    const met = decided.filter((g) =>
      goal.type === 'deaths' ? g.deaths != null && g.deaths <= goal.value : g.csPerMin != null && g.csPerMin >= goal.value
    ).length;
    const pct = Math.round((met / decided.length) * 100);
    const label = goal.type === 'deaths' ? `≤ ${goal.value} morts` : `≥ ${goal.value} CS/min`;
    adherence = `<div class="goal-adherence"><b>${pct}%</b> de tes ${decided.length} parties respectent ton objectif (<b>${esc(label)}</b>)</div>`;
  }
  box.innerHTML = `
    <h3 class="sub">${iconSvg('target')} Mon objectif</h3>
    <form id="goalForm" class="goal-form">
      <select id="goalType" class="tts-select">
        <option value="deaths">Maximum de morts / partie</option>
        <option value="cs">Minimum de CS / min</option>
      </select>
      <input id="goalValue" class="chat-input" type="number" step="0.1" min="0" placeholder="valeur" style="max-width:110px" />
      <button class="chat-send" type="submit">Définir</button>
      ${goal ? '<button id="goalClear" class="tts-btn ghost" type="button">Effacer</button>' : ''}
    </form>
    ${adherence}`;
  if (goal) {
    $('goalType').value = goal.type === 'deaths' ? 'deaths' : 'cs';
    $('goalValue').value = goal.value;
  }
  $('goalForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const type = $('goalType').value;
    const value = parseFloat($('goalValue').value);
    if (isNaN(value)) return;
    localStorage.setItem('coach_goal', JSON.stringify({ type, value }));
    renderGoal(games);
  });
  const clr = $('goalClear');
  if (clr) clr.addEventListener('click', () => { localStorage.removeItem('coach_goal'); renderGoal(games); });
}

// Détecteur de tilt : défaites consécutives récentes -> suggestion de pause.
function renderTilt(games) {
  const box = $('tiltBanner');
  if (!box) return;
  let streak = 0;
  for (const g of games) {
    if (g.win === false) streak++;
    else if (g.win === true) break;
  }
  if (streak >= 3) {
    box.innerHTML = `
      <div class="tilt-banner">
        <div class="tilt-head">${iconSvg('alert','ic-bad')} ${streak} défaites d'affilée — fais une pause.</div>
        <div class="tilt-body">Le tilt coûte plus de LP que n'importe quel matchup. Avant de relancer :</div>
        <ul class="tilt-list">
          <li>${iconSvg('pause')} 15-20 min loin de l'écran (eau, marche, étirements).</li>
          <li>${iconSvg('target')} 1 seul objectif simple la prochaine game (ex. &lt; 5 morts).</li>
          <li>Respire : la prochaine partie ne récupère pas les précédentes.</li>
          <li>${iconSvg('volumeOff')} Mute si besoin, joue ta propre game.</li>
        </ul>
      </div>`;
  } else {
    box.innerHTML = '';
  }
}

// Reco one-trick : meilleur champion par winrate (≥ 2 parties).
function renderOneTrick(stats) {
  const box = $('oneTrick');
  if (!box) return;
  const cands = (stats.byChampion || []).filter((c) => c.games >= 2);
  if (!cands.length) { box.innerHTML = ''; return; }
  cands.forEach((c) => (c.wr = Math.round((c.wins / c.games) * 100)));
  cands.sort((a, b) => b.wr - a.wr || b.games - a.games);
  const best = cands[0];
  const worst = cands[cands.length - 1];
  let msg = `Ton meilleur winrate : <b>${esc(best.champion)}</b> (${best.wr}% sur ${best.games}). Pour grimper, <b>spam ce champion</b> et réduis ta pool.`;
  if (cands.length > 1 && worst.wr < 45) {
    msg += ` À l'inverse, <b>${esc(worst.champion)}</b> (${worst.wr}%) te coûte des games — évite-le en ranked tant qu'il n'est pas travaillé.`;
  }
  box.innerHTML = `<div class="onetrick"><span class="ot-ico">${iconSvg('trophy','ic-gold ic-lg')}</span><div>${msg}</div></div>`;
}

function gamesToCsv(games) {
  const cols = ['date', 'champion', 'role', 'win', 'kills', 'deaths', 'assists', 'csPerMin', 'durationText', 'enemyProfile'];
  const head = cols.join(',');
  const rows = games.map((g) =>
    cols
      .map((c) => {
        let v = g[c];
        if (v == null) v = '';
        v = String(v).replace(/"/g, '""');
        return /[",\n]/.test(v) ? `"${v}"` : v;
      })
      .join(',')
  );
  return [head, ...rows].join('\n');
}
function initCsv(games) {
  const btn = $('exportCsv');
  if (!btn) return;
  if (!games.length) { btn.style.display = 'none'; return; }
  btn.addEventListener('click', () => {
    const blob = new Blob([gamesToCsv(games)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lol-coach-historique.csv';
    a.click();
    URL.revokeObjectURL(url);
  });
}

function render(data) {
  const stats = data.stats || {};
  const badge = $('statsBadge');
  if (badge) badge.textContent = `${stats.played || 0} partie${(stats.played || 0) > 1 ? 's' : ''}` + (stats.winrate != null ? ` · ${stats.winrate}% WR` : '');

  $('histStats').innerHTML = statsBlock(stats);

  const root = $('histRoot');
  if (!data.games || !data.games.length) {
    root.innerHTML = `<div class="empty">Aucune partie enregistrée pour l’instant. Joue une partie avec le coach lancé : elle apparaîtra ici à la fin, avec une critique et des axes d’amélioration.</div>`;
    return;
  }
  root.innerHTML = data.games.map(gameCard).join('');
}

function renderAnalysis(data) {
  const box = $('analysisResult');
  if (!box) return;
  if (!data || (!data.analysis && !data.hint)) {
    box.innerHTML = '<div class="hist-review pending">Aucune analyse disponible.</div>';
    return;
  }
  if (!data.analysis) {
    box.innerHTML = `<div class="hist-review pending">${esc(data.hint || 'IA indisponible.')}</div>`;
    return;
  }
  const a = data.analysis;
  const patterns = (a.patterns || [])
    .map((p) => `<li><b>${esc(p.title)}</b> — ${esc(p.detail)}</li>`)
    .join('');
  const prio = (a.priorities || []).map((x) => `<li>${esc(x)}</li>`).join('');
  box.innerHTML = `
    <div class="analysis-card">
      ${a.summary ? `<p class="hist-summary">${esc(a.summary)}</p>` : ''}
      ${patterns ? `<h4 class="an-h">${iconSvg('repeat')} Faiblesses récurrentes</h4><ul class="an-list">${patterns}</ul>` : ''}
      ${prio ? `<h4 class="an-h">${iconSvg('compass')} Chantiers prioritaires</h4><ol class="an-list">${prio}</ol>` : ''}
    </div>`;
}

function initAnalyze() {
  const btn = $('analyzeBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    btn.disabled = true;
    const prev = btn.textContent;
    btn.textContent = 'Analyse en cours…';
    $('analysisResult').innerHTML = '<div class="hist-review pending">Claude analyse tes parties…</div>';
    fetch('/api/history/analysis')
      .then((r) => r.json())
      .then(renderAnalysis)
      .catch((e) => {
        $('analysisResult').innerHTML = `<div class="hist-review pending">Erreur : ${esc(e.message)}</div>`;
      })
      .finally(() => {
        btn.disabled = false;
        btn.textContent = prev;
      });
  });
}

// Carte de rang (Riot API) + objectif de climb.
const TIER_ORDER = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER'];
const TIER_FR = { IRON: 'Fer', BRONZE: 'Bronze', SILVER: 'Argent', GOLD: 'Or', PLATINUM: 'Platine', EMERALD: 'Émeraude', DIAMOND: 'Diamant', MASTER: 'Maître', GRANDMASTER: 'Grand Maître', CHALLENGER: 'Challenger' };
function renderRiotProfile() {
  const box = $('riotProfile');
  if (!box) return;
  fetch('/api/riot/profile')
    .then((r) => r.json())
    .then((d) => {
      if (!d.enabled) { box.innerHTML = `<div class="riot-card off">${iconSvg('gamepad')} Riot API non configurée — ajoute <code>RIOT_API_KEY</code> et <code>RIOT_ID</code> dans <code>.env</code> pour le rang/LP et l'historique réel.</div>`; return; }
      if (d.error) { box.innerHTML = `<div class="riot-card off">Riot API : ${esc(d.error)}</div>`; return; }
      const p = d.profile;
      if (!p) { box.innerHTML = ''; return; }
      const r = p.rank;
      if (!r) { box.innerHTML = `<div class="riot-card"><b>${esc(p.riotId)}</b> · non classé cette saison</div>`; return; }
      const games = r.wins + r.losses;
      const wr = games ? Math.round((r.wins / games) * 100) : 0;
      const nextTier = TIER_ORDER[TIER_ORDER.indexOf(r.tier) + 1];
      const toNext = ['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(r.tier) ? null : 100 - r.lp;
      let toMaster = '';
      if (r.toMaster && r.toMaster.reached) toMaster = `<span>${iconSvg('trophy')} Master atteint 🎉</span>`;
      else if (r.toMaster) toMaster = `<span>${iconSvg('trophy')} <b>${r.toMaster.gamesToWin}</b> games à win → Master (${r.toMaster.remainingLp} LP, ~${r.toMaster.lpPerWin} LP/win)</span>`;
      box.innerHTML = `
        <div class="riot-card">
          ${r.emblem ? `<img class="riot-emblem" src="${r.emblem}" alt="${esc(TIER_FR[r.tier] || r.tier)}" onerror="this.remove()"/>` : ''}
          <div class="riot-rank">
            <div class="riot-tier">${esc(TIER_FR[r.tier] || r.tier)} ${esc(r.rank || '')}</div>
            <div class="riot-lp">${r.lp} LP</div>
          </div>
          <div class="riot-meta">
            <span>${esc(p.riotId)}</span>
            <span>${r.wins}V / ${r.losses}D · <b class="${wr >= 50 ? 'wr-good' : 'wr-bad'}">${wr}%</b></span>
            ${toNext != null ? `<span>${iconSvg('target')} ${toNext} LP avant ${esc(TIER_FR[nextTier] || 'la division suivante')} (palier de division)</span>` : ''}
            ${toMaster}
          </div>
        </div>`;
    })
    .catch(() => { box.innerHTML = ''; });
}

function initRiotMatches() {
  const btn = $('loadRiot');
  if (!btn) return;
  btn.addEventListener('click', () => {
    btn.disabled = true;
    const prev = btn.textContent;
    btn.textContent = 'Chargement…';
    fetch('/api/riot/matches?count=10')
      .then((r) => r.json())
      .then((d) => {
        if (!d.enabled) { alert('Configure RIOT_API_KEY + RIOT_ID dans .env.'); return; }
        if (d.error) { alert('Riot API : ' + d.error); return; }
        const root = $('histRoot');
        if (!d.matches || !d.matches.length) { root.innerHTML = '<div class="empty">Aucune partie Riot récente trouvée.</div>'; return; }
        root.innerHTML = '<h3 class="sub">' + iconSvg('gamepad') + ' Parties Riot r\u00e9centes (r\u00e9elles)</h3>' + d.matches.map(gameCard).join('');
        renderCharts(d.matches);
      })
      .catch((e) => alert('Erreur : ' + e.message))
      .finally(() => { btn.disabled = false; btn.textContent = prev; });
  });
}

renderRiotProfile();
initRiotMatches();

fetch('/api/history')
  .then((r) => r.json())
  .then((data) => {
    render(data);
    renderTilt(data.games || []);
    renderOneTrick(data.stats || {});
    renderCharts(data.games || []);
    renderGoal(data.games || []);
    initCsv(data.games || []);
    if (data.games && data.games.length) initAnalyze();
    else { const b = $('analyzeBtn'); if (b) b.style.display = 'none'; }
  })
  .catch((e) => {
    $('histRoot').innerHTML = `<div class="empty">Erreur de chargement : ${esc(e.message)}</div>`;
  });
