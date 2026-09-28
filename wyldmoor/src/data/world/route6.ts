import type { MapDef } from '../mapSchema.ts';

// Route 6: Stonecrag City <-> Fenmoor Crossing. Dry rock gives way to marshland.
// Bryn's third rematch happens here, once Gym 5 has been cleared.
export const ROUTE_6: MapDef = {
  id: 'route_6',
  name: 'Route 6',
  width: 15,
  height: 16,
  skyColor: '#a9b89a',
  groundColor: '#6a8a5a',
  tiles: [
    '###############',
    '#.....D.......#',
    '#.....,.......#',
    '#...,,,,,.....#',
    '#...,\"\"\",.....#',
    '#...,\"\"\",.....#',
    '#...,,,,,..~..#',
    '#.....,....~..#',
    '#.....,....~..#',
    '#...,,,,,.....#',
    '#...,\"\"\",.....#',
    '#...,\"\"\",.....#',
    '#...,,,,,.....#',
    '#.....,.......#',
    '#.....D.......#',
    '###############',
  ],
  warps: [
    { x: 6, y: 1, toMapId: 'stonecrag_city', spawnX: 9, spawnY: 12, spawnFacing: 'down' },
    { x: 6, y: 14, toMapId: 'fenmoor_crossing', spawnX: 8, spawnY: 1, spawnFacing: 'down' },
  ],
  encounters: [
    { speciesId: 22, minLevel: 39, maxLevel: 41, weight: 3 },
    { speciesId: 36, minLevel: 39, maxLevel: 41, weight: 3 },
    { speciesId: 52, minLevel: 39, maxLevel: 41, weight: 3 },
    { speciesId: 79, minLevel: 40, maxLevel: 42, weight: 2 },
    { speciesId: 117, minLevel: 40, maxLevel: 42, weight: 1 },
  ],
  npcs: [
    {
      id: 'route6_rival_3',
      x: 4,
      y: 6,
      facing: 'right',
      name: 'Bryn',
      sprite: 'rival',
      dialogue: [
        "Cinq badges deja ! On avance bien, tous les deux.",
        "Assez discute, montre-moi ce que ton equipe a dans le ventre !",
      ],
      team: [
        { speciesId: 2, level: 38 },
        { speciesId: 78, level: 37 },
        { speciesId: 20, level: 38 },
        { speciesId: 24, level: 39 },
      ],
      postBattleDialogue: [
        "Tu deviens vraiment fort... Je ne vais pas me laisser distancer !",
        "A bientot, dresseur.",
      ],
      setFlagOnComplete: 'bryn_defeated_3',
      requiresFlag: 'gym5_magda_defeated',
    },
    {
      id: 'route6_ranger_ivy',
      x: 10,
      y: 10,
      facing: 'left',
      name: 'Garde-foret Ivy',
      sprite: 'ranger',
      dialogue: [
        "Fenmoor Crossing commence juste apres ce marecage. Prends garde aux vapeurs toxiques.",
      ],
      team: [{ speciesId: 52, level: 41 }],
      postBattleDialogue: ["Bonne chance dans le marais !"],
      setFlagOnComplete: 'route6_ivy_defeated',
    },
  ],
};
