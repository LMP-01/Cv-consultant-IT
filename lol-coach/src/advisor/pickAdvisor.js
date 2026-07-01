'use strict';

const fs = require('fs');
const path = require('path');
const { dataset, analyzeComp, defensiveSuggestions, classifyDamage } = require('./profile');
const { getBuild } = require('./builds');

// IDs Data Dragon des sorts d'invocateur -> nom FR (pour lire ceux de l'équipe adverse).
const SUMMONER_SPELLS = {
  1: 'Nettoyage', // Cleanse
  3: 'Fatigue', // Exhaust
  4: 'Flash',
  6: 'Fantôme', // Ghost
  7: 'Soin', // Heal
  11: 'Châtiment', // Smite
  12: 'Téléportation',
  13: 'Clairvoyance', // Clarity
  14: 'Embrasement', // Ignite
  21: 'Barrière', // Barrier
  32: 'Marque', // Snowball (ARAM)
};
function spellName(id) {
  return SUMMONER_SPELLS[Number(id)] || null;
}

// Remplace le sort d'invocateur offensif (Embrasement/Ignite) d'un couple
// "Flash + X" par un sort donné (ex. Barrière), en gardant Flash.
function swapOffensive(summoners, replacement) {
  if (!summoners) return `Flash + ${replacement}`;
  const parts = summoners.split(/\s*\+\s*/);
  const flash = parts.find((p) => /flash/i.test(p)) || 'Flash';
  return `${flash} + ${replacement}`;
}

// Recommande sorts d'invoc + runes ADAPTÉS : au matchup direct (adversaire de
// lane), à TOUTE la composition adverse (CC/burst/AD-AP) et aux sorts d'invoc
// RÉELLEMENT pris par l'équipe adverse. Base = build curé du champion, ajusté par
// règles (sans IA) ; le plan de lane IA affine encore.
//   opts.enemyTeam : membres theirTeam bruts (pour lire spell1Id/spell2Id).
//   opts.oppMember : le membre adverse de ta lane (ses sorts d'invoc réels).
//   opts.autofilled : true si le joueur est autofill -> reco plus sûres.
function matchupSetup(pickChamp, role, laneOpponent, enemyComp, ds, opts) {
  if (!pickChamp) return null;
  const enemyTeam = (opts && opts.enemyTeam) || [];
  const oppMember = (opts && opts.oppMember) || null;
  const autofilled = Boolean(opts && opts.autofilled);
  const build = getBuild(pickChamp.id, role) || {};
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const burst = new Set((ds.burstThreats || []).map(norm));
  const cc = new Set((ds.ccHeavy || []).map(norm));

  let summoners = build.summoners || 'Flash + Embrasement';
  let summonerNote = null;
  const notes = [];
  const oppTags = laneOpponent ? laneOpponent.tags || [] : [];
  const oppName = laneOpponent ? laneOpponent.displayName || laneOpponent.name : null;
  const oppAssassin = laneOpponent && (oppTags.includes('Assassin') || burst.has(norm(laneOpponent.id)));
  const oppHardCc = laneOpponent && cc.has(norm(laneOpponent.id));
  const iAmSquishy = ['Mage', 'Marksman', 'Assassin'].some((t) => (pickChamp.tags || []).includes(t));

  // Sorts d'invoc réellement pris par l'équipe adverse (visibles en LCU).
  const enemySpellNames = [];
  for (const m of enemyTeam) {
    const a = spellName(m.spell1Id);
    const b = spellName(m.spell2Id);
    if (a && a !== 'Flash') enemySpellNames.push(a);
    if (b && b !== 'Flash') enemySpellNames.push(b);
  }
  const oppHasIgnite = oppMember && (Number(oppMember.spell1Id) === 14 || Number(oppMember.spell2Id) === 14);
  const oppHasExhaust = oppMember && (Number(oppMember.spell1Id) === 3 || Number(oppMember.spell2Id) === 3);
  const oppHasCleanse = oppMember && (Number(oppMember.spell1Id) === 1 || Number(oppMember.spell2Id) === 1);
  const enemyIgniteCount = enemySpellNames.filter((s) => s === 'Embrasement').length;
  const enemyExhaustCount = enemySpellNames.filter((s) => s === 'Fatigue').length;

  // Priorité 1 : sorts d'invoc réels de l'adversaire de lane.
  if (oppHasIgnite && iAmSquishy && /embrasement|ignite/i.test(summoners)) {
    summoners = swapOffensive(summoners, 'Barrière');
    summonerNote = `${oppName} a pris Embrasement (all-in) → Barrière pour survivre à son combo plutôt que d'échanger les Embrasement.`;
  } else if (oppAssassin && iAmSquishy && /embrasement|ignite/i.test(summoners)) {
    summoners = swapOffensive(summoners, 'Barrière');
    summonerNote = `Barrière plutôt qu'Embrasement : ${oppName} burst fort (assassin) — de quoi survivre à son all-in.`;
  } else if ((oppHardCc || (enemyComp && enemyComp.ccCount >= 3)) && iAmSquishy) {
    summoners = swapOffensive(summoners, 'Nettoyage');
    summonerNote = oppHardCc
      ? `Nettoyage envisageable : ${oppName} a un CC fiable qui te lock (casse la chaîne de contrôle).`
      : `Nettoyage envisageable : l'équipe adverse aligne beaucoup de CC (${enemyComp.ccCount}) — de quoi sortir d'un lock.`;
  }
  if (oppHasExhaust) notes.push(`${oppName} a Fatigue : tes all-ins burst sont moins fiables — joue le long terme / le poke.`);
  if (oppHasCleanse) notes.push(`${oppName} a Nettoyage : ton Embrasement/CC dur sera annulé — ne compte pas dessus pour le kill.`);
  if (!oppHasIgnite && enemyIgniteCount >= 2) notes.push(`${enemyIgniteCount} Embrasement côté adverse : anticipe des all-ins, garde de la survie.`);
  if (enemyExhaustCount >= 2) notes.push(`${enemyExhaustCount} Fatigue en face : ton burst sera coupé en teamfight, étale tes dégâts.`);

  // Runes : keystone/secondaire du build + notes de matchup ET de comp globale.
  let runes = build.runes ? build.runes.keystone + (build.runes.secondary ? ' · ' + build.runes.secondary : '') : null;
  const runeNotes = [];
  if (laneOpponent) {
    const oppDmg = classifyDamage(laneOpponent);
    if (oppAssassin) runeNotes.push('Secondaire de survie (Seconde Souffle / Garde-Ange) vs le burst de lane.');
    if (oppTags.includes('Mage') && oppDmg === 'AP') runeNotes.push('Contre le poke : Seconde Souffle + Biscuits pour tenir la lane.');
    if (oppTags.includes('Marksman')) runeNotes.push('Contre un ranged : sustain/vitesse contre le poke (Fleet / Seconde Souffle).');
  }
  // Toute l'équipe adverse.
  if (enemyComp) {
    if (enemyComp.burstCount >= 2) runeNotes.push(`Comp adverse à fort burst (${enemyComp.burstCount}) : Seconde Souffle/Os Démoniaque + Garde-Ange en secondaire.`);
    if (enemyComp.ccCount >= 4) runeNotes.push(`Beaucoup de CC (${enemyComp.ccCount}) : Ténacité (bottes de Mercure) et rune de survie.`);
    if (enemyComp.profile === 'à dominante AD') runeNotes.push('Comp majoritairement AD : fragments d’armure + Os Démoniaque.');
    if (enemyComp.profile === 'à dominante AP') runeNotes.push('Comp majoritairement AP : fragments de résistance magique + bottes de Mercure.');
  }
  if (autofilled) {
    runeNotes.unshift('Autofill : privilégie une page sûre et polyvalente (survie/sustain) plutôt qu’une page all-in risquée.');
  }
  return {
    summoners,
    summonerNote,
    runes,
    runeNote: runeNotes[0] || null,
    notes: [summonerNote, ...notes, ...runeNotes].filter(Boolean).slice(0, 5),
    enemySpells: [...new Set(enemySpellNames)],
    autofilled: Boolean(autofilled),
  };
}

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

// Winrates de matchup réels (data/champion-data.json, généré par fetch-counters),
// pour ancrer la probabilité de win sur des données plutôt que l'heuristique.
let LIVE = undefined;
function loadLiveStats() {
  if (LIVE !== undefined) return LIVE;
  try {
    LIVE = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'champion-data.json'), 'utf8'));
  } catch {
    LIVE = null;
  }
  return LIVE;
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

// Estimation de probabilité de victoire d'un pick dans CE contexte.
// Si `liveWr` (winrate de matchup réel 0–1) est fourni, on l'utilise comme base
// (donnée ancrée, bornes plus larges) ; sinon heuristique transparente.
function estimateWinProb({ laneCounter, enemyCounterCount, synergy, balances, mastery, enemyComp, liveWr }) {
  if (liveWr != null && liveWr > 0) {
    let p = liveWr;
    if (synergy) p += 0.02;
    if (balances) p += 0.015;
    p += Math.min(0.02, (masteryWeight(mastery) / 2) * 0.02);
    return { winProb: Math.round(Math.max(0.3, Math.min(0.72, p)) * 100), grounded: true };
  }
  let p = 0.5;
  if (laneCounter) p += 0.06;
  p += Math.min(0.06, (enemyCounterCount || 0) * 0.02);
  if (synergy) p += 0.03;
  if (balances) p += 0.02;
  p += Math.min(0.03, (masteryWeight(mastery) / 2) * 0.03);
  if (enemyComp && enemyComp.burstCount >= 3) p -= 0.02;
  if (enemyComp && enemyComp.ccCount >= 4) p -= 0.02;
  return { winProb: Math.round(Math.max(0.35, Math.min(0.66, p)) * 100), grounded: false };
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
  // Champion que TU as pické/hovered (pour le fond d'écran).
  const myPicked = myMember && myMember.championId > 0 && ddragon ? ddragon.resolveChampionByKey(myMember.championId) : null;

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
  let oppMember = null;
  if (myRole) {
    oppMember = (session.theirTeam || []).find((m) => normRole(m.assignedPosition) === myRole && m.championId > 0) || null;
    if (oppMember && ddragon) laneOpponent = ddragon.resolveChampionByKey(oppMember.championId);
  }

  // Autofill : tu es assigné à un rôle qui n'est pas dans ta pool configurée
  // (tes mains). On ajuste alors les conseils vers plus de sûreté/confort.
  const poolRoles = Object.keys((loadPool().pool || {}));
  const autofilled = Boolean(myRole && poolRoles.length && !poolRoles.includes(myRole));

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

  // Winrate de matchup réel (0–1) d'un pick vs l'adversaire de lane, si dispo.
  const live = loadLiveStats();
  const matchupWr = (pickId, role, oppId) => {
    if (!live || !live.champions || !oppId) return null;
    const e = live.champions[pickId] && live.champions[pickId][role];
    if (!e || !Array.isArray(e.matchups)) return null;
    const m = e.matchups.find((x) => x && (x.id === oppId) && (x.games == null || x.games >= 50));
    return m && m.wr != null ? m.wr : null;
  };

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
      const liveWr = matchupWr(champ.id, myRole, laneOpponent && laneOpponent.id);
      const wp = estimateWinProb({
        laneCounter,
        enemyCounterCount,
        synergy: Boolean(ally),
        balances,
        mastery: entry.mastery,
        enemyComp,
        liveWr,
      });
      if (wp.grounded) reasons.push('proba basée sur winrate réel de matchup');
      poolPicks.push({
        ...champRef(champ),
        mastery: entry.mastery,
        score: +score.toFixed(2),
        reasons,
        winProb: wp.winProb,
        winProbGrounded: wp.grounded,
      });
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

  // ── Bans conseillés : champions qui menacent le plus TA pool pour ce rôle ──
  const poolForRole = (loadPool().pool || {})[myRole] || [];
  const myPoolIds = new Set(poolForRole.map((e) => canonId(e.champion)).filter(Boolean));
  const banScores = new Map();
  for (const entry of poolForRole) {
    const champ = ddragon ? ddragon.resolveChampionByName(entry.champion) : null;
    if (!champ) continue;
    for (const counterId of counterListOf(champ)) {
      const cid = canonId(counterId);
      if (!cid || taken.has(cid) || bannedSet.has(cid) || myPoolIds.has(cid)) continue;
      const cur = banScores.get(cid) || { score: 0, threatens: [] };
      cur.score += 2;
      if (!cur.threatens.includes(champ.id)) cur.threatens.push(champ.id);
      banScores.set(cid, cur);
    }
  }
  // Menaces méta (burst/CC élevé) légèrement valorisées comme bans.
  for (const raw of [...(ds.burstThreats || []), ...(ds.ccHeavy || [])]) {
    const cid = canonId(raw);
    if (!cid || taken.has(cid) || bannedSet.has(cid) || myPoolIds.has(cid)) continue;
    const cur = banScores.get(cid) || { score: 0, threatens: [] };
    cur.score += 0.5;
    banScores.set(cid, cur);
  }
  const banSuggestions = [...banScores.entries()]
    .map(([id, v]) => {
      const c = ddragon ? ddragon.championById.get(id) : null;
      const ref = champRef(c);
      if (!ref) return null;
      const threatNames = v.threatens.map((tid) => {
        const t = ddragon && ddragon.championById.get(tid);
        return t ? t.displayName || t.name : tid;
      });
      const reason = threatNames.length ? `menace ${threatNames.slice(0, 3).join(', ')} de ta pool` : 'grosse menace méta (burst/CC)';
      return { ...ref, score: +v.score.toFixed(2), reason };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  const suggestions = picksFromPool ? poolPicks : pickSuggestions;
  // Proba de win projetée = celle du pick conseillé (top). Estimation indicative.
  const teamWinProb = suggestions.length && suggestions[0].winProb != null ? suggestions[0].winProb : null;
  const winProbGrounded = suggestions.length ? Boolean(suggestions[0].winProbGrounded) : false;

  // Sorts d'invoc + runes adaptés au matchup. On calcule pour le champion le plus
  // probable : celui déjà pické, sinon le meilleur pick conseillé.
  let setupChamp = myPicked;
  if (!setupChamp && suggestions.length && ddragon) {
    setupChamp = ddragon.resolveChampionByName(suggestions[0].id) || ddragon.resolveChampionByName(suggestions[0].name);
  }
  const recommendedSetup = matchupSetup(setupChamp, myRole, laneOpponent, enemyComp, ds, {
    enemyTeam: session.theirTeam || [],
    oppMember,
    autofilled,
  });
  if (recommendedSetup) recommendedSetup.forChampion = champRef(setupChamp);

  return {
    myRole,
    myRoleLabel: ROLE_LABEL[myRole] || myRole || 'Inconnu',
    myChampion: champRef(myPicked),
    laneOpponent: champRef(laneOpponent),
    myChamps: myChamps.map(champRef),
    enemyChamps: enemyChamps.map(champRef),
    enemyComp,
    teamComp: allyComp,
    pickSuggestions: suggestions,
    picksFromPool,
    poolUnresolved,
    teamWinProb,
    winProbGrounded,
    banSuggestions,
    buildSuggestions,
    runeHints,
    recommendedSetup,
    autofilled,
    autofillNote: autofilled
      ? `Tu es autofill ${ROLE_LABEL[myRole] || myRole} (hors de ta pool ${poolRoles.map((r) => ROLE_LABEL[r] || r).join('/')}). Joue sûr : champion simple/défensif, freeze/farm, évite les plays risqués tôt.`
      : null,
    timerSeconds: session.timer ? Math.round((session.timer.adjustedTimeLeftInPhase || 0) / 1000) : null,
  };
}

module.exports = { analyzeChampSelect, normRole, ROLE_LABEL };
