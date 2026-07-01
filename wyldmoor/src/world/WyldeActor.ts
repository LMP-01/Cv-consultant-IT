import * as THREE from 'three';
import { buildCreatureModel } from '../gfx/CreatureModel.ts';
import { CreatureAnimator } from '../gfx/CreatureAnimator.ts';
import { disposeObject3D } from '../gfx/dispose.ts';
import { createWildCreature } from '../systems/CreatureInstance.ts';
import { getSpecies } from '../data/species.ts';

const WANDER_RADIUS = 1.8;
const WANDER_SPEED = 0.6;

export class WyldeActor {
  readonly object: THREE.Object3D;
  readonly animator: CreatureAnimator;
  readonly speciesId: number;
  readonly level: number;
  consumed = false;
  private homeX: number;
  private homeZ: number;
  private wanderTarget: THREE.Vector3;
  private wanderPause = 0;

  constructor(speciesId: number, level: number, worldX: number, worldZ: number) {
    this.speciesId = speciesId;
    this.level = level;
    const handle = buildCreatureModel(getSpecies(speciesId).sprite);
    this.object = handle.object;
    this.object.scale.setScalar(0.9);
    this.object.position.set(worldX, 0, worldZ);
    this.animator = new CreatureAnimator(handle);
    this.homeX = worldX;
    this.homeZ = worldZ;
    this.wanderTarget = new THREE.Vector3(worldX, 0, worldZ);
  }

  spawnInstance() {
    return createWildCreature(this.speciesId, this.level);
  }

  update(dt: number): void {
    this.animator.update(dt);
    if (this.wanderPause > 0) {
      this.wanderPause -= dt;
      return;
    }
    const toTarget = this.wanderTarget.clone().sub(this.object.position);
    toTarget.y = 0;
    if (toTarget.length() < 0.15) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * WANDER_RADIUS;
      this.wanderTarget.set(this.homeX + Math.cos(angle) * radius, 0, this.homeZ + Math.sin(angle) * radius);
      this.wanderPause = 1 + Math.random() * 2;
      this.animator.setState('idle');
      return;
    }
    toTarget.normalize();
    this.object.position.x += toTarget.x * WANDER_SPEED * dt;
    this.object.position.z += toTarget.z * WANDER_SPEED * dt;
    this.object.rotation.y = Math.atan2(toTarget.x, toTarget.z);
    this.animator.setState('walk');
  }

  distanceTo(x: number, z: number): number {
    return Math.hypot(this.object.position.x - x, this.object.position.z - z);
  }

  dispose(): void {
    disposeObject3D(this.object);
  }
}
