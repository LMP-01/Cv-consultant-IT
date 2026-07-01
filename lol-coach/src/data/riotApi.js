'use strict';

const config = require('../config');

// Client minimal de l'API Riot (officielle). Lit la clé depuis .env (RIOT_API_KEY).
// ⚠️ Clé DEV : expire toutes les 24 h (régénère-la sur developer.riotgames.com).
// Limites dev : 20 req/s, 100 req/2 min. On throttle prudemment.
//
// Routing : account-v1 et match-v5 -> régional (europe/americas/asia) ;
//           summoner-v4 et league-v4 -> plateforme (euw1/na1/kr...).

const QUEUE = { 420: 'Solo/Duo', 440: 'Flex', 400: 'Normal Draft', 430: 'Normal Blind', 450: 'ARAM' };

// Ordre des paliers (saison actuelle, Émeraude insérée entre Platine et Diamant).
const TIER_INDEX = { IRON: 0, BRONZE: 1, SILVER: 2, GOLD: 3, PLATINUM: 4, EMERALD: 5, DIAMOND: 6 };
const DIVISION_INDEX = { IV: 0, III: 1, II: 2, I: 3 };
const APEX = ['MASTER', 'GRANDMASTER', 'CHALLENGER'];
// Master = sortie de Diamant I 100 LP -> 6*400 + 3*100 + 100 = 2800 LP cumulés depuis Fer IV 0 LP.
const MASTER_TOTAL_LP = 2800;

// Emblème de rang (image OFFICIELLE LoL). On pointe la route LOCALE /ranks/<tier>.png :
// le serveur télécharge l'image depuis Community Dragon (miroir Riot), la met en cache
// et la sert — ce qui évite les soucis de CORS/hotlink côté navigateur. Repli blason SVG.
function rankEmblemUrl(tier) {
  const t = String(tier || '').toLowerCase().replace(/[^a-z]/g, '');
  if (!t) return null;
  return `/ranks/${t}.png`;
}

// Estime le nombre de games à GAGNER pour atteindre Master, depuis tier/division/LP.
// lpPerWin : gain net moyen par victoire (dev peut le régler via RANK_LP_PER_WIN).
function climbToMaster(tier, division, lp, lpPerWin) {
  const T = String(tier || '').toUpperCase();
  if (APEX.includes(T)) return { remainingLp: 0, gamesToWin: 0, reached: true };
  if (!(T in TIER_INDEX)) return null;
  const perWin = Number(lpPerWin) > 0 ? Number(lpPerWin) : 22;
  const divIdx = DIVISION_INDEX[String(division || 'IV').toUpperCase()] ?? 0;
  const currentTotal = TIER_INDEX[T] * 400 + divIdx * 100 + (Number(lp) || 0);
  const remainingLp = Math.max(0, MASTER_TOTAL_LP - currentTotal);
  return { remainingLp, gamesToWin: Math.ceil(remainingLp / perWin), reached: false, lpPerWin: perWin };
}

let lastCall = 0;
async function throttle() {
  const wait = 120 - (Date.now() - lastCall); // ~8 req/s max, marge sous la limite
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
}

class RiotApi {
  constructor() {
    this.key = config.riot.apiKey;
    this.region = config.riot.region; // routing régional
    this.platform = config.riot.platform; // routing plateforme
  }

  get available() {
    return Boolean(this.key);
  }

  async _get(host, path) {
    if (!this.key) throw new Error('RIOT_API_KEY absente (.env)');
    await throttle();
    const res = await fetch(`https://${host}${path}`, { headers: { 'X-Riot-Token': this.key } });
    if (res.status === 401 || res.status === 403) throw new Error('Clé Riot invalide ou expirée (régénère-la, dev = 24 h)');
    if (res.status === 429) throw new Error('Limite de requêtes Riot atteinte — réessaie dans un instant');
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Riot API HTTP ${res.status}`);
    return res.json();
  }

  // Compte Riot (Riot ID "Pseudo#TAG") -> { puuid, gameName, tagLine }.
  async accountByRiotId(gameName, tagLine) {
    return this._get(`${this.region}.api.riotgames.com`, `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`);
  }

  async summonerByPuuid(puuid) {
    return this._get(`${this.platform}.api.riotgames.com`, `/lol/summoner/v4/summoners/by-puuid/${puuid}`);
  }

  // Rang/LP en ranked (par puuid, league-v4).
  async rankByPuuid(puuid) {
    const entries = await this._get(`${this.platform}.api.riotgames.com`, `/lol/league/v4/entries/by-puuid/${puuid}`);
    if (!Array.isArray(entries)) return null;
    const solo = entries.find((e) => e.queueType === 'RANKED_SOLO_5x5') || entries[0] || null;
    if (!solo) return null;
    return {
      tier: solo.tier,
      rank: solo.rank,
      lp: solo.leaguePoints,
      wins: solo.wins,
      losses: solo.losses,
      queue: solo.queueType,
      emblem: rankEmblemUrl(solo.tier),
      toMaster: climbToMaster(solo.tier, solo.rank, solo.leaguePoints, config.riot.lpPerWin),
    };
  }

  async matchIds(puuid, count) {
    return this._get(`${this.region}.api.riotgames.com`, `/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${count || 10}`);
  }

  async match(matchId) {
    return this._get(`${this.region}.api.riotgames.com`, `/lol/match/v5/matches/${matchId}`);
  }

  // Profil complet : compte + rang. Riot ID "Pseudo#TAG" (sinon config.riot.riotId).
  async getProfile(riotId) {
    const id = riotId || config.riot.riotId;
    if (!id || !id.includes('#')) throw new Error('Riot ID manquant (format "Pseudo#TAG", via RIOT_ID ou ?id=)');
    const [gameName, tagLine] = id.split('#');
    const account = await this.accountByRiotId(gameName, tagLine);
    if (!account) return null;
    const rank = await this.rankByPuuid(account.puuid).catch(() => null);
    return { riotId: `${account.gameName}#${account.tagLine}`, puuid: account.puuid, rank };
  }

  // Parties récentes (résumé du point de vue du joueur) pour l'historique réel.
  async getRecentMatches(riotId, count) {
    const id = riotId || config.riot.riotId;
    if (!id || !id.includes('#')) throw new Error('Riot ID manquant');
    const [gameName, tagLine] = id.split('#');
    const account = await this.accountByRiotId(gameName, tagLine);
    if (!account) return [];
    const ids = await this.matchIds(account.puuid, count || 10);
    if (!Array.isArray(ids)) return [];
    const out = [];
    for (const mid of ids) {
      const m = await this.match(mid).catch(() => null);
      if (!m || !m.info) continue;
      const me = (m.info.participants || []).find((p) => p.puuid === account.puuid);
      if (!me) continue;
      const durSec = m.info.gameDuration || 0;
      const cs = (me.totalMinionsKilled || 0) + (me.neutralMinionsKilled || 0);
      out.push({
        matchId: mid,
        date: new Date(m.info.gameEndTimestamp || m.info.gameStartTimestamp || Date.now()).toISOString(),
        queue: QUEUE[m.info.queueId] || String(m.info.queueId),
        champion: me.championName,
        role: me.teamPosition || me.individualPosition || null,
        win: Boolean(me.win),
        kills: me.kills,
        deaths: me.deaths,
        assists: me.assists,
        kda: `${me.kills}/${me.deaths}/${me.assists}`,
        cs,
        csPerMin: durSec ? +(cs / (durSec / 60)).toFixed(1) : null,
        visionScore: me.visionScore,
        goldEarned: me.goldEarned,
        damage: me.totalDamageDealtToChampions,
        durationSec: durSec,
        durationText: `${Math.floor(durSec / 60)}:${String(durSec % 60).padStart(2, '0')}`,
        source: 'riot',
      });
    }
    return out;
  }
}

module.exports = { RiotApi, climbToMaster, rankEmblemUrl };
