#!/usr/bin/env node
'use strict';

/**
 * Génère data/builds-live.json à partir des builds RÉELS des meilleurs joueurs
 * (high-elo, par rôle) récupérés sur un agrégateur en ligne.
 *
 *   node scripts/fetch-builds.js [options]
 *
 * Source par défaut : l'API de statistiques u.gg (stats2.u.gg, NON officielle).
 * Elle renvoie, par région/rang/rôle, des blocs positionnels :
 *   roleBlock[2] = objets de départ, roleBlock[3] = objets "core",
 *   roleBlock[4..6] = options des 4e/5e/6e objets.  (cf. constantes UGG_* ci-dessous)
 *
 * ⚠️ À lire :
 *  - API tierce NON officielle : son format peut changer à tout moment. Lance ce
 *    script CHEZ TOI (l'accès réseau peut être restreint ailleurs). En cas de
 *    changement de format, ajuste les constantes UGG_* / le parseur, ou ouvre une
 *    issue : la logique de transformation est couverte par `--self-test`.
 *  - Respecte les CGU de la source : usage personnel/non commercial, faible
 *    volume. Le script limite la cadence (~1 req/s).
 *  - Sortie : data/builds-live.json (préféré automatiquement par l'app si présent ;
 *    sinon elle retombe sur data/builds.json, les builds curés). Tes builds curés
 *    ne sont jamais écrasés.
 *  - Les noms d'objets sont résolus via Data Dragon (pour l'affichage des icônes).
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUT_FILE = path.join(DATA_DIR, 'builds-live.json');
const DDRAGON = 'https://ddragon.leagueoflegends.com';

// Rôles internes <-> identifiants de rôle u.gg.
const ROLE_TO_UGG = { TOP: 4, JUNGLE: 1, MIDDLE: 5, BOTTOM: 3, UTILITY: 2 };
const ROLES = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];

// Indices positionnels dans un bloc de rôle u.gg (documentés par la communauté).
// Ajuste ici si le format upstream évolue.
const UGG = {
  STARTING_ITEMS: 2,
  CORE_ITEMS: 3,
  ITEM_4: 4,
  ITEM_5: 5,
  ITEM_6: 6,
  SKILLS: 7,
};
const SKILL_LETTER = { 1: 'Q', 2: 'W', 3: 'E', 4: 'R' };
// Identifiants région/rang u.gg (par défaut : monde, emerald+).
const UGG_REGION = { world: 12, kr: 2, euw: 1, na: 3 };
const UGG_RANK = { emerald_plus: 10, diamond_plus: 9, master_plus: 11, challenger: 7 };

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json',
  Referer: 'https://u.gg/',
  Origin: 'https://u.gg',
};

// ── CLI ─────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const o = {
    region: 'world',
    rank: 'emerald_plus',
    throttleMs: 1100,
    limit: 0,
    champions: null, // ex: Zed,Caitlyn (sinon : tous ceux de ta pool)
    poolOnly: true, // par défaut, seulement les champions de ta pool
    dryRun: false,
    selfTest: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--region') o.region = argv[++i];
    else if (a === '--rank') o.rank = argv[++i];
    else if (a === '--champions') o.champions = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--all') o.poolOnly = false;
    else if (a === '--throttle') o.throttleMs = parseInt(argv[++i], 10) || 1100;
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--self-test') o.selfTest = true;
    else if (a === '--help' || a === '-h') o.help = true;
  }
  return o;
}

function printHelp() {
  console.log(`fetch-builds — builds high-elo -> data/builds-live.json

Options :
  --region <world|kr|euw|na>   Région u.gg (défaut world)
  --rank <emerald_plus|diamond_plus|master_plus|challenger>  (défaut emerald_plus)
  --champions Zed,Caitlyn       Limite à ces champions (sinon : ta pool)
  --all                         Tous les champions (au lieu de ta seule pool)
  --throttle <ms>               Délai entre requêtes (défaut 1100)
  --dry-run                     N'écrit rien, affiche un aperçu
  --self-test                   Teste le parsing hors-ligne (données embarquées)
`);
}

// ── Parsing (testé par --self-test) ─────────────────────────────────────────
// Extrait une liste d'itemIds depuis un bloc d'objets u.gg, de forme typique
// [winCount, matchCount, [id, id, ...]] OU [[id,...], ...]. Défensif.
function extractItemIds(block) {
  if (!Array.isArray(block)) return [];
  // Cherche le premier sous-tableau d'entiers (les itemIds).
  for (const el of block) {
    if (Array.isArray(el) && el.length && el.every((x) => Number.isInteger(x))) {
      return el.filter((x) => x > 0);
    }
  }
  // Variante : le bloc lui-même est un tableau d'entiers.
  if (block.every((x) => Number.isInteger(x))) return block.filter((x) => x > 0);
  return [];
}

// Première option d'item depuis un bloc "options" (liste d'options triées par WR).
function firstOption(block) {
  const ids = extractItemIds(block);
  return ids.length ? ids[0] : null;
}

// Ordre de montée des sorts : déduit la PRIORITÉ Q/W/E depuis la séquence de
// niveaux (tableau d'entiers 1=Q,2=W,3=E,4=R). Renvoie "Q → E → W" ou null.
function extractSkillOrder(block) {
  if (!Array.isArray(block)) return null;
  let levels = null;
  const scan = (arr) => {
    if (!Array.isArray(arr)) return;
    if (arr.length >= 10 && arr.every((x) => Number.isInteger(x) && x >= 1 && x <= 4)) {
      levels = arr;
      return;
    }
    for (const el of arr) if (!levels) scan(el);
  };
  scan(block);
  if (!levels) return null;
  const firstIdx = {};
  const count = { 1: 0, 2: 0, 3: 0 };
  levels.forEach((s, i) => {
    if (s >= 1 && s <= 3) {
      if (firstIdx[s] == null) firstIdx[s] = i;
      count[s]++;
    }
  });
  const skills = [1, 2, 3].filter((s) => firstIdx[s] != null);
  if (!skills.length) return null;
  skills.sort((a, b) => count[b] - count[a] || firstIdx[a] - firstIdx[b]);
  return skills.map((s) => SKILL_LETTER[s]).join(' → ');
}

// Transforme un bloc de rôle u.gg en build brut (itemIds + ordre des sorts).
function buildFromUggRole(roleBlock) {
  if (!Array.isArray(roleBlock)) return null;
  const start = extractItemIds(roleBlock[UGG.STARTING_ITEMS]).slice(0, 2);
  const core = extractItemIds(roleBlock[UGG.CORE_ITEMS]).slice(0, 3);
  const situational = [roleBlock[UGG.ITEM_4], roleBlock[UGG.ITEM_5], roleBlock[UGG.ITEM_6]]
    .map(firstOption)
    .filter(Boolean);
  const skillOrder = extractSkillOrder(roleBlock[UGG.SKILLS]);
  if (!core.length) return null;
  return { startIds: start, coreIds: core, situationalIds: situational, skillOrder };
}

// Sépare bottes vs objets dans une liste d'itemIds, via l'ensemble des bottes connues.
function splitBoots(ids, bootsSet) {
  const boots = ids.find((id) => bootsSet.has(id)) || null;
  const rest = ids.filter((id) => id !== boots);
  return { boots, rest };
}

// ── Self-test ───────────────────────────────────────────────────────────────
function selfTest() {
  // Bloc de rôle factice à la forme u.gg.
  const fakeRole = [];
  fakeRole[UGG.STARTING_ITEMS] = [120, 340, [1055, 2003]]; // Doran's Blade + potion
  fakeRole[UGG.CORE_ITEMS] = [70, 130, [3006, 6672, 3031]]; // Berserker + Kraken + IE
  fakeRole[UGG.ITEM_4] = [[3036, 200], [3072, 150]]; // options 4e : LDR en tête
  fakeRole[UGG.ITEM_5] = [[3139], [3026]];
  fakeRole[UGG.ITEM_6] = [];
  // Séquence de niveaux : Q max (priorité), puis E, puis W.
  fakeRole[UGG.SKILLS] = [10, 20, [1, 3, 1, 2, 1, 4, 1, 3, 1, 3, 4, 3, 2, 2, 4, 2, 3, 2]];
  const raw = buildFromUggRole(fakeRole);
  const skillOk = raw.skillOrder === 'Q → E → W';
  console.log('skillOrder:', raw.skillOrder, skillOk ? '(OK)' : '(ATTENDU Q → E → W)');
  const bootsSet = new Set([3006, 3020, 3047, 3111, 3117, 3158]);
  const { boots, rest } = splitBoots(raw.coreIds, bootsSet);
  const ok =
    raw.startIds.join(',') === '1055,2003' &&
    raw.coreIds.join(',') === '3006,6672,3031' &&
    boots === 3006 &&
    rest.join(',') === '6672,3031' &&
    raw.situationalIds.join(',') === '3036,3139';
  console.log('start:', raw.startIds, '| core:', raw.coreIds, '| boots:', boots, '| situational:', raw.situationalIds);
  console.log(ok ? '\n✅ self-test OK (extraction itemIds + split bottes corrects)' : '\n❌ self-test ÉCHEC');
  process.exit(ok ? 0 : 1);
}

// ── Réseau ──────────────────────────────────────────────────────────────────
async function getJson(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
  return res.json();
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Construit l'URL u.gg overview pour un champion (clé numérique).
function uggUrl(champKey, patch) {
  const p = patch.split('.').slice(0, 2).join('_'); // 14.13.1 -> 14_13
  return `https://stats2.u.gg/lol/1.5/overview/${p}/ranked_solo_5x5/${champKey}/1.5.0.json`;
}

// Navigue le JSON u.gg jusqu'au bloc de rôle (défensif : structure imbriquée).
function findRoleBlock(json, regionId, rankId, roleId) {
  try {
    const r = json[regionId] || json[String(regionId)];
    const rk = r && (r[rankId] || r[String(rankId)]);
    const role = rk && (rk[roleId] || rk[String(roleId)]);
    // role[0] est typiquement le bloc de données ; sinon role lui-même.
    if (Array.isArray(role)) return Array.isArray(role[0]) ? role[0] : role;
  } catch {
    /* structure inattendue */
  }
  return null;
}

async function loadDdragon() {
  const versions = await getJson(`${DDRAGON}/api/versions.json`);
  const patch = versions[0];
  const champ = await getJson(`${DDRAGON}/cdn/${patch}/data/en_US/champion.json`);
  const items = await getJson(`${DDRAGON}/cdn/${patch}/data/en_US/item.json`);
  const keyById = {}; // ddragon id -> numeric key
  for (const id of Object.keys(champ.data)) keyById[id] = parseInt(champ.data[id].key, 10);
  const itemName = {};
  const bootsSet = new Set();
  for (const itemId of Object.keys(items.data)) {
    const it = items.data[itemId];
    itemName[parseInt(itemId, 10)] = it.name;
    if ((it.tags || []).includes('Boots')) bootsSet.add(parseInt(itemId, 10));
  }
  return { patch, keyById, itemName, bootsSet };
}

function poolChampionIds() {
  try {
    const pool = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'champion-pool.json'), 'utf8')).pool || {};
    const out = new Map(); // ddragon id -> roles[]
    for (const role of Object.keys(pool)) {
      for (const e of pool[role]) {
        const id = e.champion;
        if (!out.has(id)) out.set(id, []);
        out.get(id).push(role);
      }
    }
    return out;
  } catch {
    return new Map();
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) return printHelp();
  if (opts.selfTest) return selfTest();

  const regionId = UGG_REGION[opts.region] || UGG_REGION.world;
  const rankId = UGG_RANK[opts.rank] || UGG_RANK.emerald_plus;

  console.log(`fetch-builds — région ${opts.region}(${regionId}), rang ${opts.rank}(${rankId})`);
  const dd = await loadDdragon();
  console.log(`Data Dragon prêt (patch ${dd.patch}).`);

  // Quels champions/rôles cibler.
  const targets = new Map(); // ddragon id -> roles[]
  if (opts.champions) {
    for (const id of opts.champions) targets.set(id, ROLES.slice());
  } else if (opts.poolOnly) {
    for (const [id, roles] of poolChampionIds()) targets.set(id, roles);
  } else {
    for (const id of Object.keys(dd.keyById)) targets.set(id, ROLES.slice());
  }
  if (!targets.size) {
    console.log('Aucun champion ciblé (pool vide ?). Utilise --champions ou --all.');
    return;
  }

  const builds = {};
  let okCount = 0;
  for (const [champId, roles] of targets) {
    const key = dd.keyById[champId];
    if (!key) {
      console.log(`  ? ${champId} inconnu de Data Dragon, ignoré.`);
      continue;
    }
    let json = null;
    try {
      json = await getJson(uggUrl(key, dd.patch));
    } catch (e) {
      console.log(`  ✗ ${champId} : ${e.message}`);
      await sleep(opts.throttleMs);
      continue;
    }
    for (const role of roles) {
      const roleId = ROLE_TO_UGG[role];
      const block = findRoleBlock(json, regionId, rankId, roleId);
      const raw = block && buildFromUggRole(block);
      if (!raw) continue;
      const { boots, rest } = splitBoots(raw.coreIds, dd.bootsSet);
      const nameOf = (id) => dd.itemName[id] || null;
      const core = rest.map(nameOf).filter(Boolean);
      const start = raw.startIds.map(nameOf).filter(Boolean)[0] || null;
      const situational = raw.situationalIds.map(nameOf).filter(Boolean);
      if (!core.length) continue;
      builds[champId] = builds[champId] || {};
      builds[champId][role] = {
        start,
        boots: boots ? nameOf(boots) : null,
        core,
        situational,
        skillOrder: raw.skillOrder || null,
        source: `u.gg ${opts.region}/${opts.rank}`,
      };
      okCount++;
      console.log(`  ✓ ${champId} ${role}: ${core.join(' → ')}`);
    }
    await sleep(opts.throttleMs);
  }

  const result = { _meta: { source: 'u.gg', region: opts.region, rank: opts.rank, patch: dd.patch, generatedAt: new Date().toISOString() }, builds };
  if (opts.dryRun) {
    console.log(`\n🔍 --dry-run : ${okCount} builds extraits, rien n'est écrit.`);
    return;
  }
  if (!okCount) {
    console.log('\n⚠️ Aucun build extrait — le format upstream a probablement changé. Lance --self-test pour vérifier la logique, puis ajuste les constantes UGG_* / le parseur.');
    return;
  }
  fs.writeFileSync(OUT_FILE, JSON.stringify(result, null, 2) + '\n');
  console.log(`\n✅ ${okCount} builds écrits dans ${path.relative(process.cwd(), OUT_FILE)}. L'app les préfère automatiquement.`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error('Échec:', e.message);
    process.exit(1);
  });
}

module.exports = { extractItemIds, firstOption, buildFromUggRole, splitBoots, findRoleBlock, extractSkillOrder };
