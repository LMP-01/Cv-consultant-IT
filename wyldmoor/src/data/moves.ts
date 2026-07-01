import type { ElementType } from './types.ts';

export type MoveCategory = 'physical' | 'special' | 'status';

export type StatusAilment = 'burn' | 'poison' | 'paralysis' | 'sleep' | 'freeze' | 'confusion';

export type StatKey = 'atk' | 'def' | 'spAtk' | 'spDef' | 'speed';

export interface Move {
  id: string;
  name: string;
  type: ElementType;
  category: MoveCategory;
  /** Real-time cooldown in seconds before the move can be used again. */
  cooldown: number;
  power: number;
  accuracy: number;
  /** Chance (0-1) to inflict `ailment` on hit. */
  ailment?: StatusAilment;
  ailmentChance?: number;
  /** Stat stages changed on the user (+) or target (-) when used, e.g. { atk: 1 }. */
  statChange?: Partial<Record<StatKey, number>>;
  statChangeTarget?: 'self' | 'target';
  priority?: number;
  flinchChance?: number;
  drainPercent?: number;
  description: string;
}

export const MOVES: Record<string, Move> = {
  scuffle: { id: 'scuffle', name: 'Scuffle', type: 'normal', category: 'physical', cooldown: 1.2, power: 40, accuracy: 100, description: 'A basic body-check that connects almost every time.' },
  tackle_charge: { id: 'tackle_charge', name: 'Charge Ram', type: 'normal', category: 'physical', cooldown: 2.2, power: 70, accuracy: 95, description: 'A full-speed charge that hits hard but leaves an opening.' },
  roar_pulse: { id: 'roar_pulse', name: 'Roar Pulse', type: 'normal', category: 'special', cooldown: 2.5, power: 60, accuracy: 100, flinchChance: 0.2, description: 'A deafening cry that can make the target flinch.' },
  quick_snap: { id: 'quick_snap', name: 'Quick Snap', type: 'normal', category: 'physical', cooldown: 1, power: 35, accuracy: 100, priority: 1, description: 'A snappy strike thrown before the foe can react.' },
  focus_up: { id: 'focus_up', name: 'Focus Up', type: 'normal', category: 'status', cooldown: 4, power: 0, accuracy: 100, statChange: { atk: 1 }, statChangeTarget: 'self', description: 'The user steadies its breathing, raising Attack.' },
  guard_stance: { id: 'guard_stance', name: 'Guard Stance', type: 'normal', category: 'status', cooldown: 4, power: 0, accuracy: 100, statChange: { def: 1 }, statChangeTarget: 'self', description: 'A defensive stance that raises Defense.' },
  hyper_burst: { id: 'hyper_burst', name: 'Hyper Burst', type: 'normal', category: 'physical', cooldown: 3.5, power: 110, accuracy: 85, description: 'An all-out burst of raw power.' },

  ember_flick: { id: 'ember_flick', name: 'Ember Flick', type: 'fire', category: 'special', cooldown: 1.4, power: 40, accuracy: 100, ailment: 'burn', ailmentChance: 0.1, description: 'A flick of flame that may leave a burn.' },
  cinder_jab: { id: 'cinder_jab', name: 'Cinder Jab', type: 'fire', category: 'physical', cooldown: 1.8, power: 55, accuracy: 100, ailment: 'burn', ailmentChance: 0.1, description: 'A hot-fisted jab that can singe on contact.' },
  blaze_wave: { id: 'blaze_wave', name: 'Blaze Wave', type: 'fire', category: 'special', cooldown: 3, power: 90, accuracy: 100, ailment: 'burn', ailmentChance: 0.1, description: 'A rolling wave of fire that washes over the target.' },
  infernal_roar: { id: 'infernal_roar', name: 'Infernal Roar', type: 'fire', category: 'special', cooldown: 4.5, power: 130, accuracy: 85, ailment: 'burn', ailmentChance: 0.3, description: 'A column of white-hot flame, devastating but slow to recharge.' },
  smolder_coat: { id: 'smolder_coat', name: 'Smolder Coat', type: 'fire', category: 'status', cooldown: 5, power: 0, accuracy: 100, statChange: { spAtk: 1 }, statChangeTarget: 'self', description: 'The user wreathes itself in embers, raising Sp. Atk.' },

  aqua_jet_spray: { id: 'aqua_jet_spray', name: 'Spray Jet', type: 'water', category: 'special', cooldown: 1.4, power: 40, accuracy: 100, description: 'A quick, focused jet of water.' },
  tide_slam: { id: 'tide_slam', name: 'Tide Slam', type: 'water', category: 'physical', cooldown: 2.2, power: 70, accuracy: 95, description: 'The user body-slams the foe with the force of a breaking wave.' },
  torrent_surge: { id: 'torrent_surge', name: 'Torrent Surge', type: 'water', category: 'special', cooldown: 3, power: 90, accuracy: 100, description: 'A surge of pressurized water.' },
  maelstrom: { id: 'maelstrom', name: 'Maelstrom', type: 'water', category: 'special', cooldown: 4.5, power: 130, accuracy: 85, description: 'A crushing whirlpool that drags the foe under.' },
  shell_guard: { id: 'shell_guard', name: 'Shell Guard', type: 'water', category: 'status', cooldown: 4, power: 0, accuracy: 100, statChange: { def: 1 }, statChangeTarget: 'self', description: 'The user hardens its shell or hide, raising Defense.' },
  mist_veil: { id: 'mist_veil', name: 'Mist Veil', type: 'water', category: 'status', cooldown: 5, power: 0, accuracy: 100, statChange: { spDef: 1 }, statChangeTarget: 'self', description: 'A cool mist settles over the user, raising Sp. Def.' },

  spark_nip: { id: 'spark_nip', name: 'Spark Nip', type: 'electric', category: 'special', cooldown: 1.4, power: 40, accuracy: 100, ailment: 'paralysis', ailmentChance: 0.1, description: 'A small jolt that can numb muscles.' },
  volt_tackle_lite: { id: 'volt_tackle_lite', name: 'Volt Charge', type: 'electric', category: 'physical', cooldown: 2.2, power: 70, accuracy: 100, ailment: 'paralysis', ailmentChance: 0.15, description: 'The user electrifies its body before ramming the foe.' },
  thunder_crack: { id: 'thunder_crack', name: 'Thunder Crack', type: 'electric', category: 'special', cooldown: 3, power: 95, accuracy: 90, ailment: 'paralysis', ailmentChance: 0.1, description: 'A crackling bolt of electricity.' },
  storm_call: { id: 'storm_call', name: 'Storm Call', type: 'electric', category: 'special', cooldown: 4.5, power: 130, accuracy: 80, ailment: 'paralysis', ailmentChance: 0.3, description: 'The user calls down a violent bolt from the sky.' },
  static_field: { id: 'static_field', name: 'Static Field', type: 'electric', category: 'status', cooldown: 4, power: 0, accuracy: 100, statChange: { speed: 1 }, statChangeTarget: 'self', description: 'Crackling static lightens the user, raising Speed.' },

  vine_snap: { id: 'vine_snap', name: 'Vine Snap', type: 'grass', category: 'physical', cooldown: 1.4, power: 40, accuracy: 100, description: 'A whip-crack of vines.' },
  bramble_toss: { id: 'bramble_toss', name: 'Bramble Toss', type: 'grass', category: 'physical', cooldown: 2.2, power: 65, accuracy: 100, description: 'The user hurls a tangle of thorny brambles.' },
  bloom_burst: { id: 'bloom_burst', name: 'Bloom Burst', type: 'grass', category: 'special', cooldown: 3, power: 90, accuracy: 100, description: 'Petals burst outward with sharp force.' },
  verdant_wrath: { id: 'verdant_wrath', name: 'Verdant Wrath', type: 'grass', category: 'special', cooldown: 4.5, power: 130, accuracy: 85, description: 'The full fury of the wilds condensed into one strike.' },
  sap_drain: { id: 'sap_drain', name: 'Sap Drain', type: 'grass', category: 'special', cooldown: 3.5, power: 55, accuracy: 100, drainPercent: 0.5, description: 'Drains sap from the target to heal the user.' },
  root_hold: { id: 'root_hold', name: 'Root Hold', type: 'grass', category: 'status', cooldown: 4, power: 0, accuracy: 100, statChange: { def: 1 }, statChangeTarget: 'self', description: 'Roots dig in, raising Defense.' },

  frost_nip: { id: 'frost_nip', name: 'Frost Nip', type: 'ice', category: 'special', cooldown: 1.6, power: 45, accuracy: 100, ailment: 'freeze', ailmentChance: 0.08, description: 'A biting chill that can freeze on contact.' },
  glacier_crush: { id: 'glacier_crush', name: 'Glacier Crush', type: 'ice', category: 'physical', cooldown: 2.6, power: 80, accuracy: 90, description: 'The user slams down with the weight of a glacier.' },
  blizzard_veil: { id: 'blizzard_veil', name: 'Blizzard Veil', type: 'ice', category: 'special', cooldown: 4, power: 120, accuracy: 80, ailment: 'freeze', ailmentChance: 0.15, description: 'A raging blizzard that can freeze solid.' },
  chill_guard: { id: 'chill_guard', name: 'Chill Guard', type: 'ice', category: 'status', cooldown: 4, power: 0, accuracy: 100, statChange: { spDef: 1 }, statChangeTarget: 'self', description: 'A layer of frost hardens around the user, raising Sp. Def.' },

  brawl_jab: { id: 'brawl_jab', name: 'Brawl Jab', type: 'fighting', category: 'physical', cooldown: 1.2, power: 45, accuracy: 100, description: 'A quick, precise jab.' },
  power_kick: { id: 'power_kick', name: 'Power Kick', type: 'fighting', category: 'physical', cooldown: 2.4, power: 85, accuracy: 90, description: 'A heavy kick thrown with the whole body.' },
  iron_fist_combo: { id: 'iron_fist_combo', name: 'Iron Fist Combo', type: 'fighting', category: 'physical', cooldown: 3.6, power: 120, accuracy: 85, description: 'A relentless flurry of blows.' },
  war_cry: { id: 'war_cry', name: 'War Cry', type: 'fighting', category: 'status', cooldown: 4, power: 0, accuracy: 100, statChange: { atk: 1 }, statChangeTarget: 'self', description: 'A rallying cry that raises Attack.' },

  toxin_spit: { id: 'toxin_spit', name: 'Toxin Spit', type: 'poison', category: 'special', cooldown: 1.6, power: 40, accuracy: 100, ailment: 'poison', ailmentChance: 0.3, description: 'Corrosive spit that often poisons.' },
  venom_fang: { id: 'venom_fang', name: 'Venom Fang', type: 'poison', category: 'physical', cooldown: 2.2, power: 65, accuracy: 100, ailment: 'poison', ailmentChance: 0.25, description: 'A venomous bite.' },
  sludge_wave: { id: 'sludge_wave', name: 'Sludge Wave', type: 'poison', category: 'special', cooldown: 3.4, power: 95, accuracy: 90, ailment: 'poison', ailmentChance: 0.2, description: 'A wave of caustic sludge.' },
  corrosive_mist: { id: 'corrosive_mist', name: 'Corrosive Mist', type: 'poison', category: 'status', cooldown: 4, power: 0, accuracy: 90, ailment: 'poison', ailmentChance: 1, statChangeTarget: 'target', description: 'A choking mist that poisons the target.' },

  dust_slam: { id: 'dust_slam', name: 'Dust Slam', type: 'ground', category: 'physical', cooldown: 1.6, power: 50, accuracy: 100, description: 'The user kicks up dust and slams into the foe.' },
  fissure_stomp: { id: 'fissure_stomp', name: 'Fissure Stomp', type: 'ground', category: 'physical', cooldown: 2.8, power: 90, accuracy: 90, description: 'A heavy stomp that cracks the earth.' },
  quake_wave: { id: 'quake_wave', name: 'Quake Wave', type: 'ground', category: 'physical', cooldown: 4.2, power: 130, accuracy: 85, description: 'A rolling tremor that shakes everything nearby.' },

  wing_slap: { id: 'wing_slap', name: 'Wing Slap', type: 'flying', category: 'physical', cooldown: 1.4, power: 45, accuracy: 100, description: 'A sharp slap of the wing.' },
  gale_dive: { id: 'gale_dive', name: 'Gale Dive', type: 'flying', category: 'physical', cooldown: 2.6, power: 85, accuracy: 90, description: 'A diving strike carried by the wind.' },
  cyclone_burst: { id: 'cyclone_burst', name: 'Cyclone Burst', type: 'flying', category: 'special', cooldown: 4, power: 120, accuracy: 85, description: 'A violent burst of swirling wind.' },

  mind_prod: { id: 'mind_prod', name: 'Mind Prod', type: 'psychic', category: 'special', cooldown: 1.6, power: 40, accuracy: 100, ailment: 'confusion', ailmentChance: 0.15, description: 'A prod of psychic force that can confuse.' },
  focus_lance: { id: 'focus_lance', name: 'Focus Lance', type: 'psychic', category: 'special', cooldown: 2.8, power: 80, accuracy: 100, description: 'A concentrated lance of psychic energy.' },
  psywave_break: { id: 'psywave_break', name: 'Psywave Break', type: 'psychic', category: 'special', cooldown: 4.2, power: 125, accuracy: 85, ailment: 'confusion', ailmentChance: 0.2, description: 'An overwhelming psychic shockwave.' },
  clear_mind: { id: 'clear_mind', name: 'Clear Mind', type: 'psychic', category: 'status', cooldown: 4, power: 0, accuracy: 100, statChange: { spAtk: 1 }, statChangeTarget: 'self', description: 'The user focuses inward, raising Sp. Atk.' },

  pincer_snip: { id: 'pincer_snip', name: 'Pincer Snip', type: 'bug', category: 'physical', cooldown: 1.4, power: 40, accuracy: 100, description: 'A quick snip with pincers or mandibles.' },
  swarm_sting: { id: 'swarm_sting', name: 'Swarm Sting', type: 'bug', category: 'physical', cooldown: 2.2, power: 65, accuracy: 100, ailment: 'poison', ailmentChance: 0.2, description: 'A flurry of stings that can poison.' },
  silk_bind: { id: 'silk_bind', name: 'Silk Bind', type: 'bug', category: 'status', cooldown: 3.5, power: 0, accuracy: 90, statChange: { speed: -1 }, statChangeTarget: 'target', description: 'Sticky silk binds the target, lowering its Speed.' },

  rubble_toss: { id: 'rubble_toss', name: 'Rubble Toss', type: 'rock', category: 'physical', cooldown: 1.8, power: 55, accuracy: 95, description: 'A handful of rubble thrown with force.' },
  boulder_drop: { id: 'boulder_drop', name: 'Boulder Drop', type: 'rock', category: 'physical', cooldown: 3, power: 100, accuracy: 85, description: 'A massive boulder crashes down on the foe.' },

  spectral_touch: { id: 'spectral_touch', name: 'Spectral Touch', type: 'ghost', category: 'special', cooldown: 1.8, power: 50, accuracy: 100, drainPercent: 0.3, description: 'An eerie touch that saps a little life away.' },
  haunting_wail: { id: 'haunting_wail', name: 'Haunting Wail', type: 'ghost', category: 'special', cooldown: 3.2, power: 95, accuracy: 90, flinchChance: 0.15, description: 'A chilling wail that can make the target flinch.' },

  dragon_snap: { id: 'dragon_snap', name: 'Dragon Snap', type: 'dragon', category: 'physical', cooldown: 2.4, power: 80, accuracy: 100, description: 'A sharp snapping bite infused with draconic force.' },
  dragon_roar: { id: 'dragon_roar', name: "Dragon's Roar", type: 'dragon', category: 'special', cooldown: 4.5, power: 135, accuracy: 85, description: 'An ancient, earth-shaking roar.' },

  snare_toss: { id: 'snare_toss', name: 'Snare Orb Toss', type: 'normal', category: 'status', cooldown: 0, power: 0, accuracy: 100, description: 'Throw a Snare Orb to attempt a capture.' },
};

export function getMove(id: string): Move {
  const move = MOVES[id];
  if (!move) throw new Error(`Unknown move id: ${id}`);
  return move;
}
