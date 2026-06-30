'use strict';

const fs = require('fs');
const path = require('path');
const { dataset, analyzeComp, defensiveSuggestions, classifyDamage } = require('./profile');

// Pool de champions du joueur (data/champion-pool.json), chargée à la demande.
let POOL = null;
function loadPool() {
  if (POOL) return POOL;
  try {
    POOL = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'champion-pool.json'), 'utf8'));
  } catch {
    POOL = { pool: {} };
  }
  return POOL;
}

function formatMastery(n) {
  n = Number(n) || 0;
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000) return Math.round(n / 1000) + 'K';
  return String(n);
}

// Poids de maîtrise (0..2) : départage à counter égal, sans dominer le counter.
function masteryWeight(n) {
  n = Number(n) || 0;
  if (n <= 0) return 0;
  return Math.min(2, (Math.log10(n + 1) / Math.log10(1000000)) * 2);
}

// Estimation INDICATIVE de probabilité de victoire d'un pick dans CE contexte.
// Heuristique transparente (pas une donnée live) bornée à 35–66 %.
function estimateWinProb({ laneCounter, enemyCounterCount, synergy, balances, mastery, enemyComp }) {
  let p = 0.5;
  if (laneCounter) p += 0.06;
  p += Math.min(0.06, (enemyCounterCount || 0) * 0.02);
  if (synergy) p += 0.03;
  if (balances) p += 0.02;
  p += Math.min(0.03, (masteryWeight(mastery) / 2) * 0.03);
  if (enemyComp && enemyComp.burstCount >= 3) p -= 0.02;
  if (enemyComp && enemyComp.ccCount >= 4) p -= 0.02;
  return Math.round(Math.max(0.35, Math.min(0.66, p)) * 100);
}

const ROLE_LABEL = {
  TOP: 'Top',
  JUNGLE: 'Jungle',
  MIDDLE: 'Mid',
  BOTTOM: 'ADC',
  UTILITY: 'Support',
};

function normRole(pos) {
  if (!pos) return '';
  const p = pos.toUpperCase();
  if (p === 'UTILITY' || p === 'SUPPORT') return 'UTILITY';
  if (p === 'BOTTOM' || p === 'ADC' || p === 'BOT') return 'BOTTOM';
  if (p === 'MIDDLE' || p === 'MID') return 'MIDDLE';
  return p;
}

// Champions effectivement choisis (championId > 0) ou survolés via les actions,
// pour une liste de cellIds donnée.
function collectChamps(session, cellIds, ddragon) {
  const ids = new Set();
  const team = (session.myTeam || []).concat(session.theirTeam || []);
  for (const member of team) {
    if (cellIds.has(member.cellId) && member.championId > 0) ids.add(member.championId);
  }
  const actions = (session.actions || []).flat();
  for (const a of actions) {
    if (a.type === 'pick' && a.championId > 0 && cellIds.has(a.actorCellId)) ids.add(a.championId);
  }
  return [...ids].map((key) => (ddragon ? ddragon.resolveChampionByKey(key) : null)).filter(Boolean);
}

function bannedIds(session) {
  const out = new Set();
  const actions = (session.actions || []).flat();
  for (const a of actions) {
    if (a.type === 'ban' && a.championId > 0) out.add(a.championId);
  }
  if (session.bans) {
    for (const k of (session.bans.myTeamBans || []).concat(session.bans.theirTeamBans || [])) {
      if (k > 0) out.add(k);
    }
  }
  return out;
}

/**
 * Analyse une session de champ select et produit picks + build conseillés.
 */
function analyzeChampSelect(session, ddragon) {
  const ds = dataset();
  const localCellId = session.localPlayerCellId;
  const myMember = (session.myTeam || []).find((m) => m.cellId === localCellId);
  const myRole = normRole(myMember ? myMember.assignedPosition : '');

  const myCellIds = new Set((session.myTeam || []).map((m) => m.cellId));
  const enemyCellIds = new Set((session.theirTeam || []).map((m) => m.cellId));

  const myChamps = collectChamps(session, myCellIds, ddragon);
  const enemyChamps = collectChamps(session, enemyCellIds, ddragon);
  const banned = bannedIds(session);

  const champRef = (entry) =>
    entry
      ? {
          id: entry.id,
          name: entry.displayName || entry.name,
          key: entry.key,
          portrait: ddragon ? ddragon.squarePortraitUrl(entry.id) : null,
        }
      : null;

  // Adversaire direct de lane (même rôle assigné, si connu).
  let laneOpponent = null;
  if (myRole) {
    const opp = (session.theirTeam || []).find((m) => normRole(m.assignedPosition) === myRole && m.championId > 0);
    if (opp && ddragon) laneOpponent = ddragon.resolveChampionByKey(opp.championId);
  }

  // ── Suggestions de pick ──────────────────────────────────────────────────
  const taken = new Set([...myChamps, ...enemyChamps].map((c) => c.id));
  const bannedSet = new Set(
    [...banned].map((k) => (ddragon ? (ddragon.resolveChampionByKey(k) || {}).id : null)).filter(Boolean)
  );

  // Index normalisé des counters (tolère casse/ponctuation du dataset).
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const countersByNorm = new Map();
  for (const key of Object.keys(ds.counters || {})) countersByNorm.set(norm(key), ds.counters[key]);
  const counterListOf = (champ) => countersByNorm.get(norm(champ.id)) || [];
  // Index normalisé des synergies (duo bot, combos d'engage).
  const synergyByNorm = new Map();
  for (const key of Object.keys(ds.synergies || {})) synergyByNorm.set(norm(key), ds.synergies[key]);
  const synergyListOf = (champ) => synergyByNorm.get(norm(champ.id || champ)) || [];
  // Résout un id brut du dataset vers l'id canonique Data Dragon.
  const canonId = (raw) => {
    const e = ddragon ? ddragon.resolveChampionByName(raw) : null;
    return e ? e.id : null;
  };
  // Vrai si `champId` (canonique) fait une bonne synergie avec un allié déjà pické.
  // Vérifié dans les deux sens (allié→pick et pick→allié). Renvoie l'allié concerné.
  const synergyAlly = (champId) => {
    for (const ally of myChamps) {
      const allySyn = new Set(synergyListOf(ally).map(canonId).filter(Boolean));
      if (allySyn.has(champId)) return ally;
    }
    const mySyn = new Set(synergyListOf(champId).map(canonId).filter(Boolean));
    for (const ally of myChamps) {
      if (mySyn.has(ally.id)) return ally;
    }
    return null;
  };

  const scores = new Map(); // champId canonique -> {score, reasons}
  function bump(rawId, points, reason) {
    const champId = canonId(rawId);
    if (!champId || taken.has(champId) || bannedSet.has(champId)) return;
    const cur = scores.get(champId) || { score: 0, reasons: [] };
    cur.score += points;
    if (reason && !cur.reasons.includes(reason)) cur.reasons.push(reason);
    scores.set(champId, cur);
  }

  // Counters de l'adversaire direct (poids fort) puis de toute la team adverse.
  if (laneOpponent) {
    for (const counterId of counterListOf(laneOpponent)) {
      bump(counterId, 3, `counter de ${laneOpponent.displayName || laneOpponent.name} (ta lane)`);
    }
  }
  for (const enemy of enemyChamps) {
    if (laneOpponent && enemy.id === laneOpponent.id) continue;
    for (const counterId of counterListOf(enemy)) {
      bump(counterId, 1, `fort contre ${enemy.displayName || enemy.name}`);
    }
  }

  // Synergies avec tes alliés déjà choisis (duo bot, combos d'engage).
  for (const ally of myChamps) {
    for (const synId of synergyListOf(ally)) {
      bump(synId, 1.5, `synergie avec ${ally.displayName || ally.name}`);
    }
  }

  // Picks solides/sûrs de ton rôle (poids faible, pour combler).
  const rolePool = myRole && ds.rolePicks[myRole] ? ds.rolePicks[myRole] : [];
  for (const champId of rolePool) {
    bump(champId, 0.5, 'pick solide pour ton rôle');
  }

  // Proba de win INDICATIVE pour les suggestions génériques (à partir du score).
  const coarseWinProb = (score) => Math.round(Math.max(40, Math.min(64, 50 + Math.min(14, (score || 0) * 2.5))));

  const pickSuggestions = [...scores.entries()]
    .map(([id, v]) => {
      const champ = ddragon ? ddragon.championById.get(id) : null;
      const ref = champRef(champ);
      const base = { score: v.score, reasons: v.reasons, winProb: coarseWinProb(v.score) };
      return ref ? { ...ref, ...base } : { id, name: id, key: null, portrait: null, ...base };
    })
    .filter((p) => p.key) // on ne garde que les champions reconnus par Data Dragon
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  // ── Picks issus de TA pool (prioritaires si configurée pour ton rôle) ──────
  // Compositions des deux équipes (pour synergie/équilibre et proba de win).
  const allyComp = myChamps.length ? analyzeComp(myChamps) : null;
  const enemyComp = enemyChamps.length ? analyzeComp(enemyChamps) : null;

  const poolEntries = (loadPool().pool || {})[myRole] || [];
  const poolUnresolved = [];
  let poolPicks = [];
  if (poolEntries.length) {
    const laneSet = laneOpponent ? new Set(counterListOf(laneOpponent).map(canonId).filter(Boolean)) : new Set();
    const enemySets = enemyChamps
      .filter((e) => !laneOpponent || e.id !== laneOpponent.id)
      .map((e) => ({ e, set: new Set(counterListOf(e).map(canonId).filter(Boolean)) }));
    for (const entry of poolEntries) {
      const champ = ddragon ? ddragon.resolveChampionByName(entry.champion) : null;
      if (!champ) {
        poolUnresolved.push(entry.champion);
        continue;
      }
      if (taken.has(champ.id) || bannedSet.has(champ.id)) continue;
      let score = 0;
      const reasons = [];
      const laneCounter = laneSet.has(champ.id);
      if (laneCounter) {
        score += 3;
        reasons.push(`counter de ${laneOpponent.displayName || laneOpponent.name} (ta lane)`);
      }
      let enemyCounterCount = 0;
      for (const { e, set } of enemySets) {
        if (set.has(champ.id)) {
          score += 1;
          enemyCounterCount++;
          reasons.push(`fort contre ${e.displayName || e.name}`);
        }
      }
      // Équilibre des dégâts de TON équipe.
      let balances = false;
      if (allyComp) {
        const dmg = classifyDamage(champ);
        if (allyComp.profile === 'à dominante AP' && (dmg === 'AD' || dmg === 'MIXED')) {
          score += 1;
          balances = true;
          reasons.push('équilibre les dégâts (ton équipe est AP)');
        } else if (allyComp.profile === 'à dominante AD' && dmg === 'AP') {
          score += 1;
          balances = true;
          reasons.push('équilibre les dégâts (ton équipe est AD)');
        }
      }
      // Synergie de duo / combo avec un allié déjà choisi (ex: support → ADC).
      const ally = synergyAlly(champ.id);
      if (ally) {
        score += 1.5;
        reasons.push(`synergie avec ${ally.displayName || ally.name}`);
      }
      score += masteryWeight(entry.mastery);
      reasons.push(`maîtrise ${formatMastery(entry.mastery)}`);
      const winProb = estimateWinProb({
        laneCounter,
        enemyCounterCount,
        synergy: Boolean(ally),
        balances,
        mastery: entry.mastery,
        enemyComp,
      });
      poolPicks.push({ ...champRef(champ), mastery: entry.mastery, score: +score.toFixed(2), reasons, winProb });
    }
    poolPicks.sort((a, b) => b.score - a.score || (b.mastery || 0) - (a.mastery || 0));
  }
  const picksFromPool = poolPicks.length > 0;

  // ── Build / runes vs composition adverse ──────────────────────────────────
  const buildSuggestions = enemyComp ? defensiveSuggestions(enemyComp) : [];

  const runeHints = [];
  if (enemyComp) {
    if (enemyComp.ccCount >= 3) runeHints.push('Beaucoup de CC : pense à un sort d’invocateur Nettoyage et/ou à de la Ténacité.');
    if (enemyComp.burstCount >= 2) runeHints.push('Burst élevé : runes/objets de survie (Seconde Souffle, Garde-Ange, Sablier).');
    if (enemyComp.profile === 'à dominante AD') runeHints.push('Comp AD : runes d’armure (Os Démoniaque) et chaussons en plaques.');
    if (enemyComp.profile === 'à dominante AP') runeHints.push('Comp AP : runes de RM (Cuirasse de Vandale) et bottes de Mercure.');
  }

  const suggestions = picksFromPool ? poolPicks : pickSuggestions;
  // Proba de win projetée = celle du pick conseillé (top). Estimation indicative.
  const teamWinProb = suggestions.length && suggestions[0].winProb != null ? suggestions[0].winProb : null;

  return {
    myRole,
    myRoleLabel: ROLE_LABEL[myRole] || myRole || 'Inconnu',
    laneOpponent: champRef(laneOpponent),
    myChamps: myChamps.map(champRef),
    enemyChamps: enemyChamps.map(champRef),
    enemyComp,
    teamComp: allyComp,
    pickSuggestions: suggestions,
    picksFromPool,
    poolUnresolved,
    teamWinProb,
    buildSuggestions,
    runeHints,
    timerSeconds: session.timer ? Math.round((session.timer.adjustedTimeLeftInPhase || 0) / 1000) : null,
  };
}

module.exports = { analyzeChampSelect, normRole, ROLE_LABEL };
