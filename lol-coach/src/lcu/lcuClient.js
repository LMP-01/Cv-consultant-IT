'use strict';

const { localJson } = require('../httpsClient');
const { getLcuCredentials, basicAuthHeader } = require('./credentials');

// Client REST minimal pour la LCU API (League Client). Redécouvre
// automatiquement les identifiants si le client a été (re)lancé.
class LcuClient {
  constructor() {
    this.creds = null;
  }

  async ensureCreds() {
    if (this.creds) return this.creds;
    this.creds = await getLcuCredentials();
    return this.creds;
  }

  invalidate() {
    this.creds = null;
  }

  async request(apiPath) {
    const creds = await this.ensureCreds();
    if (!creds) return null;
    try {
      return await localJson({
        port: creds.port,
        path: apiPath,
        headers: {
          Authorization: basicAuthHeader(creds.password),
          Accept: 'application/json',
        },
        timeoutMs: 2500,
      });
    } catch (err) {
      // 404 = ressource normale absente (ex: pas en champ select) → null.
      if (err.statusCode === 404) return null;
      // Connexion refusée / token périmé → on oublie les creds pour les
      // redécouvrir au prochain tour.
      this.invalidate();
      throw err;
    }
  }

  /** Phase du flux de jeu : None, Lobby, Matchmaking, ChampSelect, InProgress... */
  async getGameflowPhase() {
    const phase = await this.request('/lol-gameflow/v1/gameflow-phase');
    return typeof phase === 'string' ? phase.replace(/"/g, '') : phase;
  }

  /** Session de champ select (myTeam, theirTeam, actions, bans, timer...). */
  async getChampSelectSession() {
    return this.request('/lol-champ-select/v1/session');
  }

  /** Invocateur courant (compte connecté). */
  async getCurrentSummoner() {
    return this.request('/lol-summoner/v1/current-summoner');
  }
}

module.exports = { LcuClient };
