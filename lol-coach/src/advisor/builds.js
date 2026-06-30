'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

let CURATED = null;
function loadCurated() {
  if (CURATED) return CURATED;
  try {
    CURATED = (JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'builds.json'), 'utf8')).builds) || {};
  } catch {
    CURATED = {};
  }
  return CURATED;
}

// builds-live.json (généré par fetch-builds) : préféré s'il existe. Rechargé si
// le fichier change (mtime), pour refléter une régénération sans redémarrage.
let LIVE = undefined;
let LIVE_MTIME = 0;
function loadLive() {
  const file = path.join(DATA_DIR, 'builds-live.json');
  try {
    const m = fs.statSync(file).mtimeMs;
    if (LIVE === undefined || m !== LIVE_MTIME) {
      LIVE = JSON.parse(fs.readFileSync(file, 'utf8'));
      LIVE_MTIME = m;
    }
  } catch {
    LIVE = null;
  }
  return LIVE;
}

/**
 * Build conseillé pour un champion (et un rôle si connu).
 * Si des builds live (high-elo) existent pour ce champion/rôle, on prend leurs
 * OBJETS (start/boots/core/situational) ; on garde profil/runes/sorts/note des
 * builds curés (data/builds.json) qui portent ce contexte éditorial.
 */
function getBuild(champId, role) {
  const curated = loadCurated()[champId] || null;
  const live = loadLive();
  const liveEntry = role && live && live.builds && live.builds[champId] && live.builds[champId][role];
  if (!liveEntry) return curated;
  const nonEmpty = (a) => Array.isArray(a) && a.length;
  return {
    profile: curated ? curated.profile : null,
    runes: curated ? curated.runes : null,
    summoners: curated ? curated.summoners : null,
    start: liveEntry.start || (curated && curated.start) || null,
    boots: liveEntry.boots || (curated && curated.boots) || null,
    core: nonEmpty(liveEntry.core) ? liveEntry.core : curated && curated.core,
    situational: nonEmpty(liveEntry.situational) ? liveEntry.situational : curated && curated.situational,
    note: curated ? curated.note : null,
    source: liveEntry.source || null,
  };
}

function hasLiveBuilds() {
  const live = loadLive();
  return Boolean(live && live.builds && Object.keys(live.builds).length);
}

module.exports = { getBuild, hasLiveBuilds, loadCurated };
