import * as THREE from 'three';
import { buildCreatureModel, type CreatureModelHandle } from '../gfx/CreatureModel.ts';
import { CreatureAnimator } from '../gfx/CreatureAnimator.ts';
import { disposeObject3D } from '../gfx/dispose.ts';
import type { CreatureInstance } from '../systems/CreatureInstance.ts';

interface Combatant {
  handle: CreatureModelHandle;
  animator: CreatureAnimator;
  speciesId: number;
}

export class BattleView {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private playerCombatant?: Combatant;
  private opponentCombatant?: Combatant;
  private opponentReusedObject?: THREE.Object3D;
  private opponentPos = new THREE.Vector3();
  private playerPos = new THREE.Vector3();
  private camCurrent = new THREE.Vector3();
  private hiddenObjects: THREE.Object3D[] = [];
  active = false;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.scene = scene;
    this.camera = camera;
  }

  start(opts: {
    playerCreature: CreatureInstance;
    opponentCreature: CreatureInstance;
    anchorPos: THREE.Vector3;
    reuseOpponentObject?: THREE.Object3D;
    objectsToHide: THREE.Object3D[];
  }): void {
    this.active = true;
    this.hiddenObjects = opts.objectsToHide;
    for (const obj of this.hiddenObjects) obj.visible = false;

    this.playerPos = opts.anchorPos.clone().add(new THREE.Vector3(-1.4, 0, 1.2));
    this.opponentPos = opts.reuseOpponentObject
      ? opts.reuseOpponentObject.position.clone()
      : opts.anchorPos.clone().add(new THREE.Vector3(1.6, 0, -1.6));

    const playerHandle = buildCreatureModel(opts.playerCreature.species);
    playerHandle.object.position.copy(this.playerPos);
    playerHandle.object.rotation.y = Math.PI * 0.25;
    playerHandle.object.scale.setScalar(1.1);
    this.scene.add(playerHandle.object);
    this.playerCombatant = { handle: playerHandle, animator: new CreatureAnimator(playerHandle), speciesId: opts.playerCreature.speciesId };

    if (opts.reuseOpponentObject) {
      this.opponentReusedObject = opts.reuseOpponentObject;
      opts.reuseOpponentObject.visible = true;
      opts.reuseOpponentObject.rotation.y = Math.PI * 1.25;
    } else {
      const oppHandle = buildCreatureModel(opts.opponentCreature.species);
      oppHandle.object.position.copy(this.opponentPos);
      oppHandle.object.rotation.y = Math.PI * 1.25;
      this.scene.add(oppHandle.object);
      this.opponentCombatant = { handle: oppHandle, animator: new CreatureAnimator(oppHandle), speciesId: opts.opponentCreature.speciesId };
    }

    const mid = this.playerPos.clone().add(this.opponentPos).multiplyScalar(0.5);
    const dir = this.opponentPos.clone().sub(this.playerPos);
    dir.y = 0;
    dir.normalize();
    const perp = new THREE.Vector3(-dir.z, 0, dir.x);
    this.camCurrent = mid.clone().add(perp.multiplyScalar(4)).add(new THREE.Vector3(0, 2.4, 0));
  }

  refreshSpecies(side: 'player' | 'opponent', creature: CreatureInstance): void {
    const combatant = side === 'player' ? this.playerCombatant : this.opponentCombatant;
    if (!combatant || combatant.speciesId === creature.speciesId) return;
    const pos = combatant.handle.object.position.clone();
    const rot = combatant.handle.object.rotation.y;
    this.scene.remove(combatant.handle.object);
    disposeObject3D(combatant.handle.object);
    const handle = buildCreatureModel(creature.species);
    handle.object.position.copy(pos);
    handle.object.rotation.y = rot;
    this.scene.add(handle.object);
    const updated: Combatant = { handle, animator: new CreatureAnimator(handle), speciesId: creature.speciesId };
    if (side === 'player') this.playerCombatant = updated;
    else this.opponentCombatant = updated;
  }

  playAttack(side: 'player' | 'opponent'): void {
    (side === 'player' ? this.playerCombatant : this.opponentCombatant)?.animator.setState('attack');
  }

  playHit(side: 'player' | 'opponent'): void {
    (side === 'player' ? this.playerCombatant : this.opponentCombatant)?.animator.setState('hit');
  }

  playFaint(side: 'player' | 'opponent'): void {
    (side === 'player' ? this.playerCombatant : this.opponentCombatant)?.animator.setState('faint');
  }

  update(dt: number): void {
    if (!this.active) return;
    this.playerCombatant?.animator.update(dt);
    this.opponentCombatant?.animator.update(dt);
    const opponentPos = this.opponentReusedObject?.position ?? this.opponentPos;
    const mid = this.playerPos.clone().add(opponentPos).multiplyScalar(0.5);
    const dir = opponentPos.clone().sub(this.playerPos);
    dir.y = 0;
    if (dir.lengthSq() < 0.0001) dir.set(0, 0, 1); else dir.normalize();
    const perp = new THREE.Vector3(-dir.z, 0, dir.x);
    const desiredCamPos = mid.clone().add(perp.multiplyScalar(4)).add(new THREE.Vector3(0, 2.4, 0));
    const lerpFactor = 1 - Math.pow(0.001, dt);
    this.camCurrent.lerp(desiredCamPos, lerpFactor);
    this.camera.position.copy(this.camCurrent);
    const lookAt = mid.clone().add(new THREE.Vector3(0, 0.8, 0));
    this.camera.lookAt(lookAt);
  }

  end(): void {
    this.active = false;
    if (this.playerCombatant) {
      this.scene.remove(this.playerCombatant.handle.object);
      disposeObject3D(this.playerCombatant.handle.object);
    }
    if (this.opponentCombatant) {
      this.scene.remove(this.opponentCombatant.handle.object);
      disposeObject3D(this.opponentCombatant.handle.object);
    }
    this.playerCombatant = undefined;
    this.opponentCombatant = undefined;
    this.opponentReusedObject = undefined;
    for (const obj of this.hiddenObjects) obj.visible = true;
    this.hiddenObjects = [];
  }
}
