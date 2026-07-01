import * as THREE from 'three';
import { buildHumanoid } from '../gfx/HumanoidModel.ts';
import { disposeObject3D } from '../gfx/dispose.ts';
import type { NpcDef, Facing } from '../data/mapSchema.ts';

const FACING_ANGLE: Record<Facing, number> = { up: Math.PI, down: 0, left: Math.PI * 1.5, right: Math.PI * 0.5 };

export class NpcActor {
  readonly object: THREE.Object3D;
  readonly def: NpcDef;

  constructor(def: NpcDef, worldPos: THREE.Vector3) {
    this.def = def;
    this.object = buildHumanoid(def.sprite);
    this.object.position.copy(worldPos);
    this.object.rotation.y = FACING_ANGLE[def.facing];
  }

  distanceTo(x: number, z: number): number {
    return Math.hypot(this.object.position.x - x, this.object.position.z - z);
  }

  dispose(): void {
    disposeObject3D(this.object);
  }
}
