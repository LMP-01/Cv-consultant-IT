import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { advanceWind } from '../gfx/Wind.ts';
import { MapRuntime, TILE_SIZE } from './MapRuntime.ts';
import { getAssetLibrary } from '../gfx/AssetLibrary.ts';
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
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private sunDirection = new THREE.Vector3(0.5, 0.8, 0.3);
  private sky: Sky;
  private respawnTimers: { speciesId: number; minLevel: number; maxLevel: number; x: number; z: number; timer: number }[] = [];
  frozen = false;

  constructor(_renderer: THREE.WebGLRenderer, aspect: number, state: GameState, callbacks: OverworldCallbacks) {
    this.camera = new THREE.PerspectiveCamera(58, aspect, 0.1, 3000);
    this.state = state;
    this.callbacks = callbacks;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x4f9a4a, 0.6);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1536, 1536);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 60;
    this.sun.shadow.camera.left = -30;
    this.sun.shadow.camera.right = 30;
    this.sun.shadow.camera.top = 30;
    this.sun.shadow.camera.bottom = -30;
    this.sun.shadow.bias = -0.002;
    this.scene.add(this.hemi, this.sun, this.sun.target);

    this.sky = new Sky();
    this.sky.scale.setScalar(2000);
    this.scene.add(this.sky);

    this.loadMap(state.currentMapId, state.playerX, state.playerY);
  }

  loadMap(mapId: string, spawnX: number, spawnY: number): void {
    if (this.map) {
      this.scene.remove(this.map.group);
      this.map.dispose();
    }
    for (const npc of this.npcs) { this.scene.remove(npc.object); npc.dispose(); }
    for (const wylde of this.wyldes) { this.scene.remove(wylde.object); wylde.dispose(); }
    this.npcs = [];
    this.wyldes = [];
    this.respawnTimers = [];

    const def = getMapDef(mapId);
    this.map = new MapRuntime(def);
    this.scene.add(this.map.group);
    this.scene.fog = new THREE.Fog(def.skyColor, 24, 70);
    this.applySkyMood(def.skyColor, def.groundColor);

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

  /** Derives a Preetham sky (sun elevation/haze) and matching light colors from a map's mood colors,
   *  so each region reads with its own atmosphere instead of a flat background fill. */
  private applySkyMood(skyColorHex: string, groundColorHex: string): void {
    const skyColor = new THREE.Color(skyColorHex);
    const hsl = { h: 0, s: 0, l: 0 };
    skyColor.getHSL(hsl);

    let elevationDeg: number;
    let turbidity: number;
    if (hsl.l > 0.75) { elevationDeg = 52; turbidity = 3.5; }
    else if (hsl.l > 0.55) { elevationDeg = 42; turbidity = 6; }
    else if (hsl.l > 0.35) { elevationDeg = 16; turbidity = 9; }
    else { elevationDeg = 4; turbidity = 11; }

    const azimuthDeg = hsl.h * 360;
    const phi = THREE.MathUtils.degToRad(90 - elevationDeg);
    const theta = THREE.MathUtils.degToRad(azimuthDeg);
    this.sunDirection.setFromSphericalCoords(1, phi, theta);

    const uniforms = this.sky.material.uniforms;
    uniforms.turbidity.value = turbidity;
    uniforms.rayleigh.value = hsl.l < 0.35 ? 3.5 : 2;
    uniforms.mieCoefficient.value = 0.006;
    uniforms.mieDirectionalG.value = 0.8;
    uniforms.sunPosition.value.copy(this.sunDirection);

    this.sun.intensity = 0.4 + (elevationDeg / 52) * 1.1;
    this.sun.color.copy(skyColor).lerp(new THREE.Color(0xffffff), 0.6);

    this.hemi.color.copy(skyColor);
    this.hemi.groundColor.set(groundColorHex);
    this.hemi.intensity = 0.22 + hsl.l * 0.22;

    this.refreshEnvironment();
  }

  /**
   * Image-based lighting from the Poly Haven sky HDRI (see ASSETS.md): every
   * PBR material picks up sky ambient light and reflections. The per-map mood
   * still comes from the Preetham sky dome, fog and the tinted lights above.
   */
  private refreshEnvironment(): void {
    this.scene.environment = getAssetLibrary().envMap;
    this.scene.environmentIntensity = 0.45;
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
    actor.dispose();
    this.wyldes = this.wyldes.filter((w) => w !== actor);
    this.respawnTimers.push({ speciesId: actor.speciesId, minLevel: actor.level, maxLevel: actor.level, x: actor.object.position.x, z: actor.object.position.z, timer: 20 });
  }

  update(dt: number, input: InputManager): void {
    if (this.frozen) return;

    this.player.update(dt, input.moveVector);
    this.thirdPerson.update(dt);
    this.map.update(dt);
    advanceWind(dt);
    for (const wylde of this.wyldes) wylde.update(dt);
    for (const npc of this.npcs) npc.update(dt);

    // Keep the shadow-casting sun centered on the player so its (deliberately tight,
    // high-resolution) shadow frustum stays useful regardless of map size/offset.
    this.sun.target.position.copy(this.player.position);
    this.sun.position.copy(this.player.position).addScaledVector(this.sunDirection, 40);

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
