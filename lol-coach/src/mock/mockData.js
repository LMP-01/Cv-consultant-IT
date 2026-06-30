'use strict';

// Données simulées pour le mode démo (--mock). Les noms de champions sont en
// anglais comme les renvoient les API Riot, afin que la résolution Data Dragon
// fonctionne. Le temps de jeu avance pour animer les compteurs d'objectifs.

function mockAllGameData(elapsedSeconds) {
  const gameTime = 280 + elapsedSeconds; // démarre juste avant le 1er dragon
  const level = Math.min(18, 1 + Math.floor(gameTime / 90));
  const cs = Math.round((gameTime / 60) * 7.2);
  const gold = Math.round(450 + elapsedSeconds * 6); // franchit 1300 puis 2200

  const me = {
    championName: 'Zoe',
    riotId: 'TonPseudo#EUW',
    riotIdGameName: 'TonPseudo',
    summonerName: 'TonPseudo',
    team: 'ORDER',
    level,
    position: 'MIDDLE',
    isDead: false,
    respawnTimer: 0,
    scores: { kills: 3, deaths: 1, assists: 4, creepScore: cs, wardScore: 9 },
    summonerSpells: {
      summonerSpellOne: { displayName: 'Flash' },
      summonerSpellTwo: { displayName: 'Ignite' },
    },
    items: [{ itemID: 1056 }, { itemID: 3020 }, { itemID: 6655 }],
  };

  const player = (name, team, position, k, d, a, csv, opts = {}) => ({
    championName: name,
    riotIdGameName: name + 'Player',
    summonerName: name + 'Player',
    team,
    level: Math.min(18, level + (team === 'CHAOS' ? 0 : 0)),
    position,
    isDead: false,
    respawnTimer: 0,
    scores: { kills: k, deaths: d, assists: a, creepScore: csv, wardScore: opts.ward != null ? opts.ward : 6 },
    summonerSpells: {
      summonerSpellOne: { displayName: 'Flash' },
      summonerSpellTwo: { displayName: opts.spell2 || 'Smite' },
    },
    runes: { keystone: { displayName: opts.keystone || 'Conquérant' } },
    items: (opts.items || []).map((id) => ({ itemID: id })),
  });

  const allPlayers = [
    me,
    player('Garen', 'ORDER', 'TOP', 1, 2, 2, Math.round(cs * 0.95), { spell2: 'Teleport', keystone: 'Conquérant', ward: 8 }),
    player('Lee Sin', 'ORDER', 'JUNGLE', 2, 2, 5, Math.round(cs * 0.7), { keystone: 'Conquérant', ward: 22 }),
    player('Jinx', 'ORDER', 'BOTTOM', 4, 1, 3, Math.round(cs * 1.05), { spell2: 'Heal', keystone: 'Tempête déchaînée', ward: 10 }),
    player('Leona', 'ORDER', 'UTILITY', 0, 3, 7, 15, { spell2: 'Ignite', keystone: 'Aftershock', ward: 35 }),
    // Ennemis avec items réels : Darius tank (armure), Caitlyn crit -> counter-build.
    player('Darius', 'CHAOS', 'TOP', 2, 1, 1, Math.round(cs * 0.9), { spell2: 'Ghost', keystone: 'Conquérant', items: [3068, 3047, 3075] }), // Sunfire, Tabis, Thornmail
    player('Kha\'Zix', 'CHAOS', 'JUNGLE', 3, 2, 2, Math.round(cs * 0.65), { keystone: 'Électrocution', items: [6691, 3134] }),
    player('Zed', 'CHAOS', 'MIDDLE', 4, 2, 1, Math.round(cs * 0.98), { spell2: 'Ignite', keystone: 'Électrocution', items: [6691, 3142] }),
    player('Caitlyn', 'CHAOS', 'BOTTOM', 3, 2, 2, Math.round(cs * 1.1), { spell2: 'Heal', keystone: 'Coup de grâce', items: [6676, 3006, 3031] }), // Collector, Berserker, IE
    player('Thresh', 'CHAOS', 'UTILITY', 1, 2, 6, 20, { spell2: 'Ignite', keystone: 'Aftershock', ward: 40 }),
  ];

  const events = [{ EventID: 0, EventName: 'GameStart', EventTime: 0 }];
  if (gameTime > 330) events.push({ EventID: 1, EventName: 'FirstBlood', EventTime: 95 });
  // Objectifs pris (pour soul tracking + état des structures). Les KillerName
  // correspondent aux riotIdGameName (championName + 'Player'), comme l'API live.
  if (gameTime > 360) events.push({ EventID: 2, EventName: 'DragonKill', EventTime: 320, KillerName: 'CaitlynPlayer', DragonType: 'Fire' });
  if (gameTime > 360) events.push({ EventID: 3, EventName: 'TurretKilled', EventTime: 340, KillerName: 'CaitlynPlayer', TurretKilled: 'Turret_T1_C_05_A' });
  if (gameTime > 500) events.push({ EventID: 4, EventName: 'DragonKill', EventTime: 480, KillerName: "Kha'ZixPlayer", DragonType: 'Earth' });
  if (gameTime > 560) events.push({ EventID: 5, EventName: 'DragonKill', EventTime: 540, KillerName: 'CaitlynPlayer', DragonType: 'Water' });

  return {
    activePlayer: {
      currentGold: gold,
      level,
      riotId: me.riotId,
      summonerName: me.summonerName,
      championStats: {
        currentHealth: 1180 * 0.62,
        maxHealth: 1180,
        resourceValue: 320,
        resourceMax: 540,
        attackDamage: 70,
        abilityPower: 180,
        armor: 60,
        magicResist: 38,
        abilityHaste: 25,
        attackSpeed: 0.9,
        moveSpeed: 340,
      },
      abilities: { Q: { abilityLevel: 5 }, W: { abilityLevel: 3 }, E: { abilityLevel: 3 }, R: { abilityLevel: 2 } },
      fullRunes: { keystone: { displayName: 'Comète arcanique' } },
    },
    allPlayers,
    events: { Events: events },
    gameData: { gameMode: 'CLASSIC', gameTime, mapName: 'Map11', mapNumber: 11 },
  };
}

function mockChampSelectSession() {
  return {
    localPlayerCellId: 0,
    timer: { adjustedTimeLeftInPhase: 26000, phase: 'BAN_PICK' },
    myTeam: [
      { cellId: 0, championId: 0, assignedPosition: 'middle', summonerId: 1 },
      { cellId: 1, championId: 86, assignedPosition: 'top', summonerId: 2 }, // Garen
      { cellId: 2, championId: 64, assignedPosition: 'jungle', summonerId: 3 }, // Lee Sin
      { cellId: 3, championId: 222, assignedPosition: 'bottom', summonerId: 4 }, // Jinx
      { cellId: 4, championId: 89, assignedPosition: 'utility', summonerId: 5 }, // Leona
    ],
    theirTeam: [
      { cellId: 5, championId: 122, assignedPosition: 'top', summonerId: 6 }, // Darius
      { cellId: 6, championId: 121, assignedPosition: 'jungle', summonerId: 7 }, // Kha'Zix
      { cellId: 7, championId: 238, assignedPosition: 'middle', summonerId: 8 }, // Zed
      { cellId: 8, championId: 51, assignedPosition: 'bottom', summonerId: 9 }, // Caitlyn
      { cellId: 9, championId: 412, assignedPosition: 'utility', summonerId: 10 }, // Thresh
    ],
    actions: [
      [
        { actorCellId: 0, championId: 0, type: 'pick', completed: false, isInProgress: true },
      ],
    ],
    bans: { myTeamBans: [157], theirTeamBans: [55] }, // Yasuo, Katarina
  };
}

module.exports = { mockAllGameData, mockChampSelectSession };
