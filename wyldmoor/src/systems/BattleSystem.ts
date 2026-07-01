import { getMove, type Move, type StatKey } from '../data/moves.ts';
import { typeEffectiveness } from '../data/types.ts';
import { STATUS_EFFECTS } from '../data/statusEffects.ts';
import { CreatureInstance } from './CreatureInstance.ts';
import { xpForLevel } from './stats.ts';

export type BattleSide = 'player' | 'opponent';

export type BattleEvent =
  | { type: 'log'; text: string }
  | { type: 'damage'; side: BattleSide; amount: number }
  | { type: 'miss'; side: BattleSide }
  | { type: 'faint'; side: BattleSide }
  | { type: 'status-applied'; side: BattleSide; status: string }
  | { type: 'status-cured'; side: BattleSide }
  | { type: 'capture-success' }
  | { type: 'capture-fail'; shakes: number }
  | { type: 'xp-gain'; amount: number }
  | { type: 'level-up'; newLevel: number }
  | { type: 'evolve'; speciesName: string }
  | { type: 'victory' }
  | { type: 'defeat' }
  | { type: 'fled' }
  | { type: 'opponent-switch'; index: number };

export type BattleKind = 'wild' | 'trainer';

export interface BattleOptions {
  kind: BattleKind;
  trainerName?: string;
}

const CAPTURE_ATTEMPT_COOLDOWN = 2.5;

export class BattleSystem {
  readonly kind: BattleKind;
  readonly trainerName?: string;
  playerTeam: CreatureInstance[];
  opponentTeam: CreatureInstance[];
  playerActiveIndex = 0;
  opponentActiveIndex = 0;
  events: BattleEvent[] = [];
  finished = false;
  captureCooldown = 0;
  private aiTimer = 0;
  private awaitingPlayerSwitch = false;

  constructor(playerTeam: CreatureInstance[], opponentTeam: CreatureInstance[], options: BattleOptions) {
    this.playerTeam = playerTeam;
    this.opponentTeam = opponentTeam;
    this.kind = options.kind;
    this.trainerName = options.trainerName;
    this.aiTimer = 1.5 + Math.random();
  }

  get playerActive(): CreatureInstance {
    return this.playerTeam[this.playerActiveIndex];
  }

  get opponentActive(): CreatureInstance {
    return this.opponentTeam[this.opponentActiveIndex];
  }

  get needsPlayerSwitch(): boolean {
    return this.awaitingPlayerSwitch;
  }

  drainEvents(): BattleEvent[] {
    const drained = this.events;
    this.events = [];
    return drained;
  }

  tick(dt: number): void {
    if (this.finished || this.awaitingPlayerSwitch) return;

    for (const side of ['player', 'opponent'] as const) {
      const creature = side === 'player' ? this.playerActive : this.opponentActive;
      for (const slot of creature.moves) {
        if (slot.cooldownRemaining > 0) slot.cooldownRemaining = Math.max(0, slot.cooldownRemaining - dt);
      }
      this.tickStatus(creature, side);
      if (this.finished) return;
    }

    if (this.captureCooldown > 0) this.captureCooldown = Math.max(0, this.captureCooldown - dt);

    if (this.kind === 'trainer') {
      this.aiTimer -= dt;
      if (this.aiTimer <= 0) {
        this.aiTimer = 1.8 + Math.random() * 1.6;
        this.opponentAct();
      }
    }
  }

  private tickStatus(creature: CreatureInstance, side: BattleSide): void {
    if (!creature.status) return;
    const def = STATUS_EFFECTS[creature.status];
    if (def.damagePerTick) {
      const dmg = Math.max(1, Math.floor(creature.stats.hp * def.damagePerTick));
      creature.applyDamage(dmg);
      this.events.push({ type: 'damage', side, amount: dmg });
      this.events.push({ type: 'log', text: `${creature.nickname} est affecté par ${def.name.toLowerCase()}.` });
      this.checkFaint(creature, side);
    }
    if (Math.random() < def.cureChance) {
      creature.status = undefined;
      this.events.push({ type: 'status-cured', side });
      this.events.push({ type: 'log', text: `${creature.nickname} n'est plus ${def.name.toLowerCase()}.` });
    }
  }

  canUseMove(side: BattleSide, moveId: string): boolean {
    const creature = side === 'player' ? this.playerActive : this.opponentActive;
    const slot = creature.moves.find((m) => m.moveId === moveId);
    return !!slot && slot.cooldownRemaining <= 0 && !creature.isFainted;
  }

  useMove(side: BattleSide, moveId: string): void {
    if (this.finished || this.awaitingPlayerSwitch) return;
    const attacker = side === 'player' ? this.playerActive : this.opponentActive;
    const defenderSide: BattleSide = side === 'player' ? 'opponent' : 'player';
    const defender = side === 'player' ? this.opponentActive : this.playerActive;
    const slot = attacker.moves.find((m) => m.moveId === moveId);
    if (!slot || slot.cooldownRemaining > 0 || attacker.isFainted) return;

    const move = getMove(moveId);
    slot.cooldownRemaining = move.cooldown;

    if (attacker.status && STATUS_EFFECTS[attacker.status].fullyDisables) {
      this.events.push({ type: 'log', text: `${attacker.nickname} est ${STATUS_EFFECTS[attacker.status].name.toLowerCase()} et ne peut pas agir !` });
      return;
    }
    if (attacker.status && STATUS_EFFECTS[attacker.status].failChance && Math.random() < STATUS_EFFECTS[attacker.status].failChance!) {
      this.events.push({ type: 'log', text: `${attacker.nickname} ne peut pas attaquer !` });
      return;
    }

    this.events.push({ type: 'log', text: `${attacker.nickname} utilise ${move.name} !` });

    const accuracyRoll = Math.random() * 100;
    if (accuracyRoll > move.accuracy) {
      this.events.push({ type: 'miss', side });
      this.events.push({ type: 'log', text: 'Mais l’attaque échoue !' });
      return;
    }

    if (move.power > 0) {
      const { damage, effectiveness, critical } = this.computeDamage(attacker, defender, move);
      defender.applyDamage(damage);
      this.events.push({ type: 'damage', side: defenderSide, amount: damage });
      if (move.drainPercent) {
        attacker.heal(damage * move.drainPercent);
      }
      if (critical) this.events.push({ type: 'log', text: 'Coup critique !' });
      if (effectiveness > 1) this.events.push({ type: 'log', text: 'C’est super efficace !' });
      else if (effectiveness > 0 && effectiveness < 1) this.events.push({ type: 'log', text: 'Ce n’est pas très efficace...' });
      else if (effectiveness === 0) this.events.push({ type: 'log', text: 'Ça n’affecte pas la cible...' });
    }

    if (move.ailment && !defender.status && Math.random() < (move.ailmentChance ?? 1)) {
      const effectiveness = typeEffectiveness(move.type, defender.species.types);
      if (effectiveness > 0) {
        defender.status = move.ailment;
        this.events.push({ type: 'status-applied', side: defenderSide, status: move.ailment });
        this.events.push({ type: 'log', text: `${defender.nickname} est maintenant ${STATUS_EFFECTS[move.ailment].name.toLowerCase()} !` });
      }
    }

    if (move.statChange) {
      const target = move.statChangeTarget === 'target' ? defender : attacker;
      for (const [key, delta] of Object.entries(move.statChange) as [StatKey, number][]) {
        target.statStages[key] = Math.max(-6, Math.min(6, target.statStages[key] + delta));
        const verb = delta > 0 ? 'augmente' : 'diminue';
        this.events.push({ type: 'log', text: `${target.nickname} voit sa statistique ${key} ${verb} !` });
      }
    }

    if (move.flinchChance && Math.random() < move.flinchChance) {
      const flinchSlot = defender.moves[0];
      if (flinchSlot) flinchSlot.cooldownRemaining = Math.max(flinchSlot.cooldownRemaining, 0.6);
    }

    this.checkFaint(defender, defenderSide);
  }

  private computeDamage(attacker: CreatureInstance, defender: CreatureInstance, move: Move) {
    const isPhysical = move.category === 'physical';
    const atkStat = attacker.effectiveStat(isPhysical ? 'atk' : 'spAtk');
    const defStat = defender.effectiveStat(isPhysical ? 'def' : 'spDef');
    const stab = attacker.species.types.includes(move.type) ? 1.5 : 1;
    const effectiveness = typeEffectiveness(move.type, defender.species.types);
    const critical = Math.random() < 0.0625;
    const randomFactor = 0.85 + Math.random() * 0.15;
    const base = ((2 * attacker.level) / 5 + 2) * move.power * (atkStat / Math.max(1, defStat)) / 50 + 2;
    const damage = Math.max(
      effectiveness === 0 ? 0 : 1,
      Math.floor(base * stab * effectiveness * randomFactor * (critical ? 1.5 : 1)),
    );
    return { damage, effectiveness, critical };
  }

  private checkFaint(creature: CreatureInstance, side: BattleSide): void {
    if (!creature.isFainted) return;
    this.events.push({ type: 'faint', side });
    this.events.push({ type: 'log', text: `${creature.nickname} est hors de combat !` });

    if (side === 'opponent') {
      const xp = this.rewardXp(creature);
      this.awardXpToPlayer(xp);
      const nextIndex = this.opponentTeam.findIndex((c) => !c.isFainted);
      if (nextIndex === -1) {
        this.finished = true;
        this.events.push({ type: 'victory' });
      } else {
        this.opponentActiveIndex = nextIndex;
        this.events.push({ type: 'opponent-switch', index: nextIndex });
        this.events.push({ type: 'log', text: `${this.trainerName ?? 'L’adversaire'} envoie ${this.opponentActive.nickname} !` });
      }
    } else {
      const nextIndex = this.playerTeam.findIndex((c) => !c.isFainted);
      if (nextIndex === -1) {
        this.finished = true;
        this.events.push({ type: 'defeat' });
      } else {
        this.awaitingPlayerSwitch = true;
      }
    }
  }

  private rewardXp(fainted: CreatureInstance): number {
    const levelFactor = fainted.level;
    return Math.max(1, Math.floor((fainted.species.baseXpYield * levelFactor) / 7));
  }

  private awardXpToPlayer(amount: number): void {
    const receiver = this.playerActive;
    if (receiver.isFainted) return;
    this.events.push({ type: 'xp-gain', amount });
    const result = receiver.gainXp(amount);
    if (result.leveledUp) {
      this.events.push({ type: 'level-up', newLevel: result.newLevel });
      this.events.push({ type: 'log', text: `${receiver.nickname} monte au niveau ${result.newLevel} !` });
      if (result.evolved) {
        const newName = receiver.nickname;
        receiver.evolve();
        this.events.push({ type: 'evolve', speciesName: receiver.species.name });
        this.events.push({ type: 'log', text: `${newName} évolue en ${receiver.species.name} !` });
      }
    }
  }

  switchPlayerActive(index: number): void {
    if (index < 0 || index >= this.playerTeam.length || this.playerTeam[index].isFainted) return;
    this.playerActiveIndex = index;
    this.awaitingPlayerSwitch = false;
    this.events.push({ type: 'log', text: `Allez, ${this.playerActive.nickname} !` });
  }

  private opponentAct(): void {
    const creature = this.opponentActive;
    const available = creature.moves.filter((m) => m.cooldownRemaining <= 0);
    if (available.length === 0) return;
    const choice = available[Math.floor(Math.random() * available.length)];
    this.useMove('opponent', choice.moveId);
  }

  attemptCapture(): void {
    if (this.kind !== 'wild' || this.captureCooldown > 0 || this.finished) return;
    this.captureCooldown = CAPTURE_ATTEMPT_COOLDOWN;
    const target = this.opponentActive;
    const rate = target.species.captureRate;
    const statusBonus = target.status === 'sleep' || target.status === 'freeze' ? 2.5 : target.status ? 1.5 : 1;
    const hpFactor = (3 * target.stats.hp - 2 * target.currentHp) / (3 * target.stats.hp);
    const catchValue = ((rate * hpFactor * statusBonus) / 255) * 3;
    let shakes = 0;
    for (let i = 0; i < 3; i += 1) {
      if (Math.random() < Math.min(1, catchValue)) shakes += 1;
      else break;
    }
    this.events.push({ type: 'log', text: 'Vous lancez un Orbe de Capture !' });
    if (shakes >= 3) {
      this.finished = true;
      this.events.push({ type: 'capture-success' });
      this.events.push({ type: 'log', text: `${target.nickname} a été capturé !` });
    } else {
      this.events.push({ type: 'capture-fail', shakes });
      this.events.push({ type: 'log', text: `${target.nickname} s’est libéré !` });
    }
  }

  attemptFlee(): boolean {
    if (this.kind !== 'wild') return false;
    const playerSpeed = this.playerActive.effectiveStat('speed');
    const oppSpeed = this.opponentActive.effectiveStat('speed');
    const chance = Math.min(0.95, 0.5 + (playerSpeed - oppSpeed) / (oppSpeed * 4 + 1));
    if (Math.random() < chance) {
      this.finished = true;
      this.events.push({ type: 'fled' });
      this.events.push({ type: 'log', text: 'Vous prenez la fuite !' });
      return true;
    }
    this.events.push({ type: 'log', text: 'Impossible de fuir !' });
    return false;
  }
}

export function isTeamWiped(team: CreatureInstance[]): boolean {
  return team.every((c) => c.isFainted);
}

export function xpToNextLevel(instance: CreatureInstance): number {
  return xpForLevel(instance.level + 1) - instance.xp;
}
