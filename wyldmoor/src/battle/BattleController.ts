import * as THREE from 'three';
import { BattleSystem, type BattleEvent, type BattleOptions } from '../systems/BattleSystem.ts';
import type { CreatureInstance } from '../systems/CreatureInstance.ts';
import { HUD } from '../ui/HUD.ts';
import { BattleView } from './BattleView.ts';
import type { GameState } from '../systems/GameState.ts';
import { getItem } from '../data/items.ts';

export interface BattleResult {
  outcome: 'victory' | 'defeat' | 'captured' | 'fled';
}

export interface StartBattleOptions {
  playerTeam: CreatureInstance[];
  opponentTeam: CreatureInstance[];
  battleOptions: BattleOptions;
  anchorPos: THREE.Vector3;
  reuseOpponentObject?: THREE.Object3D;
  objectsToHide: THREE.Object3D[];
  state: GameState;
  onEnd: (result: BattleResult) => void;
}

export class BattleController {
  private hud: HUD;
  private view: BattleView;
  private system?: BattleSystem;
  private opts?: StartBattleOptions;
  private switchDelay = 0;
  active = false;

  constructor(hud: HUD, view: BattleView) {
    this.hud = hud;
    this.view = view;
  }

  start(opts: StartBattleOptions): void {
    this.opts = opts;
    this.system = new BattleSystem(opts.playerTeam, opts.opponentTeam, opts.battleOptions);
    this.active = true;

    for (const speciesId of opts.opponentTeam.map((c) => c.speciesId)) opts.state.markSeen(speciesId);

    this.view.start({
      playerCreature: this.system.playerActive,
      opponentCreature: this.system.opponentActive,
      anchorPos: opts.anchorPos,
      reuseOpponentObject: opts.reuseOpponentObject,
      objectsToHide: opts.objectsToHide,
    });

    this.hud.showBattleHud();
    this.hud.clearLog();
    this.hud.setCaptureEnabled(opts.battleOptions.kind === 'wild');
    this.hud.setFleeEnabled(opts.battleOptions.kind === 'wild');
    this.hud.pushLog(
      opts.battleOptions.kind === 'wild'
        ? `Un ${this.system.opponentActive.nickname} sauvage apparaît !`
        : `${opts.battleOptions.trainerName ?? 'Un dresseur'} vous défie !`,
    );
    this.hud.updatePartyHp(opts.playerTeam);
    this.hud.updateOpponentInfo(this.system.opponentActive);
    this.refreshMoveWheel();

    this.hud.bindFlee(() => {
      if (!this.system) return;
      this.system.attemptFlee();
    });
    this.hud.bindCapture(() => {
      const bagCount = opts.state.bag.snare_orb ?? 0;
      if (bagCount <= 0) {
        this.hud.pushLog('Vous n’avez plus d’Orbe de Capture !');
        return;
      }
      opts.state.useItem('snare_orb', 1);
      this.system?.attemptCapture();
    });
  }

  private refreshMoveWheel(): void {
    if (!this.system) return;
    this.hud.renderMoveWheel(this.system.playerActive.moves, (moveId) => {
      if (!this.system?.canUseMove('player', moveId)) return;
      this.view.playAttack('player');
      this.system.useMove('player', moveId);
    });
  }

  update(dt: number): void {
    if (!this.active || !this.system || !this.opts) return;
    this.view.update(dt);

    if (this.system.needsPlayerSwitch) {
      this.switchDelay -= dt;
      if (this.switchDelay <= 0) {
        const idx = this.opts.playerTeam.findIndex((c) => !c.isFainted);
        if (idx >= 0) this.system.switchPlayerActive(idx);
        this.switchDelay = 1;
      }
    }

    this.system.tick(dt);
    this.consumeEvents();

    if (this.system.finished) {
      this.finish();
    } else {
      this.hud.updatePartyHp(this.opts.playerTeam);
      this.hud.updateOpponentInfo(this.system.opponentActive);
      this.refreshMoveWheel();
    }
  }

  private pendingOutcome: BattleResult['outcome'] = 'victory';

  private consumeEvents(): void {
    if (!this.system || !this.opts) return;
    const events = this.system.drainEvents();
    for (const event of events) this.applyEvent(event);
  }

  private applyEvent(event: BattleEvent): void {
    if (!this.system) return;
    switch (event.type) {
      case 'log':
        this.hud.pushLog(event.text);
        break;
      case 'damage':
        this.view.playHit(event.side);
        break;
      case 'faint':
        this.view.playFaint(event.side);
        break;
      case 'evolve':
        this.view.refreshSpecies('player', this.system.playerActive);
        break;
      case 'opponent-switch':
        this.view.refreshSpecies('opponent', this.system.opponentActive);
        break;
      case 'victory':
        this.pendingOutcome = 'victory';
        break;
      case 'defeat':
        this.pendingOutcome = 'defeat';
        break;
      case 'fled':
        this.pendingOutcome = 'fled';
        break;
      case 'capture-success':
        this.pendingOutcome = 'captured';
        break;
      default:
        break;
    }
  }

  private finish(): void {
    if (!this.system || !this.opts) return;
    const outcome = this.pendingOutcome;

    if (outcome === 'captured') {
      const wild = this.system.opponentActive;
      this.opts.state.markCaught(wild.speciesId);
      this.opts.state.addToParty(wild);
    }

    this.hud.hideBattleHud();
    this.view.end();
    this.active = false;
    const onEnd = this.opts.onEnd;
    const result: BattleResult = { outcome };
    this.system = undefined;
    this.opts = undefined;
    this.pendingOutcome = 'victory';
    onEnd(result);
  }
}

export function grantHealingItemEffect(itemId: string, target: CreatureInstance): boolean {
  const item = getItem(itemId);
  if (item.revives) {
    if (!target.isFainted) return false;
    target.currentHp = Math.floor(target.stats.hp * (item.healFraction ?? 0.5));
    return true;
  }
  if (target.isFainted) return false;
  if (item.curesStatus) target.status = undefined;
  if (item.healFraction) target.heal(target.stats.hp * item.healFraction);
  else if (item.healAmount) target.heal(item.healAmount);
  return true;
}
