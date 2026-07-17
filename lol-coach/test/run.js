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
const { analyzeInGame, computeWaves } = require('../src/advisor/heuristics');
const { buildItemPlan } = require('../src/advisor/itemPlan');
const { getBuild } = require('../src/advisor/builds');
const { GameHistory } = require('../src/data/history');
const { climbToMaster, rankEmblemUrl } = require('../src/data/riotApi');
const { computeDuel } = require('../public/combat');
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

  await test('cohérence conseil ↔ achats : objet prioritaire (Zhonya vs burst)', () => {
    const r = analyzeInGame(mockAllGameData(700), dd);
    const pb = r.summary.priorityBuy;
    assert(pb && /zhonya|sablier/i.test(pb.item), 'un objet défensif prioritaire est identifié vs le burst');
    assert(pb.when && r.advice.some((a) => a.id === 'priority-buy' && a.title.includes(pb.item)), 'le conseil précise QUAND acheter l’objet');
    const plan = buildItemPlan(r, dd);
    assert(plan.next[0] && plan.next[0].priority && plan.next[0].name === pb.item, 'l’objet prioritaire passe en tête des prochains achats');
    assert(plan.next[0].reason, 'la raison est attachée à l’achat');
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
    assert(rankEmblemUrl('GOLD') === '/ranks/gold.png', 'URL emblème locale par tier');
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
    assert(typeof r.summary.me.kp === 'number', 'participation aux kills (KP%) calculée');
    assert(r.summary.objectivesTaken && r.summary.objectivesTaken.dragons.enemy === 3, 'objectifs pris : 3 drakes adverses');
    assert(r.summary.plates && r.summary.plates.active === false, 'plaques terminées après 14:00');
  });

  await test('combat : proba de duel (trade / all-in) réagit au contexte', () => {
    const base = { me: { level: 11, hpPct: 90, netWorth: 4000, hasUlt: true, hasSpike: false }, targets: [{ level: 11, netWorth: 4000 }], alliesNearby: 0 };
    const even = computeDuel(base);
    assert(even && even.trade >= 40 && even.trade <= 60, 'duel équilibré ≈ 50% au trade, eu: ' + (even && even.trade));
    // Fatigue en face -> all-in nettement moins bon.
    const exhaust = computeDuel({ ...base, targets: [{ level: 11, netWorth: 4000, exhaust: true }] });
    assert(exhaust.allIn < even.allIn, 'Fatigue en face baisse la proba d’all-in');
    // Supériorité numérique -> proba plus haute.
    const twoVone = computeDuel({ ...base, alliesNearby: 1 });
    assert(twoVone.allIn > even.allIn && twoVone.numbers === '2v1', 'un allié proche améliore l’all-in (2v1)');
    // Gros retard d'or -> défavorable.
    const behind = computeDuel({ me: { level: 8, hpPct: 50, netWorth: 1500, hasUlt: false }, targets: [{ level: 11, netWorth: 6000, hasSpike: true }], alliesNearby: 0 });
    assert(behind.allIn < 40 && behind.verdict === 'défavorable', 'net désavantage => défavorable, eu: ' + behind.allIn);
  });

  await test('heuristics : timing des vagues (canon)', () => {
    assert(computeWaves(50).nextCannonSeconds === null, 'pas de canon avant la 1re vague');
    const w = computeWaves(200);
    assert(typeof w.nextCannonSeconds === 'number' && w.nextCannonSeconds >= 0, 'prochain canon calculé');
    assert(typeof w.nextWaveSeconds === 'number', 'prochaine vague calculée');
    assert(computeWaves(1600).nextCannonSeconds != null, 'après 25:00, canon à chaque vague');
  });

  await test('GameHistory : heatmap morts + profil victoires/défaites', () => {
    const h = new GameHistory();
    h.games = [
      { win: true, kills: 8, deaths: 2, assists: 6, csPerMin: 8.2, wardScore: 20, durationSec: 1800, kp: 65, deathTimes: [420, 700] },
      { win: true, kills: 6, deaths: 3, assists: 8, csPerMin: 7.8, wardScore: 24, durationSec: 1700, kp: 70, deathTimes: [500] },
      { win: false, kills: 2, deaths: 8, assists: 3, csPerMin: 6.0, wardScore: 9, durationSec: 2100, kp: 45, deathTimes: [180, 300, 650, 1400] },
    ];
    const s = h.list().stats;
    assert(s.profileByResult.win.csPerMin === 8, 'CS/min moyen des victoires = 8.0, eu: ' + s.profileByResult.win.csPerMin);
    assert(s.profileByResult.loss.deaths === 8, 'morts moyennes des défaites = 8');
    assert(s.deathHeatmap.totalDeaths === 7, 'total morts horodatées = 7');
    assert(s.deathHeatmap.gamesWithData === 3, '3 parties avec horodatage');
    const b5 = s.deathHeatmap.buckets.find((b) => b.from === 5);
    assert(b5 && b5.deaths === 3, '3 morts dans la tranche 5-10 min, eu: ' + (b5 && b5.deaths));
  });

  await test('GameHistory : import Riot dédoublonné par matchId', () => {
    const tmp = require('path').join(require('os').tmpdir(), `lolcoach-hist-${process.pid}.json`);
    const h = new GameHistory(tmp);
    h.games = [{ id: 1, matchId: 'EUW1_A', source: 'live', queue: 'En direct', win: true, kills: 5, deaths: 2, assists: 3 }];
    h._seq = 1;
    const added = h.importMany([
      { matchId: 'EUW1_A', win: true, date: '2026-06-01T00:00:00Z' }, // doublon -> ignoré
      { matchId: 'EUW1_B', source: 'riot', queue: 'Solo/Duo', win: false, kills: 2, deaths: 6, assists: 1, csPerMin: 6, date: '2026-06-02T00:00:00Z', deathTimes: [200, 700] },
      { matchId: 'EUW1_C', source: 'riot', queue: 'Solo/Duo', win: true, kills: 9, deaths: 1, assists: 7, csPerMin: 8.5, date: '2026-06-03T00:00:00Z', deathTimes: [800] },
    ]);
    assert(added === 2, '2 nouvelles parties importées (1 doublon ignoré), eu: ' + added);
    assert(h.games.length === 3, 'total 3 parties');
    const s = h.list().stats;
    assert(s.deathHeatmap.totalDeaths === 3, 'morts importées comptées dans la heatmap');
    // Filtre par file : "Solo/Duo" (2 imports) et "En direct" (1 partie live).
    assert(Array.isArray(s.queues) && s.queues.some((q) => q.queue === 'Solo/Duo' && q.games === 2), 'files listées (Solo/Duo x2)');
    const solo = h.list({ queue: 'Solo/Duo' }).stats;
    assert(solo.played === 2, 'filtre Solo/Duo ne garde que les imports, eu: ' + solo.played);
    assert(solo.profileByResult.win.games === 1 && solo.profileByResult.loss.games === 1, 'profil filtré 1 win / 1 loss');
    try { require('fs').unlinkSync(tmp); } catch { /* nettoyage best-effort */ }
  });

  await test('CoachLoop : résumé vocal de fin de partie', () => {
    const loop = new CoachLoop();
    const txt = loop._endgameSummary({ win: true, kills: 8, deaths: 2, assists: 6, csPerMin: 8.1, role: 'MIDDLE', deathTimes: [] });
    assert(/Victoire/.test(txt) && /8, 2, 6/.test(txt), 'résumé mentionne le résultat + KDA');
    const txt2 = loop._endgameSummary({ win: false, kills: 1, deaths: 4, assists: 2, csPerMin: 7, role: 'MIDDLE', deathTimes: [120, 300] });
    assert(/dixième minute/.test(txt2), 'signale les morts précoces');
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

  await test('Base tous-champions : couverture + entrées valides', () => {
    const { kbEntry, kbSize, championsForRole, kbTraits, kbClass } = require('../src/advisor/championsKb');
    assert(kbSize() >= 160, `couvre ~tous les champions (${kbSize()})`);
    const zed = kbEntry('Zed');
    assert(zed && zed.cls === 'assassin-ad' && zed.dmg === 'AD', 'Zed = assassin AD');
    assert(kbEntry(238) === zed, 'résolution par key numérique (238 = Zed)');
    assert(kbEntry("Kha'Zix") && kbEntry("Kha'Zix").id === 'Khazix', 'tolère la ponctuation des noms');
    for (const role of ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']) {
      assert(championsForRole(role).length >= 15, `au moins 15 champions pour ${role}`);
    }
    const t = kbTraits('Malphite');
    assert(t && t.hardCC && t.tanky, 'traits tank/CC de Malphite');
    assert(kbClass('tank') && Array.isArray(kbClass('tank').core) && kbClass('tank').core.length >= 3, 'classe tank avec build');
  });

  await test('Base tous-champions : build générique pour un champion hors builds curés', () => {
    const { genericBuild, playstyleTip } = require('../src/advisor/championsKb');
    const b = genericBuild('Rengar');
    assert(b && b.generic === true && b.core.length >= 3, 'build générique de classe pour Rengar');
    assert(b.runes && b.runes.keystone, 'runes génériques présentes');
    // getBuild() doit maintenant répondre pour N'IMPORTE quel champion.
    const viaGetBuild = getBuild('Rengar', 'JUNGLE');
    assert(viaGetBuild && Array.isArray(viaGetBuild.core) && viaGetBuild.core.length >= 3, 'getBuild fallback générique');
    const curated = getBuild('Katarina', 'MIDDLE');
    assert(curated && !curated.generic, 'les builds curés priment sur le générique');
    assert(typeof playstyleTip('Darius') === 'string' && playstyleTip('Darius').length > 10, 'conseil de jeu pour Darius');
    // Champion inconnu de la base (nouveau champion) : classé via tags Data Dragon.
    const synth = genericBuild(null, { id: 'NouveauChamp', name: 'Nouveau', tags: ['Mage'] });
    assert(synth && synth.core.length >= 3, 'un champion inconnu reçoit un build de classe via ses tags');
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
