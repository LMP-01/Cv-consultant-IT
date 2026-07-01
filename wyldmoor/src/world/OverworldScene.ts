import * as THREE from 'three';
import { MapRuntime, TILE_SIZE } from './MapRuntime.ts';
import { PlayerController, ThirdPersonCamera } from './PlayerController.ts';
import { WyldeActor } from './WyldeActor.ts';
import { NpcActor } from './NpcActor.ts';
import type { InputManager } from '../core/Input.ts';
import type { GameState } from '../systems/GameState.ts';
import type { MapDef, Warp, NpcDef } from '../data/mapSchema.ts';
import { getMapDef } from '../data/world/index.ts';

const INTERACT_RANGE = 2.4;

export interface OverworldCallbacks {
  onStartWildBattle: (actor: WyldeActor) => void;
  onTalkNpc: (npc: NpcDef) => void;
  onEnterMap: (map: MapDef) => void;
}

export class OverworldScene {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private map!: MapRuntime;
  private player!: PlayerController;
  private thirdPerson!: ThirdPersonCamera;
  private wyldes: WyldeActor[] = [];
  private npcs: NpcActor[] = [];
  private state: GameState;
  private callbacks: OverworldCallbacks;
  private ambient: THREE.AmbientLight;
  private sun: THREE.DirectionalLight;
  private respawnTimers: { speciesId: number; minLevel: number; maxLevel: number; x: number; z: number; timer: number }[] = [];
  frozen = false;

  constructor(aspect: number, state: GameState, callbacks: OverworldCallbacks) {
    this.camera = new THREE.PerspectiveCamera(58, aspect, 0.1, 200);
    this.state = state;
    this.callbacks = callbacks;
    this.ambient = new THREE.AmbientLight(0xffffff, 0.7);
    this.sun = new THREE.DirectionalLight(0xffffff, 0.9);
    this.sun.position.set(6, 10, 4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.scene.add(this.ambient, this.sun);
    this.loadMap(state.currentMapId, state.playerX, state.playerY);
  }

  loadMap(mapId: string, spawnX: number, spawnY: number): void {
    if (this.map) this.scene.remove(this.map.group);
    for (const npc of this.npcs) this.scene.remove(npc.object);
    for (const wylde of this.wyldes) this.scene.remove(wylde.object);
    this.npcs = [];
    this.wyldes = [];
    this.respawnTimers = [];

    const def = getMapDef(mapId);
    this.map = new MapRuntime(def);
    this.scene.add(this.map.group);
    this.scene.background = new THREE.Color(def.skyColor);
    this.scene.fog = new THREE.Fog(def.skyColor, 20, 55);
    this.sun.color.set(0xffffff);

    const spawnWorld = this.map.gridToWorld(spawnX, spawnY);
    if (this.player) {
      this.player.setMap(this.map);
      this.player.position.copy(spawnWorld);
    } else {
      this.player = new PlayerController(this.map, spawnWorld);
      this.scene.add(this.player.object);
      this.thirdPerson = new ThirdPersonCamera(this.camera, this.player.object);
    }

    for (const npcDef of def.npcs) {
      if (npcDef.requiresFlag && !this.state.flags.has(npcDef.requiresFlag)) continue;
      const world = this.map.gridToWorld(npcDef.x, npcDef.y);
      world.y = 0;
      const actor = new NpcActor(npcDef, world);
      this.npcs.push(actor);
      this.scene.add(actor.object);
    }

    this.spawnWyldes(def);
    this.state.currentMapId = mapId;
    this.state.playerX = spawnX;
    this.state.playerY = spawnY;
    this.callbacks.onEnterMap(def);
  }

  private spawnWyldes(def: MapDef): void {
    if (def.encounters.length === 0) return;
    const grassCells: { x: number; y: number }[] = [];
    def.tiles.forEach((row, y) => {
      row.split('').forEach((tile, x) => {
        if (tile === '"' || tile === ',') grassCells.push({ x, y });
      });
    });
    if (grassCells.length === 0) return;

    const totalWeight = def.encounters.reduce((sum, e) => sum + e.weight, 0);
    const spawnCount = Math.min(7, Math.max(3, Math.floor(grassCells.length / 12)));
    for (let i = 0; i < spawnCount; i += 1) {
      let roll = Math.random() * totalWeight;
      const entry = def.encounters.find((e) => (roll -= e.weight) <= 0) ?? def.encounters[0];
      const cell = grassCells[Math.floor(Math.random() * grassCells.length)];
      const world = this.map.gridToWorld(cell.x, cell.y);
      const level = entry.minLevel + Math.floor(Math.random() * (entry.maxLevel - entry.minLevel + 1));
      const actor = new WyldeActor(entry.speciesId, level, world.x, world.z);
      this.wyldes.push(actor);
      this.scene.add(actor.object);
    }
  }

  private respawnWyldeAt(x: number, z: number, entry: { speciesId: number; minLevel: number; maxLevel: number }): void {
    const level = entry.minLevel + Math.floor(Math.random() * (entry.maxLevel - entry.minLevel + 1));
    const actor = new WyldeActor(entry.speciesId, level, x, z);
    this.wyldes.push(actor);
    this.scene.add(actor.object);
  }

  removeWylde(actor: WyldeActor): void {
    actor.consumed = true;
    this.scene.remove(actor.object);
    this.wyldes = this.wyldes.filter((w) => w !== actor);
    this.respawnTimers.push({ speciesId: actor.speciesId, minLevel: actor.level, maxLevel: actor.level, x: actor.object.position.x, z: actor.object.position.z, timer: 20 });
  }

  update(dt: number, input: InputManager): void {
    if (this.frozen) return;

    this.player.update(dt, input.moveVector);
    this.thirdPerson.update(dt);
    for (const wylde of this.wyldes) wylde.update(dt);

    this.state.playerX = Math.round(this.player.position.x / TILE_SIZE);
    this.state.playerY = Math.round(this.player.position.z / TILE_SIZE);

    for (let i = this.respawnTimers.length - 1; i >= 0; i -= 1) {
      const r = this.respawnTimers[i];
      r.timer -= dt;
      if (r.timer <= 0) {
        this.respawnWyldeAt(r.x, r.z, r);
        this.respawnTimers.splice(i, 1);
      }
    }

    this.checkWarp();

    if (input.consumeInteract()) this.handleInteract();
  }

  private checkWarp(): void {
    const { gx, gy } = this.map.worldToGrid(this.player.position.x, this.player.position.z);
    const warp = this.map.def.warps.find((w: Warp) => w.x === gx && w.y === gy);
    if (warp) this.loadMap(warp.toMapId, warp.spawnX, warp.spawnY);
  }

  private handleInteract(): void {
    const px = this.player.position.x;
    const pz = this.player.position.z;

    let nearestNpc: NpcActor | undefined;
    let nearestNpcDist = INTERACT_RANGE;
    for (const npc of this.npcs) {
      const d = npc.distanceTo(px, pz);
      if (d < nearestNpcDist) { nearestNpc = npc; nearestNpcDist = d; }
    }
    if (nearestNpc) {
      this.callbacks.onTalkNpc(nearestNpc.def);
      return;
    }

    let nearestWylde: WyldeActor | undefined;
    let nearestWyldeDist = INTERACT_RANGE;
    for (const wylde of this.wyldes) {
      const d = wylde.distanceTo(px, pz);
      if (d < nearestWyldeDist) { nearestWylde = wylde; nearestWyldeDist = d; }
    }
    if (nearestWylde) this.callbacks.onStartWildBattle(nearestWylde);
  }

  get currentMap(): MapDef {
    return this.map.def;
  }

  get playerObject(): THREE.Object3D {
    return this.player.object;
  }
}
