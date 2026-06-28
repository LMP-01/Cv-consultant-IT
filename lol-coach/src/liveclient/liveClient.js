'use strict';

const { localJson } = require('../httpsClient');

const PORT = 2999;
const BASE = '/liveclientdata';

// Client pour la "Live Client Data API" exposée par le client de jeu pendant
// une partie (https://127.0.0.1:2999/liveclientdata/...). Indisponible hors
// partie (ECONNREFUSED), ce qui est géré comme "pas en partie".
class LiveClient {
  async getAllGameData() {
    return localJson({ port: PORT, path: `${BASE}/allgamedata`, timeoutMs: 2000 });
  }

  async getActivePlayer() {
    return localJson({ port: PORT, path: `${BASE}/activeplayer`, timeoutMs: 2000 });
  }

  async getEventData() {
    return localJson({ port: PORT, path: `${BASE}/eventdata`, timeoutMs: 2000 });
  }

  async getGameStats() {
    return localJson({ port: PORT, path: `${BASE}/gamestats`, timeoutMs: 2000 });
  }

  /** true si une partie est en cours et l'API répond. */
  async isInGame() {
    try {
      await this.getGameStats();
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = { LiveClient };
