import type { MapDef } from '../mapSchema.ts';

// Route 8: Frostgale Pass <-> Hollowmere Village. A fog rolls in as the ice recedes.
export const ROUTE_8: MapDef = {
  id: 'route_8',
  name: 'Route 8',
  width: 15,
  height: 16,
  skyColor: '#b9b8c0',
  groundColor: '#8a8a92',
  tiles: [
    '###############',
    '#.....D.......#',
    '#.....,.......#',
    '#...,,,,,.....#',
    '#...,\"\"\",.....#',
    '#...,\"\"\",.....#',
    '#...,,,,,.....#',
    '#.....,.......#',
    '#.....,.......#',
    '#...,,,,,.....#',
    '#...,\"\"\",.....#',
    '#...,\"\"\",.....#',
    '#...,,,,,.....#',
    '#.....,.......#',
    '#.....D.......#',
    '###############',
  ],
  warps: [
    { x: 6, y: 1, toMapId: 'frostgale_pass', spawnX: 9, spawnY: 12, spawnFacing: 'down' },
    { x: 6, y: 14, toMapId: 'hollowmere_village', spawnX: 8, spawnY: 1, spawnFacing: 'down' },
  ],
  encounters: [
    { speciesId: 42, minLevel: 53, maxLevel: 55, weight: 4 },
    { speciesId: 93, minLevel: 53, maxLevel: 55, weight: 3 },
    { speciesId: 109, minLevel: 54, maxLevel: 56, weight: 2 },
    { speciesId: 125, minLevel: 54, maxLevel: 56, weight: 2 },
    { speciesId: 147, minLevel: 55, maxLevel: 57, weight: 1 },
  ],
  npcs: [
    {
      id: 'route8_lass_wren',
      x: 3,
      y: 6,
      facing: 'right',
      name: 'Demoiselle Wren',
      sprite: 'lass',
      dialogue: [
        "Ce brouillard me donne des frissons... on dirait que quelque chose nous observe.",
      ],
      team: [
        { speciesId: 42, level: 54 },
        { speciesId: 93, level: 55 },
      ],
      postBattleDialogue: ["Merci, je me sens un peu plus rassuree."],
      setFlagOnComplete: 'route8_wren_defeated',
    },
    {
      id: 'route8_scientist_odo',
      x: 10,
      y: 9,
      facing: 'left',
      name: 'Chercheur Odo',
      sprite: 'scientist',
      dialogue: [
        "J'etudie les phenomenes spectraux de Hollowmere. Fascinant et terrifiant a la fois.",
      ],
      team: [{ speciesId: 109, level: 56 }],
      postBattleDialogue: ["Excellentes donnees de combat, merci !"],
      setFlagOnComplete: 'route8_odo_defeated',
    },
  ],
};
