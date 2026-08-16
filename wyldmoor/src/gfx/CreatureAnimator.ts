import * as THREE from 'three';
import type { CreatureModelHandle, CreatureAnimState } from './CreatureModel.ts';

export type { CreatureAnimState };

const FADE = 0.18;

/**
 * Drives a creature's GLTF animations: crossfades idle/walk, plays one-shots
 * (attack/hit) that return to the previous locomotion state, and clamps faint.
 * Falls back to a gentle bob while the GLB is still loading.
 */
export class CreatureAnimator {
  private handle: CreatureModelHandle;
  private time = 0;
  private state: CreatureAnimState = 'idle';
  private locomotion: CreatureAnimState = 'idle';
  private current?: THREE.AnimationAction;
  private baseY: number;
  private finishedListener?: (e: { action: THREE.AnimationAction }) => void;

  constructor(handle: CreatureModelHandle) {
    this.handle = handle;
    this.baseY = handle.object.position.y;
  }

  setState(state: CreatureAnimState): void {
    if (state === this.state && (state === 'idle' || state === 'walk')) return;
    this.state = state;
    if (state === 'idle' || state === 'walk') this.locomotion = state;

    const actions = this.handle.actions;
    if (!actions) return;
    const next = actions[state];
    if (!next || next === this.current) return;

    next.reset();
    if (this.current && this.current !== next) {
      next.crossFadeFrom(this.current, FADE, false);
    }
    next.play();
    this.current = next;

    // One-shots come back to the locomotion loop; faint stays down.
    if ((state === 'attack' || state === 'hit') && this.handle.mixer) {
      if (this.finishedListener) this.handle.mixer.removeEventListener('finished', this.finishedListener);
      this.finishedListener = (e) => {
        if (e.action === next) this.setState(this.locomotion);
      };
      this.handle.mixer.addEventListener('finished', this.finishedListener);
    }
  }

  update(dt: number): void {
    this.time += dt;

    if (this.handle.mixer && this.handle.actions) {
      // First update after the GLB arrived: make sure some action is running.
      if (!this.current) {
        const start = this.handle.actions[this.state] ?? this.handle.actions.idle;
        if (start) {
          start.reset().play();
          this.current = start;
        }
      }
      this.handle.mixer.update(dt);
      return;
    }

    // GLB not loaded yet — gentle procedural bob so the spot isn't lifeless.
    const bobSpeed = this.handle.floats ? 1.6 : 2.4;
    const bobAmount = this.handle.floats ? 0.06 : 0.03;
    this.handle.object.position.y = this.baseY + Math.sin(this.time * bobSpeed) * bobAmount;
  }
}
