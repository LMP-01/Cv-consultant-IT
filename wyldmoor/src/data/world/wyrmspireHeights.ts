import type { MapDef } from '../mapSchema.ts';

// Home of Elite Council member #2, Kael Draven (Dragon). Also the climactic confrontation
// with Team Ashfall's leader, Director Corvane, who is powering his machine here with
// captured Wyldes' latent energy - and ultimately seeking to capture the legendary Aurelith.
export const WYRMSPIRE_HEIGHTS: MapDef = {
  id: 'wyrmspire_heights',
  name: 'Wyrmspire Heights',
  width: 18,
  height: 16,
  skyColor: '#5a6a90',
  groundColor: '#4a4a5a',
  tiles: [
    '##################',
    '#........D.......#',
    '#........B.......#',
    '#................#',
    '#...B......B.....#',
    '#...D......D.....#',
    '#................#',
    '#....,,,,,,......#',
    '#....,\"\"\"\",......#',
    '#....,,,,,,......#',
    '#................#',
    '#.......B........#',
    '#.......D........#',
    '#................#',
    '#........,.......#',
    '########..########',
  ],
  warps: [
    { x: 9, y: 0, toMapId: 'route_10', spawnX: 6, spawnY: 13, spawnFacing: 'up' },
    { x: 9, y: 14, toMapId: 'route_11', spawnX: 8, spawnY: 1, spawnFacing: 'down' },
  ],
  encounters: [
    { speciesId: 45, minLevel: 65, maxLevel: 68, weight: 4 },
    { speciesId: 46, minLevel: 66, maxLevel: 68, weight: 3 },
    { speciesId: 110, minLevel: 65, maxLevel: 68, weight: 3 },
    { speciesId: 47, minLevel: 67, maxLevel: 69, weight: 1 },
    { speciesId: 129, minLevel: 66, maxLevel: 68, weight: 1 },
  ],
  buildings: [
    { x: 4, y: 4, kind: 'heal' },
  ],
  npcs: [
    {
      id: 'wyrmspire_nurse',
      x: 3,
      y: 5,
      facing: 'down',
      name: 'Infirmière Wyra',
      sprite: 'nurse',
      dialogue: ['Dernier soin avant les spires. Ne montez pas sans être prêts !'],
      service: 'heal',
    },
    {
      id: 'wyrmspire_ashfall_grunt_4',
      x: 4,
      y: 3,
      facing: 'down',
      name: 'Sbire de la Team Braise-Noire',
      sprite: 'villain',
      dialogue: [
        "Le Directeur Corvane est au sommet, pres de la machine. N'avance pas plus loin !",
      ],
      team: [
        { speciesId: 26, level: 67 },
        { speciesId: 120, level: 68 },
      ],
      postBattleDialogue: ["Tu... tu passes. Le Directeur t'attend, alors."],
      setFlagOnComplete: 'wyrmspire_ashfall_grunt4_defeated',
    },
    {
      id: 'wyrmspire_villain_leader_corvane',
      x: 8,
      y: 12,
      facing: 'up',
      name: 'Directeur Corvane',
      sprite: 'villain',
      dialogue: [
        "Ainsi voila le dresseur dont mes hommes n'arretent pas de se plaindre.",
        "Regarde cette machine : elle carbure a l'energie latente des Wyldes. Bientot, Wyrmspire ne sera qu'un rouage parmi d'autres.",
        "Et au sommet du plateau de Wyldmoor dort Aurelith, la source d'energie ultime. Une fois capturee, plus rien ne nous arretera.",
        "Tu comptes m'en empecher ? Tres bien. Voyons ce que valent tes convictions face a ma puissance.",
      ],
      team: [
        { speciesId: 106, level: 67 },
        { speciesId: 120, level: 68 },
        { speciesId: 71, level: 69 },
        { speciesId: 26, level: 70 },
      ],
      postBattleDialogue: [
        "Impossible... ma machine, mes plans, tout s'effondre face a toi.",
        "Tu n'as pas fini d'entendre parler de la Team Braise-Noire. Mais pour l'instant... retire-toi de ma vue.",
      ],
      setFlagOnComplete: 'ashfall_corvane_defeated',
    },
    {
      id: 'wyrmspire_elite_kael',
      x: 11,
      y: 3,
      facing: 'down',
      name: 'Kael Draven',
      sprite: 'gymLeader',
      dialogue: [
        "Le Conseil d'Elite t'a laisse passer jusqu'ici. Je suis Kael, gardien des cimes et des dragons.",
        "Soeur Maren m'a prevenu de ta force. Montre-la moi.",
      ],
      team: [
        { speciesId: 45, level: 64 },
        { speciesId: 46, level: 66 },
        { speciesId: 110, level: 67 },
        { speciesId: 47, level: 69 },
      ],
      postBattleDialogue: [
        "Tu voles aussi haut que mes propres Wyldes. Rare est le dresseur qui y parvient.",
        "Le plateau de Wyldmoor t'attend, avec le reste du Conseil et la Championne. Bonne route.",
      ],
      setFlagOnComplete: 'elite2_kael_defeated',
      requiresFlag: 'elite1_maren_defeated',
    },
  ],
};
