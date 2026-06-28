'use strict';

const { dataset, analyzeComp, defensiveSuggestions } = require('./profile');

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
  // Résout un id brut du dataset vers l'id canonique Data Dragon.
  const canonId = (raw) => {
    const e = ddragon ? ddragon.resolveChampionByName(raw) : null;
    return e ? e.id : null;
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

  // Picks solides/sûrs de ton rôle (poids faible, pour combler).
  const rolePool = myRole && ds.rolePicks[myRole] ? ds.rolePicks[myRole] : [];
  for (const champId of rolePool) {
    bump(champId, 0.5, 'pick solide pour ton rôle');
  }

  const pickSuggestions = [...scores.entries()]
    .map(([id, v]) => {
      const champ = ddragon ? ddragon.championById.get(id) : null;
      const ref = champRef(champ);
      return ref
        ? { ...ref, score: v.score, reasons: v.reasons }
        : { id, name: id, key: null, portrait: null, score: v.score, reasons: v.reasons };
    })
    .filter((p) => p.key) // on ne garde que les champions reconnus par Data Dragon
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  // ── Build / runes vs composition adverse ──────────────────────────────────
  const enemyComp = enemyChamps.length ? analyzeComp(enemyChamps) : null;
  const buildSuggestions = enemyComp ? defensiveSuggestions(enemyComp) : [];

  const runeHints = [];
  if (enemyComp) {
    if (enemyComp.ccCount >= 3) runeHints.push('Beaucoup de CC : pense à un sort d’invocateur Nettoyage et/ou à de la Ténacité.');
    if (enemyComp.burstCount >= 2) runeHints.push('Burst élevé : runes/objets de survie (Seconde Souffle, Garde-Ange, Sablier).');
    if (enemyComp.profile === 'à dominante AD') runeHints.push('Comp AD : runes d’armure (Os Démoniaque) et chaussons en plaques.');
    if (enemyComp.profile === 'à dominante AP') runeHints.push('Comp AP : runes de RM (Cuirasse de Vandale) et bottes de Mercure.');
  }

  return {
    myRole,
    myRoleLabel: ROLE_LABEL[myRole] || myRole || 'Inconnu',
    laneOpponent: champRef(laneOpponent),
    myChamps: myChamps.map(champRef),
    enemyChamps: enemyChamps.map(champRef),
    enemyComp,
    pickSuggestions,
    buildSuggestions,
    runeHints,
    timerSeconds: session.timer ? Math.round((session.timer.adjustedTimeLeftInPhase || 0) / 1000) : null,
  };
}

module.exports = { analyzeChampSelect, normRole, ROLE_LABEL };
