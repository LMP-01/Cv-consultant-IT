import type { Species } from '../data/speciesSchema.ts';
import type { StatusAilment } from '../data/moves.ts';
import { getSpecies } from '../data/species.ts';
import { computeStats, randomIVs, xpForLevel, type ComputedStats, type IVs } from './stats.ts';
import type { StatKey } from '../data/moves.ts';

export interface MoveSlot {
  moveId: string;
  cooldownRemaining: number;
}

export interface StatStages {
  atk: number;
  def: number;
  spAtk: number;
  spDef: number;
  speed: number;
}

function freshStages(): StatStages {
  return { atk: 0, def: 0, spAtk: 0, spDef: 0, speed: 0 };
}

function stageMultiplier(stage: number): number {
  const clamped = Math.max(-6, Math.min(6, stage));
  return clamped >= 0 ? (2 + clamped) / 2 : 2 / (2 - clamped);
}

let nextInstanceId = 1;

export class CreatureInstance {
  readonly instanceId: number;
  speciesId: number;
  nickname: string;
  level: number;
  xp: number;
  ivs: IVs;
  currentHp: number;
  moves: MoveSlot[];
  status?: StatusAilment;
  statStages: StatStages = freshStages();
  isWild: boolean;

  constructor(speciesId: number, level: number, opts: { isWild?: boolean; ivs?: IVs } = {}) {
    this.instanceId = nextInstanceId++;
    this.speciesId = speciesId;
    this.nickname = getSpecies(speciesId).name;
    this.level = level;
    this.xp = xpForLevel(level);
    this.ivs = opts.ivs ?? randomIVs();
    this.isWild = opts.isWild ?? false;
    this.moves = this.learnedMovesAtLevel().map((moveId) => ({ moveId, cooldownRemaining: 0 }));
    this.currentHp = this.stats.hp;
  }

  get species(): Species {
    return getSpecies(this.speciesId);
  }

  get stats(): ComputedStats {
    return computeStats(this.species.baseStats, this.ivs, this.level);
  }

  effectiveStat(key: StatKey): number {
    const base = this.stats[key];
    const mult = stageMultiplier(this.statStages[key]);
    const statusMult =
      (key === 'atk' && this.status === 'burn' ? 0.5 : 1) *
      (key === 'speed' && this.status === 'paralysis' ? 0.5 : 1);
    return Math.max(1, Math.floor(base * mult * statusMult));
  }

  get isFainted(): boolean {
    return this.currentHp <= 0;
  }

  get hpFraction(): number {
    return Math.max(0, this.currentHp / this.stats.hp);
  }

  private learnedMovesAtLevel(): string[] {
    const learnset = this.species.learnset
      .filter((entry) => entry.level <= this.level)
      .sort((a, b) => b.level - a.level);
    const uniqueIds: string[] = [];
    for (const entry of learnset) {
      if (!uniqueIds.includes(entry.moveId)) uniqueIds.push(entry.moveId);
      if (uniqueIds.length >= 4) break;
    }
    if (uniqueIds.length === 0) uniqueIds.push('scuffle');
    return uniqueIds;
  }

  applyDamage(amount: number): void {
    this.currentHp = Math.max(0, this.currentHp - Math.floor(amount));
  }

  heal(amount: number): void {
    this.currentHp = Math.min(this.stats.hp, this.currentHp + Math.floor(amount));
  }

  fullHeal(): void {
    this.currentHp = this.stats.hp;
    this.status = undefined;
    this.statStages = freshStages();
    for (const slot of this.moves) slot.cooldownRemaining = 0;
  }

  gainXp(amount: number): { leveledUp: boolean; evolved: boolean; newLevel: number } {
    this.xp += amount;
    let leveledUp = false;
    let evolved = false;
    while (this.level < 100 && this.xp >= xpForLevel(this.level + 1)) {
      const hpBefore = this.stats.hp;
      this.level += 1;
      leveledUp = true;
      this.currentHp += this.stats.hp - hpBefore;
      const learned = this.species.learnset.filter((e) => e.level === this.level).map((e) => e.moveId);
      for (const moveId of learned) {
        if (!this.moves.some((m) => m.moveId === moveId)) {
          if (this.moves.length < 4) this.moves.push({ moveId, cooldownRemaining: 0 });
          else this.moves[this.moves.length - 1] = { moveId, cooldownRemaining: 0 };
        }
      }
      if (this.species.evolvesTo && this.species.evolveLevel && this.level >= this.species.evolveLevel) {
        evolved = true;
      }
    }
    this.currentHp = Math.min(this.currentHp, this.stats.hp);
    return { leveledUp, evolved, newLevel: this.level };
  }

  evolve(): void {
    const target = this.species.evolvesTo;
    if (!target) return;
    const wasCustomNickname = this.nickname !== this.species.name;
    this.speciesId = target;
    if (!wasCustomNickname) this.nickname = getSpecies(target).name;
    this.currentHp = this.stats.hp;
  }
}

export function createWildCreature(speciesId: number, level: number): CreatureInstance {
  return new CreatureInstance(speciesId, level, { isWild: true });
}
