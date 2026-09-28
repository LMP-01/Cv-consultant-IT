#!/usr/bin/env node
'use strict';

/**
 * Enrichit data/counters.json avec des données de counters RÉELLES (winrate)
 * récupérées sur un agrégateur en ligne.
 *
 *   node scripts/fetch-counters.js [options]
 *
 * Source par défaut : OP.GG (CGU les plus clémentes — usage non commercial,
 * faible volume, avec citation de la source). Endpoint JSON :
 *   https://lol-api-champion.op.gg/api/{region}/champions/ranked/{championId}/{position}/counters
 *   -> data.counters = [{ champion_id, play, win }]   (win/play = winrate de
 *      l'adversaire CONTRE ce champion ; élevé => c'est un bon counter).
 *
 * ⚠️ À lire :
 *  - Ce script appelle une API tierce NON OFFICIELLE qui peut changer à tout
 *    moment. Lance-le chez toi (l'accès réseau peut être restreint ailleurs).
 *  - Respecte les CGU du site : usage personnel/non commercial, faible volume.
 *    Le script limite la cadence (~1 req/s) par défaut. Ne le martèle pas.
 *  - Les champs éditoriaux de counters.json (damageOverride, ccHeavy,
 *    burstThreats, rolePicks) sont PRÉSERVÉS ; seul `counters` est régénéré.
 *  - Une sauvegarde horodatée est créée avant écriture.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const COUNTERS_FILE = path.join(DATA_DIR, 'counters.json');
const DDRAGON = 'https://ddragon.leagueoflegends.com';

const OPGG_POSITIONS = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'];
// Position OP.GG -> clé de rôle interne.
const OPGG_ROLE = { TOP: 'TOP', JUNGLE: 'JUNGLE', MID: 'MIDDLE', ADC: 'BOTTOM', SUPPORT: 'UTILITY' };
const CHAMPDATA_FILE = path.join(DATA_DIR, 'champion-data.json');

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json',
  Referer: 'https://op.gg/',
  Origin: 'https://op.gg',
};

// ── CLI ─────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const o = {
    source: 'opgg',
    region: 'global',
    tier: 'emerald_plus',
    topN: 5,
    minGames: 100,
    throttleMs: 1100,
    limit: 0, // 0 = tous les champions
    dryRun: false,
    selfTest: false,
    champions: null, // liste d'ids DDragon ciblés (ex: Zed,Garen)
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--source') o.source = next();
    else if (a === '--region') o.region = next();
    else if (a === '--tier') o.tier = next();
    else if (a === '--top') o.topN = parseInt(next(), 10);
    else if (a === '--min-games') o.minGames = parseInt(next(), 10);
    else if (a === '--throttle') o.throttleMs = parseInt(next(), 10);
    else if (a === '--limit') o.limit = parseInt(next(), 10);
    else if (a === '--champions') o.champions = next().split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--self-test') o.selfTest = true;
    else if (a === '--help' || a === '-h') o.help = true;
  }
  return o;
}

function printHelp() {
  console.log(`
Usage: node scripts/fetch-counters.js [options]

  --source <opgg>        Source de données (défaut: opgg)
  --region <global|kr…>  Région (défaut: global)
  --tier <emerald_plus>  Palier de rang (défaut: emerald_plus)
  --top <n>              Nombre de counters gardés par champion (défaut: 5)
  --min-games <n>        Minimum de parties pour retenir un matchup (défaut: 100)
  --throttle <ms>        Délai entre requêtes, soyez poli (défaut: 1100)
  --champions <a,b,...>  Limiter à certains champions (ids DDragon)
  --limit <n>            Limiter au n premiers champions (test rapide)
  --dry-run              N'écrit rien, affiche juste le résumé
  --self-test            Teste le parsing sur des données embarquées (hors-ligne)
  -h, --help             Cette aide
`);
}

// ── HTTP ─────────────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url, { retries = 3 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (res.status === 404) return null; // pas de données pour ce (champ, rôle)
      if (res.status === 403 || res.status === 429 || res.status >= 500) {
        throw new Error(`HTTP ${res.status}`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await sleep(1500 * (attempt + 1));
    }
  }
  throw lastErr;
}

// ── Data Dragon ──────────────────────────────────────────────────────────────
async function loadChampions() {
  const versions = await fetchJson(`${DDRAGON}/api/versions.json`);
  const version = Array.isArray(versions) && versions.length ? versions[0] : '14.1.1';
  const champ = await fetchJson(`${DDRAGON}/cdn/${version}/data/en_US/champion.json`);
  const keyToId = new Map();
  const champions = [];
  for (const id of Object.keys(champ.data || {})) {
    const key = parseInt(champ.data[id].key, 10);
    keyToId.set(key, id);
    champions.push({ key, id, name: champ.data[id].name });
  }
  return { version, keyToId, champions };
}

// ── Adapter OP.GG ────────────────────────────────────────────────────────────
// Localise le tableau de counters quelle que soit l'imbrication renvoyée.
function findCountersArray(json) {
  if (!json) return null;
  const candidates = [
    json.data && json.data.data && json.data.data.counters,
    json.data && json.data.counters,
    json.counters,
    json.data && Array.isArray(json.data) ? null : null,
  ];
  for (const c of candidates) if (Array.isArray(c)) return c;
  return null;
}

/**
 * Transforme une réponse counters OP.GG en liste d'ids DDragon (les champions
 * qui counterent le champion interrogé), triés par winrate décroissant.
 * Pur et testable.
 */
function rankCountersFromResponse(json, keyToId, { minGames, topN }) {
  const arr = findCountersArray(json);
  if (!arr) return [];
  return arr
    .map((e) => {
      const cid = e.champion_id != null ? e.champion_id : e.championId;
      const play = Number(e.play != null ? e.play : e.games) || 0;
      const win = Number(e.win != null ? e.win : e.wins) || 0;
      return { cid: Number(cid), play, win, wr: play > 0 ? win / play : 0 };
    })
    .filter((e) => e.play >= minGames && keyToId.has(e.cid))
    .sort((a, b) => b.wr - a.wr)
    .slice(0, topN)
    .map((e) => keyToId.get(e.cid));
}

function opggCountersUrl(opts, championId, position) {
  return `https://lol-api-champion.op.gg/api/${opts.region}/champions/ranked/${championId}/${position}/counters?tier=${opts.tier}`;
}

// ── Fusion dans counters.json ────────────────────────────────────────────────
function mergeCounters(existing, freshCounters) {
  const out = { ...existing };
  out.counters = freshCounters;
  out._countersUpdatedAt = new Date().toISOString();
  out._countersSource = 'op.gg (données agrégées, usage non commercial)';
  return out;
}

function backup(file) {
  if (!fs.existsSync(file)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = file.replace(/\.json$/, `.backup-${stamp}.json`);
  fs.copyFileSync(file, dest);
  return dest;
}

// ── Auto-test hors-ligne (vérifie le parsing sans réseau) ────────────────────
function selfTest() {
  const keyToId = new Map([
    [238, 'Zed'],
    [80, 'Pantheon'],
    [90, 'Malzahar'],
    [127, 'Lissandra'],
    [10, 'Kayle'],
    [131, 'Diana'],
  ]);
  const sampleA = {
    data: {
      data: {
        counters: [
          { champion_id: 80, play: 5000, win: 2900 }, // wr 0.58
          { champion_id: 90, play: 4000, win: 2280 }, // wr 0.57
          { champion_id: 127, play: 3000, win: 1650 }, // wr 0.55
          { champion_id: 10, play: 50, win: 40 }, // exclu: < minGames
          { champion_id: 999, play: 3000, win: 2000 }, // exclu: champ inconnu
        ],
      },
    },
  };
  const sampleB = { counters: [{ champion_id: 131, play: 1200, win: 660 }] }; // forme plate
  const a = rankCountersFromResponse(sampleA, keyToId, { minGames: 100, topN: 5 });
  const b = rankCountersFromResponse(sampleB, keyToId, { minGames: 100, topN: 5 });
  console.log('self-test A (attendu Pantheon,Malzahar,Lissandra):', a.join(', '));
  console.log('self-test B (attendu Diana):', b.join(', '));
  const merged = mergeCounters({ damageOverride: { X: 'AP' }, counters: { Old: [] }, rolePicks: { TOP: ['Garen'] } }, { Zed: a });
  const ok =
    a.join(',') === 'Pantheon,Malzahar,Lissandra' &&
    b.join(',') === 'Diana' &&
    merged.damageOverride.X === 'AP' &&
    merged.rolePicks.TOP[0] === 'Garen' &&
    merged.counters.Zed.length === 3;
  console.log(ok ? '\n✅ self-test OK (parsing + fusion corrects, champs éditoriaux préservés)' : '\n❌ self-test ÉCHEC');
  process.exit(ok ? 0 : 1);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) return printHelp();
  if (opts.selfTest) return selfTest();
  if (opts.source !== 'opgg') {
    console.error(`Source "${opts.source}" non implémentée. Seule "opgg" est disponible pour l'instant.`);
    process.exit(1);
  }

  console.log('⏳ Récupération des champions (Data Dragon)…');
  const { version, keyToId, champions } = await loadChampions();
  console.log(`   Patch ${version}, ${champions.length} champions.`);

  let targets = champions;
  if (opts.champions) {
    const wanted = new Set(opts.champions.map((s) => s.toLowerCase().replace(/[^a-z0-9]/g, '')));
    targets = champions.filter((c) => wanted.has(c.id.toLowerCase()) || wanted.has(c.name.toLowerCase().replace(/[^a-z0-9]/g, '')));
  }
  if (opts.limit > 0) targets = targets.slice(0, opts.limit);

  console.log(`🌐 Source OP.GG | région=${opts.region} tier=${opts.tier} top=${opts.topN} minGames=${opts.minGames}`);
  console.log(`   ${targets.length} champions × jusqu'à ${OPGG_POSITIONS.length} rôles, ~${opts.throttleMs}ms/req.`);
  console.log('   ⚠️ API tierce non officielle — usage personnel/non commercial, faible volume.\n');

  const counters = {};
  const champData = {}; // champId -> { roleKey -> { overallWinRate, games, matchups } }
  let reqCount = 0;
  let withData = 0;

  for (let i = 0; i < targets.length; i++) {
    const champ = targets[i];
    const merged = new Map(); // cid -> meilleur {wr, play} (union multi-rôles, pour counters.json)
    const perRole = {}; // roleKey -> Map(cid -> {play, win})
    for (const pos of OPGG_POSITIONS) {
      await sleep(opts.throttleMs);
      reqCount++;
      let json = null;
      try {
        json = await fetchJson(opggCountersUrl(opts, champ.key, pos));
      } catch (e) {
        process.stdout.write(`  ⚠️ ${champ.id}/${pos}: ${e.message}\n`);
        continue;
      }
      const arr = findCountersArray(json);
      if (!arr || !arr.length) continue;
      const roleKey = OPGG_ROLE[pos];
      for (const e of arr) {
        const cid = Number(e.champion_id != null ? e.champion_id : e.championId);
        const play = Number(e.play != null ? e.play : e.games) || 0;
        const win = Number(e.win != null ? e.win : e.wins) || 0;
        if (play < opts.minGames || !keyToId.has(cid)) continue;
        const wrOpp = win / play; // winrate de l'adversaire CONTRE ce champion
        const prev = merged.get(cid);
        if (!prev || wrOpp > prev.wr) merged.set(cid, { wr: wrOpp, play });
        if (!perRole[roleKey]) perRole[roleKey] = new Map();
        perRole[roleKey].set(cid, { play, win });
      }
    }
    if (merged.size) {
      counters[champ.id] = [...merged.entries()]
        .sort((a, b) => b[1].wr - a[1].wr)
        .slice(0, opts.topN)
        .map(([cid]) => keyToId.get(cid));
      withData++;
    }
    // champion-data.json : winrate du CHAMPION (≈ 1 - winrate adverse) par rôle.
    for (const roleKey of Object.keys(perRole)) {
      const m = perRole[roleKey];
      let totalPlay = 0;
      let myWins = 0;
      const matchups = [];
      for (const [cid, { play, win }] of m.entries()) {
        totalPlay += play;
        myWins += play - win;
        matchups.push({ id: keyToId.get(cid), wr: (play - win) / play, games: play });
      }
      if (matchups.length) {
        if (!champData[champ.id]) champData[champ.id] = {};
        champData[champ.id][roleKey] = {
          overallWinRate: totalPlay ? myWins / totalPlay : null,
          games: totalPlay,
          matchups,
        };
      }
    }
    process.stdout.write(
      `\r[${i + 1}/${targets.length}] ${champ.id.padEnd(14)} counters=${(counters[champ.id] || []).length}  (req ${reqCount})   `
    );
  }
  process.stdout.write('\n\n');

  console.log(`✅ ${withData} champions avec counters, ${reqCount} requêtes.`);

  if (!withData) {
    console.error('Aucune donnée récupérée. L\'API a peut-être changé, ou l\'accès est bloqué. Réessaie ou vérifie l\'endpoint.');
    process.exit(1);
  }

  let existing = {};
  try {
    existing = JSON.parse(fs.readFileSync(COUNTERS_FILE, 'utf8'));
  } catch {
    console.warn('counters.json illisible — création d\'un dataset minimal.');
    existing = { damageOverride: {}, ccHeavy: [], burstThreats: [], counters: {}, rolePicks: {} };
  }
  const result = mergeCounters(existing, counters);

  if (opts.dryRun) {
    console.log('🔍 --dry-run : aucune écriture. Aperçu de 5 entrées :');
    Object.entries(counters).slice(0, 5).forEach(([k, v]) => console.log(`   ${k} <- ${v.join(', ')}`));
    console.log(`   (champion-data.json : ${Object.keys(champData).length} champions avec winrates)`);
    return;
  }

  const bak = backup(COUNTERS_FILE);
  if (bak) console.log(`💾 Sauvegarde : ${path.basename(bak)}`);
  fs.writeFileSync(COUNTERS_FILE, JSON.stringify(result, null, 2) + '\n');
  console.log(`📝 counters.json mis à jour (${withData} champions).`);

  const champDataOut = {
    _meta: {
      source: 'op.gg',
      tier: opts.tier,
      region: opts.region,
      note: 'winrate du champion ≈ 1 - winrate adverse, dérivé des match-ups',
    },
    champions: champData,
  };
  fs.writeFileSync(CHAMPDATA_FILE, JSON.stringify(champDataOut, null, 2) + '\n');
  console.log(`📝 champion-data.json mis à jour (${Object.keys(champData).length} champions, winrates/match-ups).`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error('\nErreur :', e.message);
    process.exit(1);
  });
}

module.exports = { rankCountersFromResponse, findCountersArray, mergeCounters };
