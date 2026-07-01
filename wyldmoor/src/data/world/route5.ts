import type { MapDef } from '../mapSchema.ts';

// Route 5: Windle Hamlet <-> Stonecrag City. Farmland gives way to rocky quarry terrain.
export const ROUTE_5: MapDef = {
  id: 'route_5',
  name: 'Route 5',
  width: 15,
  height: 16,
  skyColor: '#c9b89a',
  groundColor: '#a89468',
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
    { x: 6, y: 1, toMapId: 'windle_hamlet', spawnX: 9, spawnY: 12, spawnFacing: 'down' },
    { x: 6, y: 14, toMapId: 'stonecrag_city', spawnX: 8, spawnY: 1, spawnFacing: 'down' },
  ],
  encounters: [
    { speciesId: 24, minLevel: 32, maxLevel: 34, weight: 3 },
    { speciesId: 27, minLevel: 32, maxLevel: 34, weight: 3 },
    { speciesId: 29, minLevel: 32, maxLevel: 34, weight: 3 },
    { speciesId: 82, minLevel: 33, maxLevel: 35, weight: 2 },
    { speciesId: 127, minLevel: 33, maxLevel: 35, weight: 1 },
  ],
  npcs: [
    {
      id: 'route5_hiker_bram',
      x: 3,
      y: 6,
      facing: 'right',
      name: 'Randonneur Bram',
      sprite: 'hiker',
      dialogue: [
        "Les roches se font de plus en plus dures a mesure qu'on approche de Stonecrag City.",
        "Testons ta poigne !",
      ],
      team: [
        { speciesId: 27, level: 33 },
        { speciesId: 29, level: 34 },
      ],
      postBattleDialogue: ["Solide ! Stonecrag va te plaire."],
      setFlagOnComplete: 'route5_bram_defeated',
    },
    {
      id: 'route5_youth_cass',
      x: 10,
      y: 9,
      facing: 'left',
      name: 'Jeune Cass',
      sprite: 'youth',
      dialogue: [
        "J'ai trouve un Duneling coince entre deux rochers, il est increvable !",
      ],
      team: [{ speciesId: 24, level: 35 }],
      postBattleDialogue: ["Beau combat, dresseur !"],
      setFlagOnComplete: 'route5_cass_defeated',
    },
  ],
};
