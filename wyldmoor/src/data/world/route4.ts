import type { MapDef } from '../mapSchema.ts';

// Route 4: Tidalmere Town <-> Windle Hamlet. Farmland begins to replace the coast.
export const ROUTE_4: MapDef = {
  id: 'route_4',
  name: 'Route 4',
  width: 14,
  height: 16,
  skyColor: '#bcd9e8',
  groundColor: '#8fae4a',
  tiles: [
    '##############',
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
    '##############',
  ],
  warps: [
    { x: 6, y: 1, toMapId: 'tidalmere_town', spawnX: 9, spawnY: 12, spawnFacing: 'down' },
    { x: 6, y: 14, toMapId: 'windle_hamlet', spawnX: 8, spawnY: 1, spawnFacing: 'down' },
  ],
  encounters: [
    { speciesId: 16, minLevel: 25, maxLevel: 27, weight: 3 },
    { speciesId: 50, minLevel: 25, maxLevel: 27, weight: 3 },
    { speciesId: 10, minLevel: 25, maxLevel: 27, weight: 3 },
    { speciesId: 84, minLevel: 25, maxLevel: 27, weight: 2 },
    { speciesId: 114, minLevel: 26, maxLevel: 28, weight: 1 },
  ],
  npcs: [
    {
      id: 'route4_lass_orla',
      x: 3,
      y: 6,
      facing: 'right',
      name: 'Demoiselle Orla',
      sprite: 'lass',
      dialogue: [
        "Les champs de Windle Hamlet regorgent de petites bestioles curieuses.",
        "Combattons, ca m'entraine !",
      ],
      team: [
        { speciesId: 50, level: 26 },
        { speciesId: 16, level: 27 },
      ],
      postBattleDialogue: ["Tu manies bien ton equipe !"],
      setFlagOnComplete: 'route4_orla_defeated',
    },
    {
      id: 'route4_hiker_gunn',
      x: 10,
      y: 9,
      facing: 'left',
      name: 'Randonneur Gunn',
      sprite: 'hiker',
      dialogue: [
        "Le vent souffle fort par ici, ca annonce l'orage sur Windle Hamlet.",
      ],
      team: [{ speciesId: 10, level: 28 }],
      postBattleDialogue: ["Fais attention aux orages la-bas !"],
      setFlagOnComplete: 'route4_gunn_defeated',
    },
  ],
};
