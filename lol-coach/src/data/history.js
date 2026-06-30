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
      },
    };
  }
}

module.exports = { GameHistory };
