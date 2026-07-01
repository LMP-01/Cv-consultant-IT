import type { MapDef } from '../mapSchema.ts';

// Gym 1: Talia Fenn, Bug/Grass specialist, awards the Sylvan Badge.
export const MOSSREED_VILLAGE: MapDef = {
  id: 'mossreed_village',
  name: 'Mossreed Village',
  width: 18,
  height: 14,
  skyColor: '#bcE0b8',
  groundColor: '#3f8f3f',
  tiles: [
    '##################',
    '#........D.......#',
    '#........B.......#',
    '#.......,,,......#',
    '#..B..,,\"\"\",..B..#',
    '#..D..,\"\"\"\",..D..#',
    '#.....,,\"\",......#',
    '#.......,,,......#',
    '#................#',
    '#....B......G....#',
    '#....D......G....#',
    '#................#',
    '#........,.......#',
    '########..########',
  ],
  warps: [
    { x: 8, y: 0, toMapId: 'route_1', spawnX: 5, spawnY: 13, spawnFacing: 'up' },
    { x: 8, y: 13, toMapId: 'route_2', spawnX: 8, spawnY: 1, spawnFacing: 'down' },
  ],
  encounters: [
    { speciesId: 19, minLevel: 5, maxLevel: 8, weight: 4 },
    { speciesId: 63, minLevel: 5, maxLevel: 8, weight: 3 },
    { speciesId: 1, minLevel: 5, maxLevel: 8, weight: 3 },
    { speciesId: 13, minLevel: 5, maxLevel: 8, weight: 2 },
    { speciesId: 145, minLevel: 6, maxLevel: 9, weight: 1 },
  ],
  npcs: [
    {
      id: 'mossreed_elder',
      x: 4,
      y: 3,
      facing: 'down',
      name: 'Ancienne Selwyn',
      sprite: 'elder',
      dialogue: [
        "Mossreed Village vit au rythme de la foret. Nos Wyldes-insectes tissent la moitie de nos toits !",
        "Le gymnase est au sud-est. Talia y attend les dresseurs courageux.",
      ],
    },
    {
      id: 'mossreed_ranger',
      x: 13,
      y: 3,
      facing: 'down',
      name: 'Garde-foret Bo',
      sprite: 'ranger',
      dialogue: [
        "Les groves profondes au-dela du village cachent des Wyldes tres anciens.",
        "Reviens nous voir quand tu auras ton badge !",
      ],
    },
    {
      id: 'mossreed_gym_leader_talia',
      x: 12,
      y: 9,
      facing: 'down',
      name: 'Talia Fenn',
      sprite: 'gymLeader',
      dialogue: [
        "Bienvenue au gymnase de Mossreed ! Je suis Talia, et mes Wyldes ont grandi avec ces bois.",
        "Voyons si ta determination est aussi solide que l'ecorce d'un vieux chene.",
      ],
      team: [
        { speciesId: 19, level: 8 },
        { speciesId: 63, level: 9 },
        { speciesId: 20, level: 11 },
      ],
      postBattleDialogue: [
        "Ha ! Une belle victoire. Prends ce badge, il te sera utile pour la suite.",
        "Le Badge Sylvestre prouve que tu sais ecouter la foret.",
      ],
      setFlagOnComplete: 'gym1_talia_defeated',
    },
  ],
  gym: {
    leaderName: 'Talia Fenn',
    leaderNpcId: 'mossreed_gym_leader_talia',
    badgeName: 'Badge Sylvestre',
    team: [
      { speciesId: 19, level: 8 },
      { speciesId: 63, level: 9 },
      { speciesId: 20, level: 11 },
    ],
    flagOnDefeat: 'gym1_talia_defeated',
  },
};
