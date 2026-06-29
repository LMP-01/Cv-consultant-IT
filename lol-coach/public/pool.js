'use strict';

const $ = (id) => document.getElementById(id);

function esc(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function masteryFmt(n) {
  n = Number(n) || 0;
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000) return Math.round(n / 1000) + 'K';
  return String(n);
}

function stars(d) {
  const n = Math.max(1, Math.min(5, Number(d) || 3));
  return '●'.repeat(n) + '○'.repeat(5 - n);
}

// Couleur d'un winrate (vert >52, rouge <48).
function wrClass(wr) {
  if (wr == null) return '';
  if (wr >= 52) return 'wr-good';
  if (wr < 48) return 'wr-bad';
  return 'wr-mid';
}

function img(src) {
  return src ? `<img src="${esc(src)}" alt="" onerror="this.style.visibility='hidden'"/>` : '';
}

function matchupChips(list) {
  if (!list || !list.length) return '<span class="dex-none">—</span>';
  return list
    .map(
      (c) =>
        `<span class="mu-chip ${wrClass(c.wr)}">${img(c.portrait)}<span class="mu-name">${esc(c.name)}</span>${
          c.wr != null ? `<span class="mu-wr">${c.wr}%</span>` : ''
        }</span>`
    )
    .join('');
}

function buildBlock(b) {
  if (!b) return '<div class="dex-none">Build non renseigné (édite data/builds.json).</div>';
  const items = (arr) => (arr || []).map((i) => `<span class="item-pill">${esc(i)}</span>`).join('');
  return `
    <div class="build-grid">
      <div class="build-row"><span class="build-k">Runes</span><span>${esc(b.runes ? b.runes.keystone : '')}${b.runes && b.runes.secondary ? ' · ' + esc(b.runes.secondary) : ''}</span></div>
      <div class="build-row"><span class="build-k">Sorts</span><span>${esc(b.summoners || '')}</span></div>
      <div class="build-row"><span class="build-k">Départ</span><span>${esc(b.start || '')}</span></div>
      <div class="build-row"><span class="build-k">Core</span><span class="item-line">${items(b.core)}</span></div>
      <div class="build-row"><span class="build-k">Bottes</span><span>${esc(b.boots || '')}</span></div>
      <div class="build-row"><span class="build-k">Situationnel</span><span class="item-line">${items(b.situational)}</span></div>
    </div>
    ${b.note ? `<div class="build-note">💡 ${esc(b.note)}</div>` : ''}`;
}

function championCard(c) {
  const prof = c.profile || {};
  const wr = c.winrate && c.winrate.overall;
  return `
    <article class="dex-card">
      <header class="dex-head">
        <div class="dex-id">
          ${img(c.portrait)}
          <div>
            <div class="dex-name">${esc(c.name)}</div>
            <div class="dex-tags">${(c.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}
              <span class="tag tag-dmg">${esc(c.damageLabel)}</span>
            </div>
          </div>
        </div>
        <div class="dex-meta">
          <div class="wr-badge ${wrClass(wr)}">${wr != null ? wr + '%' : '—'}<span>winrate</span></div>
          <div class="mastery-badge">${masteryFmt(c.mastery)}<span>maîtrise</span></div>
        </div>
      </header>

      <div class="dex-profile">
        ${prof.resource ? `<span class="meta-pill">${esc(prof.resource)}</span>` : ''}
        ${prof.difficulty ? `<span class="meta-pill">Difficulté <b class="diff">${stars(prof.difficulty)}</b></span>` : ''}
        ${prof.style ? `<span class="meta-pill style">${esc(prof.style)}</span>` : ''}
      </div>
      ${prof.description ? `<p class="dex-desc">${esc(prof.description)}</p>` : ''}

      <h4 class="dex-sub">⚔️ Build conseillé</h4>
      ${buildBlock(c.build)}

      <div class="mu-cols">
        <div>
          <h4 class="dex-sub bad">🛑 Le counter (ses pires match-ups)</h4>
          <div class="mu-list">${matchupChips(c.counters)}</div>
        </div>
        <div>
          <h4 class="dex-sub good">✅ Il counter (ses meilleurs match-ups)</h4>
          <div class="mu-list">${matchupChips(c.countered)}</div>
        </div>
      </div>
    </article>`;
}

function render(data) {
  const badge = $('statsBadge');
  if (badge) {
    badge.textContent = data.hasLiveStats ? 'Stats : winrates live ✓' : 'Stats : counters (winrates : lance fetch-counters)';
    badge.className = 'badge ' + (data.hasLiveStats ? 'ok' : 'dim');
  }

  const root = $('poolRoot');
  if (!data.roles || !data.roles.length) {
    root.innerHTML = '<div class="empty">Aucune pool configurée. Renseigne <code>data/champion-pool.json</code>.</div>';
    return;
  }

  root.innerHTML = data.roles
    .map(
      (r) => `
      <section class="role-section">
        <h2 class="role-title">${esc(r.label)} <span>${r.champions.length} champion${r.champions.length > 1 ? 's' : ''}</span></h2>
        <div class="dex-grid">${r.champions.map(championCard).join('')}</div>
      </section>`
    )
    .join('');

  if (data.unresolved && data.unresolved.length) {
    root.innerHTML += `<div class="empty">Non reconnus (nouveau champion ?) : ${esc(data.unresolved.join(', '))}</div>`;
  }
}

fetch('/api/pool')
  .then((r) => r.json())
  .then(render)
  .catch((e) => {
    $('poolRoot').innerHTML = `<div class="empty">Erreur de chargement : ${esc(e.message)}</div>`;
  });
