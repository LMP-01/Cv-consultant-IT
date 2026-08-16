'use strict';

const fs = require('fs');
const path = require('path');
const { dataset, classifyDamage } = require('./profile');
const { getBuild } = require('./builds');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
  } catch {
    return null;
  }
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const ROLE_LABEL = { TOP: 'Top', JUNGLE: 'Jungle', MIDDLE: 'Mid', BOTTOM: 'ADC', UTILITY: 'Support' };

const DAMAGE_LABEL = {
  AP: 'Magique (AP)',
  AD: 'Physique (AD)',
  MIXED: 'Mixte (AD/AP)',
  TRUE: 'Vrais dégâts',
};

function pct(x) {
  return x == null ? null : Math.round(x * 1000) / 10; // 0.512 -> 51.2
}

// Transforme un nom d'item (ou une liste) en objet(s) { name, icon } via Data Dragon.
// Si l'item n'est pas résolu (renommé/retiré, ou ddragon indisponible), icon = null
// et le nom d'origine est conservé pour un affichage texte.
function resolveItem(name, ddragon) {
  if (!name) return null;
  const r = ddragon ? ddragon.resolveItemByName(name) : null;
  return { name: r ? r.name : name, icon: r ? r.icon : null };
}
function resolveItems(arr, ddragon) {
  return (arr || []).map((n) => resolveItem(n, ddragon)).filter(Boolean);
}

// Reconstruit le bloc build avec icônes d'items résolues.
function buildWithIcons(build, ddragon) {
  if (!build) return null;
  return {
    runes: build.runes,
    summoners: build.summoners,
    start: resolveItem(build.start, ddragon),
    core: resolveItems(build.core, ddragon),
    boots: resolveItem(build.boots, ddragon),
    situational: resolveItems(build.situational, ddragon),
    note: build.note,
  };
}

/**
 * Construit la "fiche pool" : par rôle, chaque champion avec caractéristiques,
 * build conseillé, winrate overall, counters (qui le bat) et champions qu'il bat.
 */
function buildPoolDex(ddragon) {
  const ds = dataset();
  const pool = readJson('champion-pool.json') || { pool: {} };
  const live = readJson('champion-data.json'); // optionnel (généré par le scraper)
  const liveChamps = (live && live.champions) || {};

  // Index normalisé des counters : qui counter le champion X.
  const countersByNorm = new Map();
  for (const key of Object.keys(ds.counters || {})) countersByNorm.set(norm(key), ds.counters[key]);

  const canonId = (raw) => {
    const e = ddragon ? ddragon.resolveChampionByName(raw) : null;
    return e ? e.id : null;
  };
  const champRef = (id) => {
    const e = ddragon ? ddragon.championById.get(id) : null;
    return e ? { id: e.id, name: e.displayName || e.name, portrait: ddragon.squarePortraitUrl(e.id) } : { id, name: id, portrait: null };
  };

  // Champions que X counter = tous les Y dont la liste de counters contient X.
  function championsCounteredBy(xId) {
    const out = [];
    for (const [yKey, list] of Object.entries(ds.counters || {})) {
      const canonList = (list || []).map(canonId).filter(Boolean);
      if (canonList.includes(xId)) {
        const yId = canonId(yKey);
        if (yId) out.push(yId);
      }
    }
    return out;
  }

  const unresolved = [];
  const roles = [];

  for (const role of Object.keys(pool.pool || {})) {
    const entries = pool.pool[role] || [];
    const champions = [];

    for (const entry of entries) {
      const champ = ddragon ? ddragon.resolveChampionByName(entry.champion) : null;
      if (!champ) {
        unresolved.push({ champion: entry.champion, role });
        continue;
      }
      const build = getBuild(champ.id, role) || null;
      const liveStats = (liveChamps[champ.id] && liveChamps[champ.id][role]) || null;

      // Counters (qui le bat) & champions qu'il bat.
      let counters;
      let countered;
      if (liveStats && Array.isArray(liveStats.matchups) && liveStats.matchups.length) {
        const sorted = liveStats.matchups
          .filter((m) => m && m.id && m.games >= 50)
          .map((m) => ({ ...champRef(canonId(m.id) || m.id), wr: pct(m.wr), games: m.games }));
        counters = sorted.slice().sort((a, b) => a.wr - b.wr).slice(0, 6); // pires match-ups
        countered = sorted.slice().sort((a, b) => b.wr - a.wr).slice(0, 6); // meilleurs match-ups
      } else {
        const counterList = (countersByNorm.get(norm(champ.id)) || []).map(canonId).filter(Boolean);
        counters = counterList.map((id) => ({ ...champRef(id), wr: null }));
        countered = championsCounteredBy(champ.id).map((id) => ({ ...champRef(id), wr: null }));
      }

      champions.push({
        id: champ.id,
        name: champ.displayName || champ.name,
        key: champ.key,
        portrait: ddragon ? ddragon.squarePortraitUrl(champ.id) : null,
        mastery: entry.mastery || 0,
        tags: champ.tags || [],
        damage: classifyDamage(champ),
        damageLabel: DAMAGE_LABEL[classifyDamage(champ)] || 'Physique (AD)',
        profile: build ? build.profile : null,
        build: buildWithIcons(build, ddragon),
        winrate: liveStats ? { overall: pct(liveStats.overallWinRate), games: liveStats.games || null } : { overall: null, games: null },
        counters,
        countered,
      });
    }

    roles.push({ role, label: ROLE_LABEL[role] || role, champions });
  }

  return {
    roles,
    hasLiveStats: Boolean(live),
    unresolved,
    generatedFrom: live && live._meta ? live._meta : null,
  };
}

module.exports = { buildPoolDex };
