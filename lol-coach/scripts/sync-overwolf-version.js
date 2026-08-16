'use strict';

// Aligne la version de l'app Overwolf sur celle de package.json, pour que la
// version locale et Overwolf restent synchronisées à chaque mise à jour.
//   node scripts/sync-overwolf-version.js   (ou : npm run sync-overwolf-version)

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const version = require(path.join(root, 'package.json')).version;
const manifestPath = path.join(root, 'overwolf', 'manifest.json');

try {
  const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const before = m.meta.version;
  m.meta.version = version;
  fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2) + '\n');
  console.log(`Overwolf manifest : ${before} -> ${version}`);
} catch (e) {
  console.error('Impossible de synchroniser la version Overwolf :', e.message);
  process.exit(1);
}
