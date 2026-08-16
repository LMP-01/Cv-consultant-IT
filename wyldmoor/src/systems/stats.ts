import type { BaseStats } from '../data/speciesSchema.ts';

export interface IVs {
  hp: number;
  atk: number;
  def: number;
  spAtk: number;
  spDef: number;
  speed: number;
}

export function randomIVs(): IVs {
  const roll = () => Math.floor(Math.random() * 32);
  return { hp: roll(), atk: roll(), def: roll(), spAtk: roll(), spDef: roll(), speed: roll() };
}

/** Classic-feel stat curve: HP scales additively with level, other stats scale multiplicatively. */
export function computeHp(base: number, iv: number, level: number): number {
  return Math.floor(((2 * base + iv) * level) / 100) + level + 10;
}

export function computeStat(base: number, iv: number, level: number): number {
  return Math.floor(((2 * base + iv) * level) / 100) + 5;
}

export interface ComputedStats {
  hp: number;
  atk: number;
  def: number;
  spAtk: number;
  spDef: number;
  speed: number;
}

export function computeStats(base: BaseStats, ivs: IVs, level: number): ComputedStats {
  return {
    hp: computeHp(base.hp, ivs.hp, level),
    atk: computeStat(base.atk, ivs.atk, level),
    def: computeStat(base.def, ivs.def, level),
    spAtk: computeStat(base.spAtk, ivs.spAtk, level),
    spDef: computeStat(base.spDef, ivs.spDef, level),
    speed: computeStat(base.speed, ivs.speed, level),
  };
}

/** XP required to reach `level` under a medium-fast-style curve. */
export function xpForLevel(level: number): number {
  return Math.floor(Math.pow(level, 3));
}
