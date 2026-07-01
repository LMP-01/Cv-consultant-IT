'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const FILE = path.join(DATA_DIR, 'history.json');
const MAX_GAMES = 200;

// Stockage local des parties jouées avec le coach (JSON sur disque).
class GameHistory {
  constructor() {
    this.games = this._load();
    this._seq = this.games.reduce((m, g) => Math.max(m, g.id || 0), 0);
  }

  _load() {
    try {
      const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      return Array.isArray(data.games) ? data.games : [];
    } catch {
      return [];
    }
  }

  _save() {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(FILE, JSON.stringify({ games: this.games }, null, 2));
    } catch {
      /* best-effort : pas de persistance si le disque est en lecture seule */
    }
  }

  add(record) {
    const id = ++this._seq;
    this.games.unshift({ id, ...record });
    if (this.games.length > MAX_GAMES) this.games.length = MAX_GAMES;
    this._save();
    return id;
  }

  update(id, patch) {
    const g = this.games.find((x) => x.id === id);
    if (!g) return false;
    Object.assign(g, patch);
    this._save();
    return true;
  }

  // Liste + statistiques agrégées (winrate, KDA moyen, par champion).
  list() {
    const played = this.games.length;
    const decided = this.games.filter((g) => g.win === true || g.win === false);
    const wins = this.games.filter((g) => g.win === true).length;
    const winrate = decided.length ? Math.round((wins / decided.length) * 100) : null;
    let k = 0, d = 0, a = 0, n = 0;
    const byChamp = {};
    for (const g of this.games) {
      if (g.kills != null) { k += g.kills; d += g.deaths || 0; a += g.assists || 0; n++; }
      if (g.champion) {
        const c = (byChamp[g.champion] = byChamp[g.champion] || { champion: g.champion, games: 0, wins: 0 });
        c.games++;
        if (g.win === true) c.wins++;
      }
    }
    return {
      games: this.games,
      stats: {
        played,
        decided: decided.length,
        wins,
        losses: decided.length - wins,
        winrate,
        avgKda: n ? { k: +(k / n).toFixed(1), d: +(d / n).toFixed(1), a: +(a / n).toFixed(1) } : null,
        byChampion: Object.values(byChamp).sort((x, y) => y.games - x.games),
        deathHeatmap: this._deathHeatmap(),
        profileByResult: this._profileByResult(),
      },
    };
  }

  // Heatmap temporelle des morts : nb de morts par tranche de minutes, agrégé
  // sur les parties qui ont enregistré les horodatages (deathTimes en secondes).
  _deathHeatmap() {
    const BUCKET = 5; // minutes par tranche
    const MAXMIN = 40;
    const buckets = [];
    for (let m = 0; m < MAXMIN; m += BUCKET) buckets.push({ from: m, to: m + BUCKET, deaths: 0 });
    let gamesWithData = 0;
    let totalDeaths = 0;
    for (const g of this.games) {
      if (!Array.isArray(g.deathTimes) || !g.deathTimes.length) continue;
      gamesWithData++;
      for (const sec of g.deathTimes) {
        const min = Math.floor((sec || 0) / 60);
        const idx = Math.min(buckets.length - 1, Math.floor(min / BUCKET));
        buckets[idx].deaths++;
        totalDeaths++;
      }
    }
    const peak = buckets.reduce((mx, b) => Math.max(mx, b.deaths), 0);
    const worst = totalDeaths ? buckets.slice().sort((x, y) => y.deaths - x.deaths)[0] : null;
    return { bucketMinutes: BUCKET, buckets, gamesWithData, totalDeaths, peak, worst };
  }

  // Profil moyen des games GAGNÉES vs PERDUES (pour se benchmarker sur son rythme
  // de victoire) : CS/min, KDA, morts, vision, durée.
  _profileByResult() {
    const agg = (pred) => {
      const g = this.games.filter((x) => pred(x) && x.kills != null);
      if (!g.length) return null;
      const avg = (f) => {
        const vals = g.map(f).filter((v) => typeof v === 'number' && !isNaN(v));
        return vals.length ? +(vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1) : null;
      };
      return {
        games: g.length,
        csPerMin: avg((x) => x.csPerMin),
        kills: avg((x) => x.kills),
        deaths: avg((x) => x.deaths),
        assists: avg((x) => x.assists),
        vision: avg((x) => x.wardScore),
        durationMin: avg((x) => (x.durationSec ? x.durationSec / 60 : null)),
        kp: avg((x) => x.kp),
      };
    };
    return { win: agg((x) => x.win === true), loss: agg((x) => x.win === false) };
  }
}

module.exports = { GameHistory };
