import type { MapDef } from '../mapSchema.ts';

// Route 7: Fenmoor Crossing <-> Frostgale Pass. The marsh air turns cold and crisp.
export const ROUTE_7: MapDef = {
  id: 'route_7',
  name: 'Route 7',
  width: 15,
  height: 16,
  skyColor: '#d5e8f0',
  groundColor: '#c8d8dc',
  tiles: [
    '###############',
    '#.....D.......#',
    '#.....,.......#',
    '#...,,,,,..^..#',
    '#...,\"\"\",.....#',
    '#...,\"\"\",..^..#',
    '#...,,,,,.....#',
    '#.....,.......#',
    '#.....,....^..#',
    '#...,,,,,.....#',
    '#...,\"\"\",..^..#',
    '#...,\"\"\",.....#',
    '#...,,,,,.....#',
    '#.....,.......#',
    '#.....D.......#',
    '###############',
  ],
  warps: [
    { x: 6, y: 1, toMapId: 'fenmoor_crossing', spawnX: 9, spawnY: 12, spawnFacing: 'down' },
    { x: 6, y: 14, toMapId: 'frostgale_pass', spawnX: 8, spawnY: 1, spawnFacing: 'down' },
  ],
  encounters: [
    { speciesId: 32, minLevel: 46, maxLevel: 48, weight: 4 },
    { speciesId: 66, minLevel: 46, maxLevel: 48, weight: 3 },
    { speciesId: 67, minLevel: 46, maxLevel: 48, weight: 2 },
    { speciesId: 111, minLevel: 47, maxLevel: 49, weight: 2 },
    { speciesId: 86, minLevel: 47, maxLevel: 49, weight: 1 },
  ],
  npcs: [
    {
      id: 'route7_ranger_finn',
      x: 3,
      y: 6,
      facing: 'right',
      name: 'Garde-foret Finn',
      sprite: 'ranger',
      dialogue: [
        "L'air se rafraichit, on approche de Frostgale Pass. Couvre-toi bien !",
      ],
      team: [
        { speciesId: 32, level: 47 },
        { speciesId: 66, level: 48 },
      ],
      postBattleDialogue: ["Bien joue ! Prepare-toi pour le froid."],
      setFlagOnComplete: 'route7_finn_defeated',
    },
    {
      id: 'route7_hiker_ottar',
      x: 10,
      y: 9,
      facing: 'left',
      name: 'Randonneur Ottar',
      sprite: 'hiker',
      dialogue: [
        "J'ai vu un Talonkit planer au-dessus des crevasses. Magnifique.",
      ],
      team: [{ speciesId: 67, level: 49 }],
      postBattleDialogue: ["Bon combat, dresseur des cimes !"],
      setFlagOnComplete: 'route7_ottar_defeated',
    },
  ],
};
