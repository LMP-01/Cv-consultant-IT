'use strict';

const fs = require('fs');
const path = require('path');

// Normalise un identifiant de champion (insensible à la casse/ponctuation)
// pour que le dataset tolère "Kha'Zix" comme "Khazix", "LeBlanc"/"Leblanc", etc.
function norm(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

let DATASET = null;
let NORM_OVERRIDE = null;
let NORM_CC = null;
let NORM_BURST = null;

function dataset() {
  if (DATASET) return DATASET;
  try {
    DATASET = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'counters.json'), 'utf8'));
  } catch {
    DATASET = { damageOverride: {}, ccHeavy: [], burstThreats: [], counters: {}, rolePicks: {} };
  }
  NORM_OVERRIDE = new Map();
  for (const k of Object.keys(DATASET.damageOverride || {})) NORM_OVERRIDE.set(norm(k), DATASET.damageOverride[k]);
  NORM_CC = new Set((DATASET.ccHeavy || []).map(norm));
  NORM_BURST = new Set((DATASET.burstThreats || []).map(norm));
  return DATASET;
}

// Classe un champion par type de dégâts principal : AD / AP / MIXED / TRUE.
// S'appuie sur l'override curé, sinon déduit des tags Data Dragon.
function classifyDamage(champ) {
  if (!champ) return 'AD';
  dataset();
  const ov = NORM_OVERRIDE.get(norm(champ.id));
  if (ov) return ov;
  const tags = champ.tags || [];
  if (tags.includes('Marksman')) return 'AD';
  if (tags.includes('Mage')) return 'AP';
  if (tags.includes('Assassin')) return 'AD'; // exceptions AP gérées par override
  if (tags.includes('Fighter') || tags.includes('Tank')) return 'AD';
  if (tags.includes('Support')) return 'AP';
  return 'AD';
}

/**
 * Analyse une composition d'équipe.
 * @param {Array<{id:string,name:string,tags:string[]}>} champs entrées Data Dragon
 * @returns {{adCount,apCount,mixedCount,trueCount,ccCount,burstCount,profile,ccLevel,burstLevel,names}}
 */
function analyzeComp(champs) {
  dataset();
  const valid = champs.filter(Boolean);
  let ad = 0;
  let ap = 0;
  let mixed = 0;
  let truedmg = 0;
  let cc = 0;
  let burst = 0;

  for (const c of valid) {
    const dmg = classifyDamage(c);
    if (dmg === 'AD') ad++;
    else if (dmg === 'AP') ap++;
    else if (dmg === 'MIXED') mixed++;
    else if (dmg === 'TRUE') truedmg++;
    if (NORM_CC.has(norm(c.id))) cc++;
    if (NORM_BURST.has(norm(c.id))) burst++;
  }

  const adWeighted = ad + mixed * 0.5;
  const apWeighted = ap + mixed * 0.5;
  let profile = 'mixte';
  if (adWeighted - apWeighted >= 1.5) profile = 'à dominante AD';
  else if (apWeighted - adWeighted >= 1.5) profile = 'à dominante AP';

  return {
    adCount: ad,
    apCount: ap,
    mixedCount: mixed,
    trueCount: truedmg,
    ccCount: cc,
    burstCount: burst,
    profile,
    ccLevel: cc >= 3 ? 'élevé' : cc >= 1 ? 'modéré' : 'faible',
    burstLevel: burst >= 2 ? 'élevé' : burst >= 1 ? 'présent' : 'faible',
    names: valid.map((c) => c.name),
  };
}

/**
 * Suggestions d'objets défensifs adaptées à la composition adverse.
 * @returns {Array<{item:string,reason:string}>}
 */
function defensiveSuggestions(comp) {
  const out = [];
  const apHeavy = comp.profile === 'à dominante AP';
  const adHeavy = comp.profile === 'à dominante AD';

  if (adHeavy) {
    out.push({ item: 'Chaussons en plaques d’acier', reason: 'la team adverse fait surtout des dégâts AD' });
    out.push({ item: 'Cœur gelé / Sablier de Randuin / Cuirasse épineuse', reason: 'beaucoup de dégâts physiques / attaques rapides' });
  } else if (apHeavy) {
    out.push({ item: 'Bottes de Mercure', reason: 'la team adverse fait surtout des dégâts AP' });
    out.push({ item: 'Cuirasse de Vandale / Force de la Nature / Cœur de Géant', reason: 'beaucoup de dégâts magiques' });
  } else {
    out.push({ item: 'Bottes adaptées au matchup (plaques d’acier ou Mercure)', reason: 'composition mixte AD/AP' });
    out.push({ item: 'Un objet de résistance selon ta lane', reason: 'dégâts répartis AD et AP' });
  }

  if (comp.ccCount >= 3) {
    out.push({ item: 'Mercuriel / Soie d’argent (anti-CC) ou Bottes de Mercure', reason: `crowd control élevé (${comp.ccCount} sources de CC)` });
  }
  if (comp.burstCount >= 2) {
    out.push({ item: 'Sablier de Zhonya / Garde-Ange / Chronoceinture', reason: `burst/assassins élevé (${comp.burstCount} menaces)` });
  }
  return out;
}

module.exports = { dataset, classifyDamage, analyzeComp, defensiveSuggestions };
