'use strict';

// Icônes OFFICIELLES du jeu (objets + portraits de champions) servies par le
// serveur local en PNG propre : l'UI pointe /items/<id>.png et /champs/<id>.png.
// Le serveur télécharge l'image Data Dragon UNE fois, la met en cache disque
// (.cache/img/) puis la sert en local — plus aucune dépendance CDN côté
// navigateur/overlay (pas de CORS, pas d'icône cassée si le CDN rame).

const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, '..', '..', '.cache', 'img');
const CDN = 'https://ddragon.leagueoflegends.com';

function ensureDir() {
  try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch { /* ignore */ }
}

async function fetchImage(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get('content-type') || '';
  if (!type.startsWith('image/')) throw new Error(`pas une image (${type})`);
  return Buffer.from(await res.arrayBuffer());
}

// Mémo des échecs récents pour ne pas marteler le CDN à chaque tick d'affichage.
const failedAt = new Map(); // cacheKey -> timestamp du dernier échec
const RETRY_MS = 5 * 60 * 1000;

async function cachedImage(cacheKey, urls) {
  ensureDir();
  const file = path.join(CACHE_DIR, cacheKey);
  try {
    return fs.readFileSync(file);
  } catch { /* pas en cache */ }
  const lastFail = failedAt.get(cacheKey);
  if (lastFail && Date.now() - lastFail < RETRY_MS) return null;
  for (const url of urls) {
    try {
      const buf = await fetchImage(url);
      try { fs.writeFileSync(file, buf); } catch { /* best-effort */ }
      failedAt.delete(cacheKey);
      return buf;
    } catch { /* essaie l'URL suivante */ }
  }
  failedAt.set(cacheKey, Date.now());
  return null;
}

/** PNG d'un objet par id numérique (ou null si introuvable/hors-ligne). */
async function getItemIcon(ddragon, id) {
  const num = Number(id);
  if (!Number.isInteger(num) || num <= 0) return null;
  const version = (ddragon && ddragon.version) || '14.1.1';
  const it = ddragon && ddragon.itemById ? ddragon.itemById.get(num) : null;
  const image = (it && it.image) || `${num}.png`;
  return cachedImage(`item-${version}-${num}.png`, [
    `${CDN}/cdn/${version}/img/item/${image}`,
  ]);
}

/** PNG du portrait carré d'un champion par id Data Dragon (ex. "Ahri"). */
async function getChampionIcon(ddragon, champId) {
  if (!/^[A-Za-z0-9]{2,32}$/.test(String(champId || ''))) return null;
  const version = (ddragon && ddragon.version) || '14.1.1';
  return cachedImage(`champ-${version}-${champId}.png`, [
    `${CDN}/cdn/${version}/img/champion/${champId}.png`,
  ]);
}

module.exports = { getItemIcon, getChampionIcon };
