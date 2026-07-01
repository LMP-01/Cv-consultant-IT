import type { MapDef } from '../mapSchema.ts';

// Starting town. Home of Professor Ilma Rowe and the player's own house.
// Player spawns at (8, 8) per GameState defaults - keep that tile walkable.
export const BIRCHWOOD_HOLLOW: MapDef = {
  id: 'birchwood_hollow',
  name: 'Birchwood Hollow',
  width: 16,
  height: 14,
  skyColor: '#bcd9e8',
  groundColor: '#4f9a4a',
  tiles: [
    '################',
    '#..............#',
    '#..B........B..#',
    '#..D........D..#',
    '#..............#',
    '#....,,,,,,....#',
    '#....,\"\"\"\",....#',
    '#....,,,,,,....#',
    '#..............#',
    '#......D.......#',
    '#......B.......#',
    '#..............#',
    '#.......,......#',
    '########..######',
  ],
  warps: [
    { x: 8, y: 13, toMapId: 'route_1', spawnX: 8, spawnY: 1, spawnFacing: 'down' },
  ],
  encounters: [],
  npcs: [
    {
      id: 'birchwood_professor_ilma',
      x: 12,
      y: 2,
      facing: 'down',
      name: 'Professeure Ilma Rowe',
      sprite: 'professor',
      dialogue: [
        "Ah, te voila ! J'espere que ton compagnon et toi vous entendez deja bien.",
        "Le monde de Wyldmoor est vaste. Chaque route, chaque foret cache un Wylde qui n'attend que toi.",
        "Prends soin de lui, et il te le rendra au centuple. Bonne route, dresseur !",
      ],
    },
    {
      id: 'birchwood_elder',
      x: 3,
      y: 5,
      facing: 'down',
      name: 'Ancien Faelan',
      sprite: 'elder',
      dialogue: [
        "Birchwood Hollow est un village paisible, mais le monde au-dela de ses arbres ne l'est pas toujours.",
        "La route vers Mossreed Village part droit vers le sud. Sois prudent dans les hautes herbes.",
      ],
    },
    {
      id: 'birchwood_rival_intro',
      x: 8,
      y: 12,
      facing: 'up',
      name: 'Bryn',
      sprite: 'rival',
      dialogue: [
        "Hé, toi ! On part tous les deux a l'aventure aujourd'hui, alors autant se mesurer une premiere fois, non ?",
        "Ne t'inquiete pas, je vais y aller doucement... ou pas !",
      ],
      team: [{ speciesId: 1, level: 5 }],
      postBattleDialogue: [
        "Pas mal du tout ! Mais je ne compte pas rester derriere toi bien longtemps.",
        "On se retrouve plus loin sur la route. A la prochaine !",
      ],
      setFlagOnComplete: 'bryn_defeated_1',
    },
  ],
};
