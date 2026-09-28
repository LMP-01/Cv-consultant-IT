'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const config = require('../config');

// Chemins d'installation par défaut où se trouve le fichier `lockfile`.
function candidateLockfilePaths() {
  const paths = [];
  if (config.leaguePath) {
    paths.push(path.join(config.leaguePath, 'lockfile'));
  }
  if (process.platform === 'win32') {
    // Emplacements d'installation courants (le scan de process couvre les
    // installations sur un autre disque/dossier).
    for (const drive of ['C', 'D', 'E']) {
      paths.push(`${drive}:\\Riot Games\\League of Legends\\lockfile`);
    }
  } else if (process.platform === 'darwin') {
    paths.push('/Applications/League of Legends.app/Contents/LoL/lockfile');
    paths.push(path.join(os.homedir(), 'Applications', 'League of Legends.app', 'Contents', 'LoL', 'lockfile'));
  }
  return paths;
}

// Format du lockfile : "LeagueClient:PID:port:password:protocol"
function parseLockfile(content) {
  const parts = content.trim().split(':');
  if (parts.length < 5) return null;
  return {
    pid: parts[1],
    port: parseInt(parts[2], 10),
    password: parts[3],
    protocol: parts[4],
  };
}

function fromLockfile() {
  for (const p of candidateLockfilePaths()) {
    try {
      const content = fs.readFileSync(p, 'utf8');
      const parsed = parseLockfile(content);
      if (parsed && parsed.port) return parsed;
    } catch {
      /* fichier absent : on essaie le suivant */
    }
  }
  return null;
}

function exec(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout: 4000, maxBuffer: 1024 * 1024 }, (err, stdout) => {
      resolve(err ? '' : stdout || '');
    });
  });
}

// Solution de repli : on lit la ligne de commande du process LeagueClientUx,
// qui contient --app-port et --remoting-auth-token.
async function fromProcess() {
  let out = '';
  if (process.platform === 'win32') {
    out = await exec('powershell', [
      '-NoProfile',
      '-Command',
      "Get-CimInstance Win32_Process -Filter \"name='LeagueClientUx.exe'\" | Select-Object -ExpandProperty CommandLine",
    ]);
    if (!out) {
      // wmic, supprimé sur certaines installations récentes mais présent ailleurs
      out = await exec('wmic', ['PROCESS', 'WHERE', "name='LeagueClientUx.exe'", 'GET', 'commandline']);
    }
  } else {
    // -Ao args= : tous les process, ligne de commande complète, portable macOS/Linux.
    out = await exec('sh', ['-c', "ps -Ao args= 2>/dev/null | grep -i LeagueClientUx | grep -v grep"]);
  }
  if (!out) return null;

  const portMatch = out.match(/--app-port[=\s]+"?(\d+)"?/i);
  const tokenMatch = out.match(/--remoting-auth-token[=\s]+"?([\w-]+)"?/i);
  if (portMatch && tokenMatch) {
    return {
      port: parseInt(portMatch[1], 10),
      password: tokenMatch[1],
      protocol: 'https',
    };
  }
  return null;
}

/**
 * Renvoie les identifiants LCU { port, password, protocol } ou null si le
 * client League n'est pas détecté.
 */
async function getLcuCredentials() {
  const fromFile = fromLockfile();
  if (fromFile) return fromFile;
  return fromProcess();
}

// En-tête Basic auth : utilisateur fixe "riot", mot de passe = token du lockfile.
function basicAuthHeader(password) {
  return 'Basic ' + Buffer.from(`riot:${password}`).toString('base64');
}

module.exports = { getLcuCredentials, basicAuthHeader, parseLockfile };
