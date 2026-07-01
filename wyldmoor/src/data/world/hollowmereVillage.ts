import type { MapDef } from '../mapSchema.ts';

// Gym 8: Corwin Ashe, Ghost specialist, awards the Wraith Badge - the final badge of the journey.
export const HOLLOWMERE_VILLAGE: MapDef = {
  id: 'hollowmere_village',
  name: 'Hollowmere Village',
  width: 18,
  height: 14,
  skyColor: '#8a8496',
  groundColor: '#6a6478',
  tiles: [
    '##################',
    '#........D.......#',
    '#........B.......#',
    '#................#',
    '#..B..,,,,,...B..#',
    '#..D..,,,,,...D..#',
    '#.....,,,,,......#',
    '#................#',
    '#....B......G....#',
    '#....D......G....#',
    '#................#',
    '#................#',
    '#........,.......#',
    '########..########',
  ],
  warps: [
    { x: 9, y: 0, toMapId: 'route_8', spawnX: 6, spawnY: 13, spawnFacing: 'up' },
    { x: 9, y: 12, toMapId: 'route_9', spawnX: 8, spawnY: 1, spawnFacing: 'down' },
  ],
  encounters: [
    { speciesId: 42, minLevel: 55, maxLevel: 58, weight: 4 },
    { speciesId: 43, minLevel: 56, maxLevel: 58, weight: 3 },
    { speciesId: 109, minLevel: 55, maxLevel: 58, weight: 3 },
    { speciesId: 125, minLevel: 56, maxLevel: 59, weight: 2 },
    { speciesId: 136, minLevel: 57, maxLevel: 59, weight: 1 },
  ],
  npcs: [
    {
      id: 'hollowmere_elder',
      x: 4,
      y: 3,
      facing: 'down',
      name: 'Ancien Merrow',
      sprite: 'elder',
      dialogue: [
        "Hollowmere s'endort dans la brume depuis toujours. Nos morts et nos Wyldes se cotoient en paix.",
        "Corwin protege ce dernier gymnase avec un calme troublant.",
      ],
    },
    {
      id: 'hollowmere_scientist',
      x: 13,
      y: 3,
      facing: 'down',
      name: 'Chercheuse Vela',
      sprite: 'scientist',
      dialogue: [
        "Le vieux cimetiere regorge de Wisplume. Ils s'illuminent au crepuscule.",
      ],
      team: [{ speciesId: 42, level: 58 }],
      postBattleDialogue: ["Merci pour ce combat lumineux."],
      setFlagOnComplete: 'hollowmere_vela_defeated',
    },
    {
      id: 'hollowmere_gym_leader_corwin',
      x: 12,
      y: 9,
      facing: 'down',
      name: 'Corwin Ashe',
      sprite: 'gymLeader',
      dialogue: [
        "Bienvenue dans la brume, dresseur. Je suis Corwin, et mes Wyldes glissent entre les mondes.",
        "Le huitieme badge se merite dans le silence et l'ombre. Es-tu pret ?",
      ],
      team: [
        { speciesId: 109, level: 58 },
        { speciesId: 42, level: 59 },
        { speciesId: 43, level: 61 },
      ],
      postBattleDialogue: [
        "Meme les esprits s'inclinent devant une telle force. Bravo, dresseur.",
        "Voici le Badge Spectral. Tu as desormais les huit badges de Wyldmoor.",
      ],
      setFlagOnComplete: 'gym8_corwin_defeated',
    },
  ],
  gym: {
    leaderName: 'Corwin Ashe',
    leaderNpcId: 'hollowmere_gym_leader_corwin',
    badgeName: 'Badge Spectral',
    team: [
      { speciesId: 109, level: 58 },
      { speciesId: 42, level: 59 },
      { speciesId: 43, level: 61 },
    ],
    flagOnDefeat: 'gym8_corwin_defeated',
  },
};
