import type { MapDef } from '../mapSchema.ts';

// Route 10: Aldenmoor Abbey <-> Wyrmspire Heights. Team Ashfall grunts patrol this stretch,
// guarding the approach to their mountain operation.
export const ROUTE_10: MapDef = {
  id: 'route_10',
  name: 'Route 10',
  width: 15,
  height: 16,
  skyColor: '#8898b8',
  groundColor: '#5a6a7a',
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
    { x: 6, y: 1, toMapId: 'aldenmoor_abbey', spawnX: 8, spawnY: 12, spawnFacing: 'down' },
    { x: 6, y: 14, toMapId: 'wyrmspire_heights', spawnX: 8, spawnY: 1, spawnFacing: 'down' },
  ],
  encounters: [
    { speciesId: 45, minLevel: 64, maxLevel: 66, weight: 4 },
    { speciesId: 46, minLevel: 65, maxLevel: 67, weight: 2 },
    { speciesId: 110, minLevel: 64, maxLevel: 66, weight: 3 },
    { speciesId: 129, minLevel: 65, maxLevel: 67, weight: 1 },
    { speciesId: 149, minLevel: 65, maxLevel: 67, weight: 1 },
  ],
  npcs: [
    {
      id: 'route10_ashfall_grunt_2',
      x: 4,
      y: 6,
      facing: 'right',
      name: 'Sbire de la Team Braise-Noire',
      sprite: 'villain',
      dialogue: [
        "Cette montagne cache la machine du Directeur. Personne ne doit approcher !",
        "Tu veux un badge de plus ? Prends plutot une raclee.",
      ],
      team: [
        { speciesId: 106, level: 65 },
        { speciesId: 120, level: 66 },
      ],
      postBattleDialogue: [
        "Impossible... Le Directeur Corvane va vouloir te rencontrer en personne.",
      ],
      setFlagOnComplete: 'route10_ashfall_grunt2_defeated',
    },
    {
      id: 'route10_ashfall_grunt_3',
      x: 10,
      y: 9,
      facing: 'left',
      name: 'Sbire de la Team Braise-Noire',
      sprite: 'villain',
      dialogue: [
        "L'energie latente des Wyldes va enfin alimenter la machine. Rien ne nous arretera.",
      ],
      team: [{ speciesId: 71, level: 67 }],
      postBattleDialogue: ["Tch. Passe si tu veux, mais Wyrmspire ne te sera pas favorable."],
      setFlagOnComplete: 'route10_ashfall_grunt3_defeated',
    },
  ],
};
