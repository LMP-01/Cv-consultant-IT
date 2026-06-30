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
        <div class="hist-col good"><h4>✅ Bien joué</h4><ul>${did || '<li>—</li>'}</ul></div>
        <div class="hist-col bad"><h4>🎯 À améliorer</h4><ul>${imp || '<li>—</li>'}</ul></div>
      </div>
      ${review.focusNextGame ? `<div class="hist-focus">🧭 Objectif prochaine partie : <b>${esc(review.focusNextGame)}</b></div>` : ''}
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

fetch('/api/history')
  .then((r) => r.json())
  .then(render)
  .catch((e) => {
    $('histRoot').innerHTML = `<div class="empty">Erreur de chargement : ${esc(e.message)}</div>`;
  });
