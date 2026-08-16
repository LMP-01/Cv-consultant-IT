import * as THREE from 'three';
import { buildHumanoid, animateHumanoidWalk } from '../gfx/HumanoidModel.ts';
import { disposeObject3D } from '../gfx/dispose.ts';
import type { MapRuntime } from './MapRuntime.ts';
import type { MoveVector } from '../core/Input.ts';

const MOVE_SPEED = 3.2;
const PLAYER_RADIUS = 0.35;

export class PlayerController {
  readonly object: THREE.Object3D;
  private model: THREE.Object3D;
  private facingAngle = Math.PI;
  private walking = false;
  private map: MapRuntime;
  private walkTime = 0;

  constructor(map: MapRuntime, spawnWorld: THREE.Vector3, outfit = 'player') {
    this.map = map;
    this.object = new THREE.Object3D();
    this.model = buildHumanoid(outfit);
    this.object.add(this.model);
    this.object.position.copy(spawnWorld);
  }

  /** Remplace le modèle du joueur (changement de tenue au centre commercial). */
  setOutfit(outfit: string): void {
    this.object.remove(this.model);
    disposeObject3D(this.model);
    this.model = buildHumanoid(outfit);
    this.object.add(this.model);
  }

  setMap(map: MapRuntime): void {
    this.map = map;
  }

  get position(): THREE.Vector3 {
    return this.object.position;
  }

  get isWalking(): boolean {
    return this.walking;
  }

  update(dt: number, move: MoveVector): void {
    const len = Math.hypot(move.x, move.z);
    this.walking = len > 0.05;

    if (this.walking) {
      this.facingAngle = Math.atan2(move.x, move.z);
      this.object.rotation.y = this.facingAngle;

      const dx = move.x * MOVE_SPEED * dt;
      const dz = move.z * MOVE_SPEED * dt;
      this.tryMove(dx, dz);

      this.walkTime += dt * 9;
    }
    animateHumanoidWalk(this.model, dt, this.walking);
  }

  private tryMove(dx: number, dz: number): void {
    const targetX = this.object.position.x + dx;
    const targetZ = this.object.position.z + dz;

    if (this.isWalkable(targetX, this.object.position.z)) this.object.position.x = targetX;
    if (this.isWalkable(this.object.position.x, targetZ)) this.object.position.z = targetZ;
  }

  private isWalkable(x: number, z: number): boolean {
    const corners: [number, number][] = [
      [x - PLAYER_RADIUS, z - PLAYER_RADIUS], [x + PLAYER_RADIUS, z - PLAYER_RADIUS],
      [x - PLAYER_RADIUS, z + PLAYER_RADIUS], [x + PLAYER_RADIUS, z + PLAYER_RADIUS],
    ];
    for (const [cx, cz] of corners) {
      const { gx, gy } = this.map.worldToGrid(cx, cz);
      if (!this.map.queryCell(gx, gy).walkable) return false;
    }
    return true;
  }

  facingOffset(distance: number): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.facingAngle) * distance, 0, Math.cos(this.facingAngle) * distance);
  }
}

export class ThirdPersonCamera {
  private camera: THREE.PerspectiveCamera;
  private target: THREE.Object3D;
  private currentPos = new THREE.Vector3();

  constructor(camera: THREE.PerspectiveCamera, target: THREE.Object3D) {
    this.camera = camera;
    this.target = target;
    this.currentPos.copy(target.position).add(new THREE.Vector3(0, 4.2, 6));
  }

  update(dt: number): void {
    const behind = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(0, this.target.rotation.y, 0));
    const desired = this.target.position.clone().add(behind.multiplyScalar(5.5)).add(new THREE.Vector3(0, 3.6, 0));
    const lerpFactor = 1 - Math.pow(0.001, dt);
    this.currentPos.lerp(desired, lerpFactor);
    this.camera.position.copy(this.currentPos);
    const lookAt = this.target.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    this.camera.lookAt(lookAt);
  }
}
