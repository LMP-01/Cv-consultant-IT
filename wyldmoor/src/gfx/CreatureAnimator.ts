import type { CreatureModelHandle } from './CreatureModel.ts';

export type CreatureAnimState = 'idle' | 'walk' | 'attack' | 'hit' | 'faint';

export class CreatureAnimator {
  private handle: CreatureModelHandle;
  private time = 0;
  private state: CreatureAnimState = 'idle';
  private stateTime = 0;
  private baseY: number;

  constructor(handle: CreatureModelHandle) {
    this.handle = handle;
    this.baseY = handle.object.position.y;
  }

  setState(state: CreatureAnimState): void {
    this.state = state;
    this.stateTime = 0;
  }

  update(dt: number): void {
    this.time += dt;
    this.stateTime += dt;
    const obj = this.handle.object;

    const bobSpeed = this.handle.floats ? 1.6 : 2.4;
    const bobAmount = this.handle.floats ? 0.06 : 0.03;
    const idleBob = Math.sin(this.time * bobSpeed) * bobAmount;

    switch (this.state) {
      case 'walk':
        obj.position.y = this.baseY + Math.abs(Math.sin(this.time * 8)) * 0.05;
        obj.rotation.z = Math.sin(this.time * 8) * 0.05;
        break;
      case 'attack': {
        const t = Math.min(1, this.stateTime / 0.3);
        obj.position.z = Math.sin(t * Math.PI) * 0.3;
        if (t >= 1) this.setState('idle');
        break;
      }
      case 'hit': {
        const t = Math.min(1, this.stateTime / 0.25);
        obj.position.x = Math.sin(t * Math.PI * 4) * 0.06 * (1 - t);
        if (t >= 1) this.setState('idle');
        break;
      }
      case 'faint': {
        const t = Math.min(1, this.stateTime / 0.6);
        obj.rotation.x = t * Math.PI * 0.5;
        obj.position.y = this.baseY * (1 - t);
        break;
      }
      case 'idle':
      default:
        obj.position.y = this.baseY + idleBob;
        obj.rotation.z = 0;
        break;
    }
  }
}
