#!/usr/bin/env node
'use strict';

// Runner de tests léger, sans dépendance. `npm test`.
// Couvre les advisors (logique pure) en mode hors-ligne (Data Dragon fallback).

let pass = 0;
let fail = 0;
const fails = [];

function assert(cond, msg) {
  if (cond) pass++;
  else {
    fail++;
    fails.push(msg);
    console.log('  ✗ ' + msg);
  }
}
async function test(name, fn) {
  try {
    await fn();
    console.log('✓ ' + name);
  } catch (e) {
    fail++;
    fails.push(`${name}: ${e.message}`);
    console.log('✗ ' + name + ' — ' + e.message);
  }
}

const { DataDragon } = require('../src/data/ddragon');
const { classifyDamage, analyzeComp } = require('../src/advisor/profile');
const { analyzeChampSelect } = require('../src/advisor/pickAdvisor');
const { analyzeInGame } = require('../src/advisor/heuristics');
const { buildItemPlan } = require('../src/advisor/itemPlan');
const { getBuild } = require('../src/advisor/builds');
const { GameHistory } = require('../src/data/history');
const { climbToMaster, rankEmblemUrl } = require('../src/data/riotApi');
const { CoachLoop } = require('../src/coachLoop');
const fetchBuilds = require('../scripts/fetch-builds');
const { mockChampSelectSession, mockAllGameData } = require('../src/mock/mockData');

(async () => {
  const dd = new DataDragon();
  await dd.init();
  const champ = (id) => dd.championById.get(id);

  await test('classifyDamage : override AP et tags', () => {
    assert(classifyDamage(champ('Katarina')) === 'AP', 'Katarina doit être AP (override)');
    const cait = champ('Caitlyn');
    assert(!cait || classifyDamage(cait) === 'AD', 'Caitlyn (Marksman) doit être AD');
  });

  await test('analyzeComp : profil dominant', () => {
    const adComp = ['Garen', 'Darius', 'Caitlyn'].map(champ).filter(Boolean);
    const comp = analyzeComp(adComp);
    assert(comp.profile === 'à dominante AD', 'comp full AD => à dominante AD, eu: ' + comp.profile);
    assert(typeof comp.ccLevel === 'string', 'ccLevel doit être une chaîne');
  });

  await test('analyzeChampSelect : picks pool + winprob + bans', () => {
    const p = analyzeChampSelect(mockChampSelectSession(), dd);
    assert(p.picksFromPool === true, 'doit piocher dans la pool');
    assert(p.pickSuggestions.length > 0, 'doit proposer des picks');
    assert(typeof p.pickSuggestions[0].winProb === 'number', 'chaque pick a une winProb');
    assert(p.teamWinProb != null, 'teamWinProb renseigné');
    assert(Array.isArray(p.banSuggestions) && p.banSuggestions.length > 0, 'des bans conseillés');
    assert(p.banSuggestions.every((b) => b.reason), 'chaque ban a une raison');
  });

  await test('analyzeChampSelect : synergie alliée prise en compte', () => {
    const p = analyzeChampSelect(mockChampSelectSession(), dd);
    // au moins une raison de pick mentionne une synergie OU un counter/équilibre
    const hasReasons = p.pickSuggestions.some((s) => (s.reasons || []).length > 0);
    assert(hasReasons, 'les picks ont des raisons');
  });

  await test('analyzeChampSelect : setup sorts/runes adapté au matchup + équipe', () => {
    const s = mockChampSelectSession();
    // Je pick un mage fragile (Lux) au mid ; l'adversaire Zed prend Embrasement.
    s.myTeam[0].championId = 99; // Lux
    const zed = s.theirTeam.find((m) => m.championId === 238);
    zed.spell1Id = 4; // Flash
    zed.spell2Id = 14; // Embrasement / Ignite
    const p = analyzeChampSelect(s, dd);
    assert(p.recommendedSetup, 'un setup recommandé est renvoyé');
    assert(typeof p.recommendedSetup.summoners === 'string', 'des sorts d’invoc conseillés');
    assert(p.recommendedSetup.enemySpells.includes('Embrasement'), 'lit les sorts d’invoc adverses réels');
    // Zed (assassin) + Embrasement + je suis fragile => Barrière conseillée.
    assert(/Barrière/.test(p.recommendedSetup.summoners), 'swap vers Barrière vs Zed Embrasement, eu: ' + p.recommendedSetup.summoners);
    assert(p.autofilled === false, 'mid est dans ma pool => pas autofill');
  });

  await test('analyzeChampSelect : détection autofill hors pool', () => {
    const s = mockChampSelectSession();
    s.myTeam[0].assignedPosition = 'top'; // hors pool (MIDDLE/BOTTOM)
    const p = analyzeChampSelect(s, dd);
    assert(p.autofilled === true, 'top hors pool => autofill détecté');
    assert(typeof p.autofillNote === 'string' && p.autofillNote.length > 0, 'une note autofill est fournie');
    assert(p.recommendedSetup && p.recommendedSetup.autofilled === true, 'le setup reflète l’autofill');
    assert((p.recommendedSetup.notes || []).some((n) => /[Aa]utofill/.test(n)), 'note autofill dans le setup');
  });

  await test('buildItemPlan : build du champion joué', () => {
    const plan = buildItemPlan(analyzeInGame(mockAllGameData(600), dd), dd);
    assert(plan && plan.champion === 'Zoe', 'plan pour Zoe');
    assert(plan.full.length >= 4, 'build complet ordonné');
    assert(Array.isArray(plan.next) && plan.next.length > 0, 'prochains achats présents');
    assert(Array.isArray(plan.runeHints), 'runeHints présents');
  });

  await test('getBuild : repli sur builds curés', () => {
    const b = getBuild('Zoe', 'MIDDLE');
    assert(b && b.runes, 'Zoe a des runes curées');
    assert(b.core && b.core.length, 'Zoe a un core');
  });

  await test('riotApi : games à win pour Master (climbToMaster)', () => {
    assert(climbToMaster('MASTER', null, 30).reached === true, 'déjà Master => reached');
    const d1 = climbToMaster('DIAMOND', 'I', 80, 22);
    assert(d1.remainingLp === 20 && d1.gamesToWin === 1, 'Diamant I 80LP => 20 LP / 1 game, eu: ' + JSON.stringify(d1));
    const gold = climbToMaster('GOLD', 'IV', 0, 20);
    assert(gold.remainingLp === 1600 && gold.gamesToWin === 80, 'Or IV 0LP => 1600 LP / 80 games @20, eu: ' + JSON.stringify(gold));
    assert(rankEmblemUrl('GOLD').includes('emblem-gold'), 'URL emblème par tier');
  });

  await test('heuristics : alerte ATTENTION en infériorité numérique', () => {
    const mk = (c, t, pos, dead) => ({ championName: c, team: t, position: pos, level: 10, isDead: dead, respawnTimer: dead ? 20 : 0, scores: { kills: 1, deaths: 2, assists: 1, creepScore: 120, wardScore: 5 }, items: [], riotIdGameName: c });
    const me = { ...mk('Zoe', 'ORDER', 'MIDDLE', false), riotId: 'Me#X', summonerName: 'Me' };
    // 2 alliés morts, ennemis au complet -> infériorité nette.
    const data = {
      activePlayer: { currentGold: 800, level: 10, riotId: 'Me#X', summonerName: 'Me', championStats: { currentHealth: 900, maxHealth: 1000 } },
      allPlayers: [
        me,
        mk('Garen', 'ORDER', 'TOP', true), mk('Lee Sin', 'ORDER', 'JUNGLE', true),
        mk('Zed', 'CHAOS', 'MIDDLE', false), mk('Darius', 'CHAOS', 'TOP', false),
        mk('Caitlyn', 'CHAOS', 'BOTTOM', false), mk('Thresh', 'CHAOS', 'UTILITY', false),
      ],
      events: { Events: [] },
      gameData: { gameTime: 700 },
    };
    const res = analyzeInGame(data, dd);
    assert(res.summary.risk && res.summary.risk.level === 'danger', 'un risque danger est détecté');
    assert(res.advice.some((a) => a.category === 'ATTENTION' && a.alert && a.cue), 'un conseil ATTENTION avec cue est émis');
    assert(res.summary.me.csTarget === 10, 'objectif CS/min = 10 exposé');
  });

  await test('heuristics : alerte de tempo si avance', () => {
    const mk = (c, t, pos, lvl) => ({ championName: c, team: t, position: pos, level: lvl, isDead: false, respawnTimer: 0, scores: { kills: 1, deaths: 0, assists: 0, creepScore: 100, wardScore: 5 }, items: [], riotIdGameName: c });
    const me = { ...mk('Zoe', 'ORDER', 'MIDDLE', 9), riotId: 'Me#X', summonerName: 'Me' };
    const data = {
      activePlayer: { currentGold: 500, level: 9, riotId: 'Me#X', summonerName: 'Me', championStats: { currentHealth: 900, maxHealth: 1000 } },
      allPlayers: [me, mk('Zed', 'CHAOS', 'MIDDLE', 6)],
      events: { Events: [] },
      gameData: { gameTime: 600 },
    };
    const res = analyzeInGame(data, dd);
    assert(res.advice.some((a) => a.category === 'Tempo'), 'doit émettre une alerte de tempo');
  });

  await test('CoachLoop._detectTrigger : front sur la mort', () => {
    const loop = new CoachLoop();
    const mkRes = (hp, dead) => ({ scoreboard: { me: { isDead: dead } }, summary: { me: { hpPct: hp } } });
    const gd = { events: { Events: [] } };
    loop._detectTrigger(mkRes(100, false), gd, true); // seed
    const steady = loop._detectTrigger(mkRes(100, false), gd, false);
    assert(steady === null, 'pas de trigger si rien ne change');
    const death = loop._detectTrigger(mkRes(0, true), gd, false);
    assert(typeof death === 'string', 'trigger à la mort');
  });

  await test('GameHistory : stats agrégées', () => {
    const h = new GameHistory();
    h.games = [
      { win: true, kills: 8, deaths: 2, assists: 6, champion: 'Zoe' },
      { win: false, kills: 4, deaths: 6, assists: 3, champion: 'Katarina' },
    ];
    const l = h.list();
    assert(l.stats.winrate === 50, 'winrate 50%, eu: ' + l.stats.winrate);
    assert(l.stats.played === 2, '2 parties');
    assert(l.stats.byChampion.length === 2, '2 champions');
  });

  await test('fetch-builds : extraction itemIds + split bottes', () => {
    const role = [];
    role[2] = [120, 340, [1055, 2003]];
    role[3] = [70, 130, [3006, 6672, 3031]];
    role[4] = [[3036, 200], [3072, 150]];
    const raw = fetchBuilds.buildFromUggRole(role);
    assert(raw.coreIds.join(',') === '3006,6672,3031', 'core ids');
    const { boots, rest } = fetchBuilds.splitBoots(raw.coreIds, new Set([3006]));
    assert(boots === 3006, 'bottes détectées');
    assert(rest.join(',') === '6672,3031', 'reste sans les bottes');
    assert(raw.situationalIds[0] === 3036, 'première option du 4e item');
  });

  await test('live data : dragons soul + keystones + tes stats', () => {
    const r = analyzeInGame(mockAllGameData(620), dd);
    assert(r.summary.dragons && r.summary.dragons.enemy.length === 3, 'ennemi à 3 drakes');
    assert(r.summary.dragons.soulPointTeam === 'enemy', 'point de soul ennemi détecté');
    assert(r.advice.some((a) => a.id === 'dragon-soulpoint'), 'conseil soul émis');
    assert(r.summary.enemyKeystones.length >= 4, 'keystones ennemis lus');
    assert(r.summary.me.stats && r.summary.me.stats.ap === 180, 'tes stats complètes (AP)');
    assert(r.summary.enemySpells.some((s) => (s.spells || []).includes('Flash')), 'sorts d’invoc ennemis lus');
  });

  await test('CoachLoop._computePlayerProfile : profil de faiblesses', () => {
    const loop = new CoachLoop();
    loop.history.games = [
      { win: true, kills: 8, deaths: 2, assists: 5, champion: 'Zoe', review: { toImprove: ['vision tardive'] } },
      { win: false, kills: 3, deaths: 7, assists: 4, champion: 'Katarina', review: { toImprove: ['all-ins forcés'] } },
    ];
    const p = loop._computePlayerProfile();
    assert(p && p.winrate === 50, 'winrate calculé');
    assert(p.recurringWeaknesses.includes('vision tardive'), 'faiblesses récurrentes extraites');
  });

  await test('RiotApi : disponibilité selon la clé', () => {
    const { RiotApi } = require('../src/data/riotApi');
    const api = new RiotApi();
    assert(typeof api.available === 'boolean', 'available est un booléen');
    assert(typeof api.getProfile === 'function' && typeof api.getRecentMatches === 'function', 'méthodes présentes');
  });

  console.log(`\n${pass} assertions OK, ${fail} échec(s).`);
  if (fail) {
    console.log('\nÉCHECS :');
    fails.forEach((f) => console.log('  - ' + f));
    process.exit(1);
  }
  console.log('✅ Tous les tests passent.');
})().catch((e) => {
  console.error('Erreur runner:', e.stack);
  process.exit(1);
});
