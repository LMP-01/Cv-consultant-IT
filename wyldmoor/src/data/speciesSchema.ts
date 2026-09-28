import type { ElementType } from './types.ts';

export type BodyShape =
  | 'quadruped' | 'biped' | 'serpentine' | 'avian' | 'blob'
  | 'insectoid' | 'aquatic' | 'floating' | 'small' | 'plant' | 'crystalline';

export type BodyPattern =
  | 'solid' | 'stripes' | 'spots' | 'gradient' | 'scales' | 'shell' | 'crystal' | 'flame' | 'fluffy';

export type HornStyle = 'none' | 'single' | 'double' | 'antler' | 'spike';
export type EyeStyle = 'round' | 'sharp' | 'sleepy' | 'glow' | 'multi';

export interface SpeciesSprite {
  bodyShape: BodyShape;
  /** Hex colors: [primary, secondary, accent]. */
  palette: [string, string, string];
  pattern: BodyPattern;
  eyeStyle: EyeStyle;
  /** Relative uniform scale of the model, 0.6 (tiny) to 1.8 (huge). */
  size: number;
  hasWings?: boolean;
  hasTail?: boolean;
  hornStyle?: HornStyle;
}

export interface LearnsetEntry {
  level: number;
  moveId: string;
}

export interface BaseStats {
  hp: number;
  atk: number;
  def: number;
  spAtk: number;
  spDef: number;
  speed: number;
}

export interface Species {
  id: number;
  name: string;
  types: [ElementType] | [ElementType, ElementType];
  baseStats: BaseStats;
  /** Species id this one evolves from, if any. */
  evolvesFrom?: number;
  /** Species id this one evolves into, if any. */
  evolvesTo?: number;
  evolveLevel?: number;
  learnset: LearnsetEntry[];
  /** 3 (very hard) to 255 (very easy), same scale feel as classic gen1 catch rates. */
  captureRate: number;
  baseXpYield: number;
  height: number;
  weight: number;
  /** Short epithet, e.g. "the Ember Wylde". */
  category: string;
  description: string;
  habitat: string;
  sprite: SpeciesSprite;
}
