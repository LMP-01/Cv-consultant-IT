'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const FILE = path.join(DATA_DIR, 'history.json');
const MAX_GAMES = 200;

// Stockage local des parties jouées avec le coach (JSON sur disque).
// `filePath` permet aux tests d'utiliser un fichier temporaire (ne pollue pas
// l'historique réel du joueur quand on lance `npm test`).
class GameHistory {
  constructor(filePath) {
    this.file = filePath || FILE;
    this.dir = path.dirname(this.file);
    this.games = this._load();
    this._seq = this.games.reduce((m, g) => Math.max(m, g.id || 0), 0);
  }

  _load() {
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return Array.isArray(data.games) ? data.games : [];
    } catch {
      return [];
    }
  }

  _save() {
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify({ games: this.games }, null, 2));
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

  // Importe plusieurs parties (ex. depuis la Riot API), dédoublonnées par matchId.
  // Les records sont insérés du plus ancien au plus récent pour garder l'ordre.
  importMany(records) {
    if (!Array.isArray(records) || !records.length) return 0;
    const seen = new Set(this.games.map((g) => g.matchId).filter(Boolean));
    const sorted = records.slice().sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
    let added = 0;
    for (const r of sorted) {
      if (r.matchId && seen.has(r.matchId)) continue;
      const id = ++this._seq;
      this.games.unshift({ id, ...r });
      if (r.matchId) seen.add(r.matchId);
      added++;
    }
    if (this.games.length > MAX_GAMES) this.games.length = MAX_GAMES;
    this._save();
    return added;
  }

  update(id, patch) {
    const g = this.games.find((x) => x.id === id);
    if (!g) return false;
    Object.assign(g, patch);
    this._save();
    return true;
  }

  // File d'une partie (label). Les parties jouées en live n'ont pas de file
  // exposée par l'API -> "En direct".
  _queueOf(g) {
    return g.queue || (g.source === 'riot' ? 'Riot' : 'En direct');
  }

  // Liste + statistiques agrégées (winrate, KDA moyen, par champion).
  // opts.queue : filtre sur une file donnée ("all" ou absent = toutes).
  list(opts) {
    const queueFilter = opts && opts.queue && opts.queue !== 'all' ? String(opts.queue) : null;
    // Files présentes (pour peupler le sélecteur), sur l'ensemble des parties.
    const queueCounts = {};
    for (const g of this.games) {
      const q = this._queueOf(g);
      queueCounts[q] = (queueCounts[q] || 0) + 1;
    }
    const queues = Object.keys(queueCounts).sort((a, b) => queueCounts[b] - queueCounts[a]).map((q) => ({ queue: q, games: queueCounts[q] }));

    const games = queueFilter ? this.games.filter((g) => this._queueOf(g) === queueFilter) : this.games;
    const played = games.length;
    const decided = games.filter((g) => g.win === true || g.win === false);
    const wins = games.filter((g) => g.win === true).length;
    const winrate = decided.length ? Math.round((wins / decided.length) * 100) : null;
    let k = 0, d = 0, a = 0, n = 0;
    const byChamp = {};
    for (const g of games) {
      if (g.kills != null) { k += g.kills; d += g.deaths || 0; a += g.assists || 0; n++; }
      if (g.champion) {
        const c = (byChamp[g.champion] = byChamp[g.champion] || { champion: g.champion, games: 0, wins: 0 });
        c.games++;
        if (g.win === true) c.wins++;
      }
    }
    return {
      games,
      stats: {
        queue: queueFilter || 'all',
        queues,
        played,
        decided: decided.length,
        wins,
        losses: decided.length - wins,
        winrate,
        avgKda: n ? { k: +(k / n).toFixed(1), d: +(d / n).toFixed(1), a: +(a / n).toFixed(1) } : null,
        byChampion: Object.values(byChamp).sort((x, y) => y.games - x.games),
        deathHeatmap: this._deathHeatmap(games),
        profileByResult: this._profileByResult(games),
      },
    };
  }

  // Heatmap temporelle des morts : nb de morts par tranche de minutes, agrégé
  // sur les parties qui ont enregistré les horodatages (deathTimes en secondes).
  _deathHeatmap(games) {
    const BUCKET = 5; // minutes par tranche
    const MAXMIN = 40;
    const buckets = [];
    for (let m = 0; m < MAXMIN; m += BUCKET) buckets.push({ from: m, to: m + BUCKET, deaths: 0 });
    let gamesWithData = 0;
    let totalDeaths = 0;
    for (const g of games) {
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
  _profileByResult(games) {
    const agg = (pred) => {
      const g = games.filter((x) => pred(x) && x.kills != null);
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
