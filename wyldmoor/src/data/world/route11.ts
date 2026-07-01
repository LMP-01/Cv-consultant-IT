import type { MapDef } from '../mapSchema.ts';

// Route 11: Wyrmspire Heights <-> Wyldmoor Plateau. The final stretch before the League.
export const ROUTE_11: MapDef = {
  id: 'route_11',
  name: 'Route 11',
  width: 15,
  height: 16,
  skyColor: '#6a7a9a',
  groundColor: '#4a5a6a',
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
    { x: 6, y: 1, toMapId: 'wyrmspire_heights', spawnX: 8, spawnY: 13, spawnFacing: 'down' },
    { x: 6, y: 14, toMapId: 'wyldmoor_plateau', spawnX: 8, spawnY: 1, spawnFacing: 'down' },
  ],
  encounters: [
    { speciesId: 45, minLevel: 68, maxLevel: 70, weight: 3 },
    { speciesId: 46, minLevel: 68, maxLevel: 70, weight: 3 },
    { speciesId: 129, minLevel: 68, maxLevel: 70, weight: 2 },
    { speciesId: 150, minLevel: 69, maxLevel: 71, weight: 1 },
    { speciesId: 149, minLevel: 69, maxLevel: 71, weight: 1 },
  ],
  npcs: [
    {
      id: 'route11_ashfall_grunt_5',
      x: 4,
      y: 6,
      facing: 'right',
      name: 'Sbire de la Team Braise-Noire',
      sprite: 'villain',
      dialogue: [
        "Le Directeur a echoue, mais la Team Braise-Noire n'abandonne jamais un dernier coup d'eclat.",
      ],
      team: [
        { speciesId: 71, level: 69 },
        { speciesId: 26, level: 70 },
      ],
      postBattleDialogue: ["On se retirera... pour cette fois."],
      setFlagOnComplete: 'route11_ashfall_grunt5_defeated',
    },
    {
      id: 'route11_ranger_selin',
      x: 10,
      y: 9,
      facing: 'left',
      name: 'Garde-foret Selin',
      sprite: 'ranger',
      dialogue: [
        "Le plateau de Wyldmoor est juste devant. Le Conseil d'Elite et la Championne t'y attendent.",
        "Bonne chance, dresseur. Tout le monde parle de toi.",
      ],
      team: [{ speciesId: 46, level: 70 }],
      postBattleDialogue: ["Tu es pret. Va montrer ta valeur !"],
      setFlagOnComplete: 'route11_selin_defeated',
    },
  ],
};
