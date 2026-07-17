'use strict';

// Base de connaissances TOUS CHAMPIONS (data/champions-kb.json).
// Fournit, pour N'IMPORTE quel champion (même hors builds curés / pool) :
//   • sa classe d'archétype (assassin, mage burst, diver, tank…) + type de dégâts ;
//   • un BUILD GÉNÉRIQUE de classe (items/runes/sorts) en fallback des builds
//     curés (data/builds.json) et high-elo (builds-live.json) ;
//   • un style de jeu (décisions in-game) + tip spécifique au champion ;
//   • les rôles méta → suggestions de pick pour tous les rôles.
// Un champion sorti APRÈS cette base est classé au runtime via ses tags
// Data Dragon (classifyFromTags), donc l'app ne casse jamais sur un nouveau champion.

const fs = require('fs');
const path = require('path');

const KB_FILE = path.join(__dirname, '..', '..', 'data', 'champions-kb.json');

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

let KB = null;
let BY_NORM = null;
let BY_KEY = null;

function loadKb() {
  if (KB) return KB;
  try {
    KB = JSON.parse(fs.readFileSync(KB_FILE, 'utf8'));
  } catch {
    KB = { classes: {}, champions: {} };
  }
  BY_NORM = new Map();
  BY_KEY = new Map();
  for (const [id, e] of Object.entries(KB.champions || {})) {
    const entry = { id, ...e };
    BY_NORM.set(norm(id), entry);
    if (e.name) BY_NORM.set(norm(e.name), entry);
    if (e.key != null) BY_KEY.set(Number(e.key), entry);
  }
  return KB;
}

// Déduit une classe d'archétype depuis les tags Data Dragon (nouveaux champions
// absents de la base). Approximation raisonnable : le build générique reste jouable.
function classifyFromTags(tags, dmg) {
  const t = tags || [];
  if (t.includes('Marksman')) return dmg === 'AP' ? 'burst-mage' : 'marksman-crit';
  if (t.includes('Assassin')) return dmg === 'AP' ? 'assassin-ap' : 'assassin-ad';
  if (t.includes('Mage')) return t.includes('Support') ? 'enchanter' : 'burst-mage';
  if (t.includes('Support')) return t.includes('Tank') ? 'engage-support' : 'enchanter';
  if (t.includes('Tank')) return 'tank';
  if (t.includes('Fighter')) return dmg === 'AP' ? 'battlemage' : 'juggernaut';
  return 'skirmisher';
}

/**
 * Entrée de la base pour un champion (id/nom Data Dragon, ou key numérique).
 * `champ` optionnel : entrée Data Dragon { id, name, tags } pour classer un
 * champion inconnu de la base (nouveau champion) au lieu de renvoyer null.
 */
function kbEntry(idOrKey, champ) {
  loadKb();
  if (idOrKey != null) {
    const asNum = Number(idOrKey);
    if (Number.isFinite(asNum) && BY_KEY.has(asNum)) return BY_KEY.get(asNum);
    const e = BY_NORM.get(norm(idOrKey));
    if (e) return e;
  }
  if (champ && champ.id) {
    const e = BY_NORM.get(norm(champ.id)) || BY_NORM.get(norm(champ.name));
    if (e) return e;
    // Champion inconnu (post-base) : entrée synthétique depuis les tags.
    const tags = champ.tags || [];
    const dmg = tags.includes('Mage') || tags.includes('Support') ? 'AP' : 'AD';
    return { id: champ.id, key: champ.key != null ? Number(champ.key) : null, roles: [], dmg, cls: classifyFromTags(tags, dmg), synthetic: true };
  }
  return null;
}

/** Définition d'une classe d'archétype (label, build générique, style de jeu). */
function kbClass(cls) {
  loadKb();
  return (KB.classes || {})[cls] || null;
}

/**
 * Build GÉNÉRIQUE de classe pour un champion — même forme que data/builds.json
 * (start/boots/core/situational/runes/summoners/note). Fallback quand ni build
 * curé ni build high-elo n'existe : l'app conseille ainsi TOUS les champions.
 */
function genericBuild(idOrKey, champ) {
  const e = kbEntry(idOrKey, champ);
  if (!e) return null;
  const c = kbClass(e.cls);
  if (!c) return null;
  return {
    profile: { style: c.label, description: c.playstyle },
    runes: c.runes || null,
    summoners: c.summoners || null,
    start: c.start || null,
    boots: c.boots || null,
    core: c.core || [],
    situational: c.situational || [],
    note: (e.tip ? e.tip + ' ' : '') + `Build générique « ${c.label} » — adapte les objets défensifs à la composition adverse.`,
    generic: true,
  };
}

/** Conseil de jeu (décisions in-game) : tip champion sinon style de classe. */
function playstyleTip(idOrKey, champ) {
  const e = kbEntry(idOrKey, champ);
  if (!e) return null;
  if (e.tip) return e.tip;
  const c = kbClass(e.cls);
  return c ? c.playstyle : null;
}

/** Ids des champions de la base jouant un rôle donné (TOP/JUNGLE/MIDDLE/BOTTOM/UTILITY). */
function championsForRole(role) {
  loadKb();
  const out = [];
  for (const [id, e] of Object.entries(KB.champions || {})) {
    if ((e.roles || []).includes(role)) out.push(id);
  }
  return out;
}

/** Traits utiles au coach in-game (burst/CC/tank/sustain) déduits de la classe. */
function kbTraits(idOrKey, champ) {
  const e = kbEntry(idOrKey, champ);
  if (!e) return null;
  const cls = e.cls || '';
  return {
    cls,
    dmg: e.dmg || null,
    burst: ['assassin-ad', 'assassin-ap', 'burst-mage'].includes(cls),
    assassin: cls.startsWith('assassin'),
    hardCC: ['tank', 'engage-support'].includes(cls),
    tanky: ['tank', 'juggernaut', 'engage-support'].includes(cls),
    sustainedDps: ['marksman-onhit', 'skirmisher', 'battlemage'].includes(cls),
  };
}

/** Nombre de champions couverts (pour les tests / le statut). */
function kbSize() {
  loadKb();
  return Object.keys(KB.champions || {}).length;
}

module.exports = { kbEntry, kbClass, genericBuild, playstyleTip, championsForRole, kbTraits, kbSize, classifyFromTags };
