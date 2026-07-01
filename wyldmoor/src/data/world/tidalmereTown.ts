import type { MapDef } from '../mapSchema.ts';

// Gym 3: Nerissa Vale, Water specialist, awards the Tide Badge.
export const TIDALMERE_TOWN: MapDef = {
  id: 'tidalmere_town',
  name: 'Tidalmere Town',
  width: 18,
  height: 14,
  skyColor: '#7ec8e3',
  groundColor: '#e0cf9a',
  tiles: [
    '##################',
    '#........D.......#',
    '#........B.......#',
    '#................#',
    '#..B..~~~~~...B..#',
    '#..D..~~~~~...D..#',
    '#.....~~~~~......#',
    '#.....SSSSS......#',
    '#....B......G....#',
    '#....D......G....#',
    '#..S.............#',
    '#..S.............#',
    '#........,.......#',
    '########..########',
  ],
  warps: [
    { x: 9, y: 0, toMapId: 'route_3', spawnX: 6, spawnY: 13, spawnFacing: 'up' },
    { x: 9, y: 12, toMapId: 'route_4', spawnX: 8, spawnY: 1, spawnFacing: 'down' },
  ],
  encounters: [
    { speciesId: 7, minLevel: 20, maxLevel: 23, weight: 4 },
    { speciesId: 8, minLevel: 21, maxLevel: 23, weight: 3 },
    { speciesId: 57, minLevel: 20, maxLevel: 23, weight: 3 },
    { speciesId: 116, minLevel: 21, maxLevel: 24, weight: 2 },
    { speciesId: 98, minLevel: 22, maxLevel: 24, weight: 1 },
  ],
  npcs: [
    {
      id: 'tidalmere_elder',
      x: 4,
      y: 3,
      facing: 'down',
      name: 'Ancienne Maris',
      sprite: 'elder',
      dialogue: [
        "Tidalmere vit de la mer depuis toujours. Nos Wyldes aquatiques sont nos meilleurs amis.",
        "Nerissa t'attend au gymnase, pres du bassin.",
      ],
    },
    {
      id: 'tidalmere_fisher',
      x: 13,
      y: 3,
      facing: 'down',
      name: 'Pecheur Aldric',
      sprite: 'fisher',
      dialogue: [
        "Le bruit des vagues me detend, mais un bon combat me reveille !",
      ],
      team: [
        { speciesId: 57, level: 22 },
        { speciesId: 8, level: 23 },
      ],
      postBattleDialogue: ["Belle prise, dresseur !"],
      setFlagOnComplete: 'tidalmere_aldric_defeated',
    },
    {
      id: 'tidalmere_gym_leader_nerissa',
      x: 12,
      y: 9,
      facing: 'down',
      name: 'Nerissa Vale',
      sprite: 'gymLeader',
      dialogue: [
        "Bienvenue au gymnase de Tidalmere. Je suis Nerissa, et la mer coule dans mes veines.",
        "Voyons si ton courage tient la maree !",
      ],
      team: [
        { speciesId: 57, level: 23 },
        { speciesId: 58, level: 24 },
        { speciesId: 9, level: 26 },
      ],
      postBattleDialogue: [
        "Une victoire aussi limpide que l'eau claire. Bravo !",
        "Voici le Badge de Maree.",
      ],
      setFlagOnComplete: 'gym3_nerissa_defeated',
    },
  ],
  gym: {
    leaderName: 'Nerissa Vale',
    leaderNpcId: 'tidalmere_gym_leader_nerissa',
    badgeName: 'Badge de Maree',
    team: [
      { speciesId: 57, level: 23 },
      { speciesId: 58, level: 24 },
      { speciesId: 9, level: 26 },
    ],
    flagOnDefeat: 'gym3_nerissa_defeated',
  },
};
