import type { StatusAilment } from './moves.ts';

export interface StatusEffectDef {
  id: StatusAilment;
  name: string;
  /** Multiplier applied to outgoing physical damage while afflicted (1 = no change). */
  atkMultiplier?: number;
  /** Multiplier applied to speed while afflicted. */
  speedMultiplier?: number;
  /** Fraction of max HP lost per tick (applied roughly once per second in real-time battle). */
  damagePerTick?: number;
  /** Chance (0-1) the afflicted creature fails to act this tick. */
  failChance?: number;
  /** If true, the creature cannot act at all until the status is cured (e.g. sleep/freeze). */
  fullyDisables?: boolean;
  /** Average duration in seconds before the status has a chance to wear off each tick. */
  tickSeconds: number;
  /** Chance (0-1) per tick that the status is cured naturally. */
  cureChance: number;
}

export const STATUS_EFFECTS: Record<StatusAilment, StatusEffectDef> = {
  burn: { id: 'burn', name: 'Burned', atkMultiplier: 0.5, damagePerTick: 1 / 16, tickSeconds: 1.5, cureChance: 0.08 },
  poison: { id: 'poison', name: 'Poisoned', damagePerTick: 1 / 12, tickSeconds: 1.5, cureChance: 0.06 },
  paralysis: { id: 'paralysis', name: 'Paralyzed', speedMultiplier: 0.5, failChance: 0.25, tickSeconds: 1, cureChance: 0.1 },
  sleep: { id: 'sleep', name: 'Asleep', fullyDisables: true, tickSeconds: 1, cureChance: 0.2 },
  freeze: { id: 'freeze', name: 'Frozen', fullyDisables: true, tickSeconds: 1, cureChance: 0.15 },
  confusion: { id: 'confusion', name: 'Confused', failChance: 0.33, tickSeconds: 1, cureChance: 0.15 },
};
