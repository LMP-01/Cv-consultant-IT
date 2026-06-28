'use strict';

const https = require('https');

// Les API locales de Riot (Live Client Data sur :2999, LCU sur un port
// aléatoire) utilisent un certificat auto-signé. On crée un agent qui ne
// vérifie pas la chaîne TLS, mais UNIQUEMENT pour 127.0.0.1 — jamais pour des
// requêtes sortantes vers Internet.
const localAgent = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: true,
});

/**
 * Requête HTTPS vers une API locale auto-signée, renvoie le JSON parsé.
 * @param {object} opts
 * @param {string} opts.host - défaut 127.0.0.1
 * @param {number} opts.port
 * @param {string} opts.path
 * @param {string} [opts.method] - défaut GET
 * @param {object} [opts.headers]
 * @param {number} [opts.timeoutMs] - défaut 2500
 * @returns {Promise<any>}
 */
function localJson(opts) {
  const {
    host = '127.0.0.1',
    port,
    path,
    method = 'GET',
    headers = {},
    timeoutMs = 2500,
  } = opts;

  return new Promise((resolve, reject) => {
    const req = https.request(
      { host, port, path, method, headers, agent: localAgent },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const err = new Error(`HTTP ${res.statusCode} ${method} ${path}`);
            err.statusCode = res.statusCode;
            err.body = body;
            return reject(err);
          }
          if (!body) return resolve(null);
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error(`Réponse JSON invalide depuis ${path}: ${e.message}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Timeout (${timeoutMs}ms) sur ${path}`));
    });
    req.end();
  });
}

module.exports = { localJson, localAgent };
