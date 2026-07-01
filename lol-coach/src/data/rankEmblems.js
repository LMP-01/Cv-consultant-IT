'use strict';

// Proxy + cache disque des emblèmes de rang OFFICIELS (images League of Legends).
// Le navigateur ne peut pas toujours charger les CDN (CORS/hotlink) ; on passe donc
// par le serveur LOCAL, qui télécharge l'emblème une fois depuis Community Dragon
// (miroir officiel des assets Riot), le met en cache dans .cache/ranks/, puis le sert.
// Hors-ligne / CDN injoignable -> renvoie null et l'UI retombe sur le blason SVG coloré.

const fs = require('fs');
const path = require('path');

const TIERS = ['iron', 'bronze', 'silver', 'gold', 'platinum', 'emerald', 'diamond', 'master', 'grandmaster', 'challenger'];
const CACHE_DIR = path.join(__dirname, '..', '..', '.cache', 'ranks');

// Modèles d'URL candidats (essayés dans l'ordre) — tolère les variations de chemin
// entre patchs. Le premier qui renvoie un PNG valide gagne et est mis en cache.
const CDRAGON = 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images';
const CANDIDATES = [
  (t) => `${CDRAGON}/ranked-emblem/emblem-${t}.png`,
  (t) => `${CDRAGON}/ranked-emblem/emblem_${t}.png`,
  (t) => `${CDRAGON}/ranked-emblem/${t}.png`,
  (t) => `${CDRAGON}/ranked-mini-regalia/${t}.png`,
  (t) => `${CDRAGON}/ranked-mini-crests/${t}.png`,
  (t) => `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-shared-components/global/default/ranked-emblem/emblem-${t}.png`,
];

const mem = new Map(); // tier -> Buffer (succès) | null (échec récent)
const pending = new Map(); // tier -> Promise en cours (dédoublonne les requêtes simultanées)

function normTier(raw) {
  const t = String(raw || '').toLowerCase().replace(/[^a-z]/g, '');
  return TIERS.includes(t) ? t : null;
}

async function fetchFirst(tier) {
  for (const tpl of CANDIDATES) {
    try {
      const res = await fetch(tpl(tier), { headers: { 'User-Agent': 'lol-coach' } });
      if (!res || !res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 200) continue; // garde-fou : pas une vraie image
      try {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        fs.writeFileSync(path.join(CACHE_DIR, tier + '.png'), buf);
      } catch {
        /* cache best-effort */
      }
      return buf;
    } catch {
      /* essaie le candidat suivant */
    }
  }
  return null;
}

// Renvoie le Buffer PNG de l'emblème (cache mémoire -> disque -> réseau), ou null.
async function getRankEmblem(tierRaw) {
  const tier = normTier(tierRaw);
  if (!tier) return null;
  if (mem.has(tier)) return mem.get(tier);
  // Cache disque (persiste entre les lancements).
  try {
    const b = fs.readFileSync(path.join(CACHE_DIR, tier + '.png'));
    if (b && b.length > 200) {
      mem.set(tier, b);
      return b;
    }
  } catch {
    /* pas encore en cache */
  }
  if (pending.has(tier)) return pending.get(tier);
  const p = fetchFirst(tier).then((buf) => {
    // On ne mémorise l'échec (null) que faiblement : au prochain lancement on réessaie
    // (utile si le CDN était juste momentanément injoignable).
    mem.set(tier, buf || null);
    pending.delete(tier);
    return buf;
  });
  pending.set(tier, p);
  return p;
}

module.exports = { getRankEmblem, TIERS };
