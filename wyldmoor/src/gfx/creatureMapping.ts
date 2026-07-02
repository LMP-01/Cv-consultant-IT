/**
 * Maps every Wylde species onto one of the 39 CC0 Quaternius "Ultimate Monsters"
 * GLB models (see ASSETS.md). Each family of species shares a silhouette lineage;
 * the per-species look comes from re-tinting the model's Main/Secondary/accent
 * materials with the species' palette (src/data/species.ts) and from re-scaling
 * to the species' sprite size. Gameplay data is untouched.
 */

export type MonsterModel =
  | 'Alien' | 'Alpaking' | 'Alpaking_Evolved' | 'Armabee' | 'Armabee_Evolved'
  | 'Birb' | 'Blue_Demon' | 'Bunny' | 'Cactoro' | 'Cat' | 'Chicken' | 'Demon'
  | 'Dino' | 'Dragon' | 'Dragon_Evolved' | 'Fish' | 'Frog' | 'Ghost'
  | 'Ghost_Skull' | 'Glub' | 'Glub_Evolved' | 'Goleling' | 'Goleling_Evolved'
  | 'Green_Blob' | 'Green_Spiky_Blob' | 'Hywirl' | 'Monkroose' | 'Mushnub'
  | 'Mushnub_Evolved' | 'Mushroom_King' | 'Ninja' | 'Orc' | 'Orc_Enemy'
  | 'Pigeon' | 'Pink_Slime' | 'Squidle' | 'Tribal' | 'Wizard' | 'Yeti';

const M: Record<number, MonsterModel> = {
  // Starters grass: Leaflit line — sprout to grove king.
  1: 'Mushnub', 2: 'Cactoro', 3: 'Mushroom_King',
  // Starters fire: Emberkit line.
  4: 'Cat', 5: 'Dino', 6: 'Dino',
  // Starters water: Droplin line.
  7: 'Glub', 8: 'Fish', 9: 'Squidle',
  // Electric rodents & wisp.
  10: 'Bunny', 11: 'Bunny', 12: 'Hywirl',
  // Early birds.
  13: 'Pigeon', 14: 'Birb', 15: 'Birb',
  // Normal critters.
  16: 'Cat', 17: 'Monkroose', 18: 'Pink_Slime',
  // Bugs.
  19: 'Green_Spiky_Blob', 20: 'Mushnub', 21: 'Armabee',
  22: 'Green_Spiky_Blob', 23: 'Armabee_Evolved',
  // Ground / rock lines.
  24: 'Cat', 25: 'Monkroose', 26: 'Dino',
  27: 'Goleling', 28: 'Goleling_Evolved',
  // Fighting line.
  29: 'Orc_Enemy', 30: 'Orc', 31: 'Yeti',
  // Ice line.
  32: 'Cat', 33: 'Yeti', 34: 'Yeti', 35: 'Glub',
  // Poison blobs.
  36: 'Green_Blob', 37: 'Green_Spiky_Blob',
  // Psychic line.
  38: 'Wizard', 39: 'Ghost', 40: 'Wizard', 41: 'Alien',
  // Ghosts.
  42: 'Ghost', 43: 'Ghost_Skull', 44: 'Ghost',
  // Dragons of Wyrmspire.
  45: 'Dragon', 46: 'Dragon', 47: 'Dragon_Evolved',
  // Fossils.
  48: 'Goleling', 49: 'Goleling_Evolved',
  // Flower & bramble lines.
  50: 'Mushnub', 51: 'Cactoro', 52: 'Mushnub', 53: 'Cactoro',
  // Fire kindlers.
  54: 'Chicken', 55: 'Blue_Demon', 56: 'Goleling',
  // Fish.
  57: 'Fish', 58: 'Fish', 59: 'Frog',
  // Electric fauna.
  60: 'Chicken', 61: 'Pigeon', 62: 'Birb',
  // Mantis line & shell bug.
  63: 'Green_Spiky_Blob', 64: 'Ninja', 65: 'Armabee',
  // Raptors.
  66: 'Pigeon', 67: 'Birb', 68: 'Birb',
  // Gentle psychic deer.
  69: 'Alpaking',
  // Poison wyverns.
  70: 'Armabee', 71: 'Dragon',
  // Scrubland brute.
  72: 'Monkroose',
  // Rock birds.
  73: 'Pigeon', 74: 'Birb',
  // Crypt dragon.
  75: 'Demon',
  // Ice bird.
  76: 'Alpaking',
  // Meadow hares.
  77: 'Bunny', 78: 'Bunny',
  // Pond line.
  79: 'Glub', 80: 'Glub_Evolved',
  // One-offs.
  81: 'Mushnub', 82: 'Orc', 83: 'Pink_Slime',
  84: 'Cat', 85: 'Monkroose', 86: 'Yeti',
  87: 'Orc_Enemy', 88: 'Blue_Demon', 89: 'Alpaking_Evolved',
  // River dragons.
  90: 'Dragon', 91: 'Dragon', 92: 'Dragon_Evolved',
  93: 'Ghost', 94: 'Goleling',
  // Glow bugs.
  95: 'Armabee', 96: 'Armabee_Evolved',
  97: 'Ghost_Skull', 98: 'Squidle',
  // Wind seeds.
  99: 'Mushnub', 100: 'Hywirl',
  101: 'Bunny',
  // Ice golems.
  102: 'Goleling', 103: 'Goleling_Evolved',
  104: 'Tribal', 105: 'Pigeon', 106: 'Frog',
  107: 'Wizard', 108: 'Wizard', 109: 'Ghost',
  110: 'Dragon', 111: 'Dino', 112: 'Orc_Enemy', 113: 'Goleling',
  114: 'Cat', 115: 'Monkroose', 116: 'Fish',
  // Root golems.
  117: 'Cactoro', 118: 'Mushroom_King',
  119: 'Armabee', 120: 'Green_Spiky_Blob', 121: 'Chicken',
  122: 'Cat', 123: 'Pink_Slime', 124: 'Mushnub', 125: 'Ghost',
  126: 'Orc_Enemy', 127: 'Bunny', 128: 'Cat', 129: 'Dragon',
  130: 'Ghost', 131: 'Yeti', 132: 'Armabee', 133: 'Cat',
  134: 'Dino', 135: 'Dragon', 136: 'Ghost', 137: 'Armabee',
  138: 'Glub', 139: 'Mushroom_King', 140: 'Cat', 141: 'Cactoro',
  142: 'Goleling', 143: 'Bunny', 144: 'Birb', 145: 'Armabee',
  146: 'Goleling_Evolved', 147: 'Armabee', 148: 'Dino',
  149: 'Dragon', 150: 'Dragon_Evolved',
  // The legendary of the Plateau.
  151: 'Dragon_Evolved',
};

export function monsterModelForSpecies(speciesId: number): MonsterModel {
  return M[speciesId] ?? 'Green_Blob';
}
