'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../config');

const CACHE_DIR = path.join(__dirname, '..', '..', '.cache');
const CDN = 'https://ddragon.leagueoflegends.com';

function ensureCacheDir() {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  } catch {
    /* ignore */
  }
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
  return res.json();
}

// JSON depuis le CDN avec cache disque ; repli sur le cache en cas d'échec réseau.
async function cachedJson(cacheKey, url) {
  ensureCacheDir();
  const cacheFile = path.join(CACHE_DIR, cacheKey);
  try {
    const data = await fetchJson(url);
    try {
      fs.writeFileSync(cacheFile, JSON.stringify(data));
    } catch {
      /* best-effort */
    }
    return data;
  } catch (netErr) {
    try {
      return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    } catch {
      throw netErr;
    }
  }
}

function normName(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

class DataDragon {
  constructor() {
    this.version = null;
    this.locale = config.ddragonLocale || 'en_US';
    this.championById = new Map(); // "Aatrox" -> { id, key, name(EN), displayName, tags }
    this.championByKey = new Map(); // championId numérique -> entrée
    this.nameIndex = new Map(); // nom normalisé (EN + localisé) -> id
    this.itemById = new Map();
    this.ready = false;
    this.initError = null;
  }

  async init() {
    try {
      const versions = await cachedJson('versions.json', `${CDN}/api/versions.json`);
      this.version = Array.isArray(versions) && versions.length ? versions[0] : '14.1.1';

      // Référentiel anglais : sert au matching des noms renvoyés par les API Riot.
      const champEn = await cachedJson(
        `champion_${this.version}_en_US.json`,
        `${CDN}/cdn/${this.version}/data/en_US/champion.json`
      );
      for (const id of Object.keys(champEn.data || {})) {
        const c = champEn.data[id];
        const entry = {
          id,
          key: parseInt(c.key, 10),
          name: c.name, // EN
          displayName: c.name, // remplacé par la locale ci-dessous
          title: c.title,
          tags: c.tags || [],
        };
        this.championById.set(id, entry);
        this.championByKey.set(entry.key, entry);
        this.nameIndex.set(normName(c.name), id);
        this.nameIndex.set(normName(id), id);
      }

      // Noms localisés pour l'affichage (si locale != en_US).
      if (this.locale && this.locale !== 'en_US') {
        try {
          const champLoc = await cachedJson(
            `champion_${this.version}_${this.locale}.json`,
            `${CDN}/cdn/${this.version}/data/${this.locale}/champion.json`
          );
          for (const id of Object.keys(champLoc.data || {})) {
            const entry = this.championById.get(id);
            if (entry) {
              entry.displayName = champLoc.data[id].name;
              this.nameIndex.set(normName(entry.displayName), id);
            }
          }
        } catch {
          /* la locale est optionnelle */
        }
      }

      // Items (optionnels) pour résoudre les noms d'objets du scoreboard.
      try {
        const items = await cachedJson(
          `item_${this.version}_${this.locale}.json`,
          `${CDN}/cdn/${this.version}/data/${this.locale}/item.json`
        );
        for (const itemId of Object.keys(items.data || {})) {
          const it = items.data[itemId];
          this.itemById.set(parseInt(itemId, 10), {
            id: parseInt(itemId, 10),
            name: it.name,
            gold: it.gold ? it.gold.total : 0,
            tags: it.tags || [],
          });
        }
      } catch {
        /* items optionnels */
      }

      this.ready = true;
    } catch (err) {
      this.initError = err.message;
      this._loadFallback();
    }
    return this;
  }

  // Charge le référentiel champion embarqué si Data Dragon est injoignable.
  _loadFallback() {
    try {
      const fb = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'champions.fallback.json'), 'utf8'));
      const champs = fb.champions || {};
      for (const id of Object.keys(champs)) {
        const c = champs[id];
        const entry = { id, key: c.key, name: c.name || id, displayName: c.name || id, tags: c.tags || [] };
        this.championById.set(id, entry);
        this.championByKey.set(entry.key, entry);
        this.nameIndex.set(normName(entry.name), id);
        this.nameIndex.set(normName(id), id);
      }
      if (!this.version) this.version = '14.1.1';
      this.usingFallback = true;
      this.ready = this.championById.size > 0;
    } catch {
      this.ready = false;
    }
  }

  resolveChampionByKey(key) {
    return this.championByKey.get(Number(key)) || null;
  }

  // Résout depuis un nom renvoyé par l'API Riot (EN ou localisé).
  resolveChampionByName(name) {
    const id = this.nameIndex.get(normName(name));
    return id ? this.championById.get(id) : null;
  }

  championNameByKey(key) {
    const c = this.resolveChampionByKey(key);
    return c ? c.displayName || c.name : null;
  }

  itemName(itemId) {
    const it = this.itemById.get(Number(itemId));
    return it ? it.name : null;
  }

  squarePortraitUrl(championIdStr) {
    if (!this.version || !championIdStr) return null;
    return `${CDN}/cdn/${this.version}/img/champion/${championIdStr}.png`;
  }
}

module.exports = { DataDragon };
