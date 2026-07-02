import * as THREE from 'three';
import type { MapDef, TileCode } from '../data/mapSchema.ts';
import { barkTexture, waterTexture } from '../gfx/TextureFactory.ts';
import {
  getAssetLibrary, biomeForMap, variantHeight,
  type Biome, type MeshAsset, type PropVariant, type VillageModel,
} from '../gfx/AssetLibrary.ts';
import { applyWindSway } from '../gfx/Wind.ts';

export const TILE_SIZE = 2;

const WALKABLE: Record<TileCode, boolean> = {
  '.': true, ',': true, '"': true, '~': false, '#': false, '^': false,
  B: false, D: true, F: false, S: true, b: true, G: true, ' ': false,
};

const ENCOUNTER_TILE: Partial<Record<TileCode, number>> = { ',': 0.06, '"': 0.14 };

/** Building variety per map cell, chosen deterministically (see buildBuildings). */
const HOUSE_MODELS: VillageModel[] = [
  'Fantasy_House', 'Fantasy_House', 'Fantasy_House', 'Fantasy_Inn',
  'Blacksmith', 'Fantasy_Stable', 'Fantasy_Sawmill', 'Market_Stand',
];

export interface CellQuery {
  walkable: boolean;
  encounterChance: number;
  tile: TileCode;
}

interface Cell { x: number; y: number }
interface Placement { x: number; y: number; z: number; rotY: number; scale: number }

/** Deterministic per-cell pseudo-random in [0,1) so layouts are stable across visits. */
function cellRandom(x: number, y: number, salt: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

export class MapRuntime {
  readonly def: MapDef;
  readonly group = new THREE.Object3D();
  private grid: TileCode[][];
  private biome: Biome;
  private waterMaterial?: THREE.MeshStandardMaterial;
  private elapsed = 0;
  /** Resources owned by this map (shared AssetLibrary resources are never registered here). */
  private owned: { dispose(): void }[] = [];
  private instancedMeshes: THREE.InstancedMesh[] = [];

  constructor(def: MapDef) {
    this.def = def;
    this.grid = def.tiles.map((row) => row.split('') as TileCode[]);
    this.biome = biomeForMap(def.id);
    this.buildGround();
    this.buildWater();
    this.buildVegetation();
    this.buildRocks();
    this.buildBuildings();
    this.buildGymGates();
    this.buildFences();
  }

  worldToGrid(x: number, z: number): { gx: number; gy: number } {
    return { gx: Math.round(x / TILE_SIZE), gy: Math.round(z / TILE_SIZE) };
  }

  gridToWorld(gx: number, gy: number): THREE.Vector3 {
    return new THREE.Vector3(gx * TILE_SIZE, 0, gy * TILE_SIZE);
  }

  queryCell(gx: number, gy: number): CellQuery {
    const row = this.grid[gy];
    const tile: TileCode = row?.[gx] ?? ' ';
    return { walkable: WALKABLE[tile] ?? false, encounterChance: ENCOUNTER_TILE[tile] ?? 0, tile };
  }

  update(dt: number): void {
    this.elapsed += dt;
    if (this.waterMaterial?.normalMap) {
      this.waterMaterial.normalMap.offset.set((this.elapsed * 0.015) % 1, (this.elapsed * 0.01) % 1);
    }
  }

  dispose(): void {
    for (const mesh of this.instancedMeshes) mesh.dispose();
    for (const resource of this.owned) resource.dispose();
    this.owned = [];
    this.instancedMeshes = [];
  }

  private own<T extends { dispose(): void }>(resource: T): T {
    this.owned.push(resource);
    return resource;
  }

  private tileAt(x: number, y: number): TileCode {
    return this.grid[y]?.[x] ?? ' ';
  }

  private cellsWhere(predicate: (tile: TileCode) => boolean): Cell[] {
    const cells: Cell[] = [];
    for (let y = 0; y < this.def.height; y += 1) {
      for (let x = 0; x < this.def.width; x += 1) {
        if (predicate(this.grid[y][x])) cells.push({ x, y });
      }
    }
    return cells;
  }

  /**
   * Places one instanced mesh from a shared asset. `placements` yields
   * position/rotation/scale tuples; asset geometry+material stay shared.
   */
  private instantiate(
    asset: MeshAsset,
    placements: Placement[],
    opts: { castShadow?: boolean; receiveShadow?: boolean; colorJitter?: number } = {},
  ): THREE.InstancedMesh | undefined {
    if (placements.length === 0) return undefined;
    const mesh = new THREE.InstancedMesh(asset.geometry, asset.material, placements.length);
    mesh.castShadow = opts.castShadow ?? true;
    mesh.receiveShadow = opts.receiveShadow ?? true;
    // The auto bounding sphere only covers the source geometry, not the
    // instance placements spread across the map — never cull these.
    mesh.frustumCulled = false;
    const matrix = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    placements.forEach((p, i) => {
      pos.set(p.x, p.y, p.z);
      quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rotY);
      scl.setScalar(p.scale);
      matrix.compose(pos, quat, scl);
      mesh.setMatrixAt(i, matrix);
      if (opts.colorJitter) {
        const jitter = 1 - opts.colorJitter / 2 + cellRandom(p.x, p.z, 9.1) * opts.colorJitter;
        mesh.setColorAt(i, new THREE.Color(jitter, jitter, jitter));
      }
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.instancedMeshes.push(mesh);
    this.group.add(mesh);
    return mesh;
  }

  /** Instances every mesh part of a prop variant with the same placements, scaled to targetHeight. */
  private placeVariant(
    variant: PropVariant,
    placements: Placement[],
    targetHeight: number,
    opts: { castShadow?: boolean; colorJitter?: number; sway?: number } = {},
  ): void {
    if (placements.length === 0) return;
    const height = variantHeight(variant);
    const normalized = placements.map((p) => ({ ...p, scale: (p.scale * targetHeight) / height }));
    for (const part of variant) {
      let material = part.material;
      if (opts.sway) {
        material = this.own((part.material as THREE.MeshStandardMaterial).clone());
        applyWindSway(material, opts.sway);
      }
      this.instantiate({ geometry: part.geometry, material }, normalized, {
        castShadow: opts.castShadow,
        colorJitter: opts.colorJitter,
      });
    }
  }

  /** Spreads placements across variants deterministically (salt keeps layers independent). */
  private splitAcrossVariants(variants: PropVariant[], placements: Placement[], salt: number): Placement[][] {
    const byVariant: Placement[][] = variants.map(() => []);
    for (const p of placements) {
      const index = Math.floor(cellRandom(p.x, p.z, salt) * variants.length);
      byVariant[index].push(p);
    }
    return byVariant;
  }

  // ---------------- Ground ----------------

  private buildGround(): void {
    const assets = getAssetLibrary();
    const groundGeom = this.own(new THREE.BoxGeometry(TILE_SIZE, 0.12, TILE_SIZE));
    // Alpine maps read as snowfields: their grass is snow.
    const grassSet = this.biome === 'alpine' ? assets.ground.snow : assets.ground.grass;
    const grassTint = this.biome === 'alpine' ? new THREE.Color(1, 1, 1.04) : new THREE.Color(0.78, 0.98, 0.62);

    const makeMat = (set: { map: THREE.Texture; normalMap: THREE.Texture }, color: THREE.Color, roughness = 0.95) =>
      this.own(new THREE.MeshStandardMaterial({
        map: set.map,
        normalMap: set.normalMap,
        normalScale: new THREE.Vector2(0.7, 0.7),
        color,
        roughness,
      }));

    const groups: { cells: Cell[]; material: THREE.MeshStandardMaterial }[] = [
      {
        cells: this.cellsWhere((t) => t === ',' || t === '"'),
        material: makeMat(grassSet, grassTint),
      },
      {
        cells: this.cellsWhere((t) => t === '.' || t === 'D'),
        // Alpine paths read as packed snow rather than mud.
        material: this.biome === 'alpine'
          ? makeMat(assets.ground.snow, new THREE.Color(0.94, 0.95, 1), 1)
          : makeMat(assets.ground.dirt, new THREE.Color(1.05, 0.95, 0.85), 1),
      },
      {
        cells: this.cellsWhere((t) => t === 'S'),
        material: makeMat(assets.ground.sand, new THREE.Color(1.1, 1.05, 0.95), 1),
      },
      {
        cells: this.cellsWhere((t) => t === 'G'),
        material: makeMat(assets.ground.stone, new THREE.Color(1, 1, 1), 0.85),
      },
      {
        cells: this.cellsWhere((t) => t === 'b'),
        material: this.own(new THREE.MeshStandardMaterial({ map: barkTexture(), roughness: 0.9 })),
      },
      {
        // Ground under trees, rocks, buildings and fences so props never float over void.
        cells: this.cellsWhere((t) => t === '#' || t === '^' || t === 'B' || t === 'F'),
        material: makeMat(grassSet, grassTint.clone().multiplyScalar(0.92)),
      },
    ];

    for (const groupDef of groups) {
      if (groupDef.cells.length === 0) continue;
      const mesh = new THREE.InstancedMesh(groundGeom, groupDef.material, groupDef.cells.length);
      mesh.receiveShadow = true;
      const matrix = new THREE.Matrix4();
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const one = new THREE.Vector3(1, 1, 1);
      groupDef.cells.forEach((cell, i) => {
        // Random 90° rotation breaks up texture tiling without seams.
        const quarterTurns = Math.floor(cellRandom(cell.x, cell.y, 1.7) * 4);
        pos.set(cell.x * TILE_SIZE, -0.06, cell.y * TILE_SIZE);
        quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (Math.PI / 2) * quarterTurns);
        matrix.compose(pos, quat, one);
        mesh.setMatrixAt(i, matrix);
        const shade = 0.92 + cellRandom(cell.x, cell.y, 3.3) * 0.16;
        mesh.setColorAt(i, new THREE.Color(shade, shade, shade));
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.instancedMeshes.push(mesh);
      this.group.add(mesh);
    }
  }

  private buildWater(): void {
    const waterCells = this.cellsWhere((t) => t === '~');
    if (waterCells.length === 0) return;
    const assets = getAssetLibrary();
    const geom = this.own(new THREE.BoxGeometry(TILE_SIZE, 0.06, TILE_SIZE));
    const normalMap = assets.ground.dirt.normalMap.clone();
    normalMap.needsUpdate = true;
    this.own(normalMap);
    this.waterMaterial = this.own(new THREE.MeshStandardMaterial({
      map: waterTexture(),
      normalMap,
      normalScale: new THREE.Vector2(0.35, 0.35),
      transparent: true,
      opacity: 0.9,
      roughness: 0.08,
      metalness: 0.05,
      envMapIntensity: 1.4,
    }));
    const mesh = new THREE.InstancedMesh(geom, this.waterMaterial, waterCells.length);
    mesh.receiveShadow = true;
    const matrix = new THREE.Matrix4();
    waterCells.forEach((cell, i) => {
      matrix.makeTranslation(cell.x * TILE_SIZE, -0.1, cell.y * TILE_SIZE);
      mesh.setMatrixAt(i, matrix);
    });
    this.instancedMeshes.push(mesh);
    this.group.add(mesh);
  }

  // ---------------- Vegetation ----------------

  private buildVegetation(): void {
    const assets = getAssetLibrary();
    const grassCells = this.cellsWhere((t) => t === ',' || t === '"');

    // Grass clumps — dense on tall grass so encounter tiles read at a glance.
    const grassVariants = assets.nature('Grass');
    if (grassVariants.length > 0 && this.biome !== 'alpine') {
      const clumpPlacements: Placement[] = [];
      for (const cell of grassCells) {
        const tall = this.grid[cell.y][cell.x] === '"';
        const clumps = tall ? 6 : 3;
        for (let i = 0; i < clumps; i += 1) {
          clumpPlacements.push({
            x: cell.x * TILE_SIZE + (cellRandom(cell.x, cell.y, 10 + i) - 0.5) * TILE_SIZE * 0.9,
            y: 0,
            z: cell.y * TILE_SIZE + (cellRandom(cell.x, cell.y, 20 + i) - 0.5) * TILE_SIZE * 0.9,
            rotY: cellRandom(cell.x, cell.y, 30 + i) * Math.PI * 2,
            scale: (tall ? 1.2 : 0.8) * (0.8 + cellRandom(cell.x, cell.y, 40 + i) * 0.5),
          });
        }
      }
      this.splitAcrossVariants(grassVariants, clumpPlacements, 47).forEach((placements, i) => {
        this.placeVariant(grassVariants[i], placements, 0.34, { castShadow: false, colorJitter: 0.3, sway: 0.09 });
      });
    }

    // Flowers on a fraction of grass tiles.
    const flowerVariants = [...assets.nature('Flowers'), ...assets.nature('Flower_Bushes')];
    if (flowerVariants.length > 0 && this.biome !== 'alpine') {
      const flowerPlacements: Placement[] = [];
      for (const cell of grassCells) {
        if (cellRandom(cell.x, cell.y, 55) > 0.14) continue;
        flowerPlacements.push({
          x: cell.x * TILE_SIZE + (cellRandom(cell.x, cell.y, 57) - 0.5) * TILE_SIZE * 0.7,
          y: 0,
          z: cell.y * TILE_SIZE + (cellRandom(cell.x, cell.y, 58) - 0.5) * TILE_SIZE * 0.7,
          rotY: cellRandom(cell.x, cell.y, 59) * Math.PI * 2,
          scale: 0.7 + cellRandom(cell.x, cell.y, 60) * 0.4,
        });
      }
      this.splitAcrossVariants(flowerVariants, flowerPlacements, 56).forEach((placements, i) => {
        this.placeVariant(flowerVariants[i], placements, 0.4, { castShadow: false, sway: 0.05 });
      });
    }

    // Bushes sprinkled on tall grass.
    const bushVariants = assets.nature('Bushes');
    if (bushVariants.length > 0) {
      const bushPlacements: Placement[] = [];
      for (const cell of grassCells) {
        if (this.grid[cell.y][cell.x] !== '"') continue;
        if (cellRandom(cell.x, cell.y, 70) > 0.08) continue;
        bushPlacements.push({
          x: cell.x * TILE_SIZE,
          y: 0,
          z: cell.y * TILE_SIZE,
          rotY: cellRandom(cell.x, cell.y, 72) * Math.PI * 2,
          scale: 0.8 + cellRandom(cell.x, cell.y, 73) * 0.4,
        });
      }
      this.splitAcrossVariants(bushVariants, bushPlacements, 71).forEach((placements, i) => {
        this.placeVariant(bushVariants[i], placements, 1.1, { colorJitter: 0.25 });
      });
    }

    // Trees on '#' cells, biome-flavoured (birch marsh, pines up north, dead gloom…).
    const treeVariants = assets.treesForBiome(this.biome);
    if (treeVariants.length > 0) {
      const treePlacements: Placement[] = [];
      for (const cell of this.cellsWhere((t) => t === '#')) {
        treePlacements.push({
          x: cell.x * TILE_SIZE + (cellRandom(cell.x, cell.y, 81) - 0.5) * 0.6,
          y: 0,
          z: cell.y * TILE_SIZE + (cellRandom(cell.x, cell.y, 82) - 0.5) * 0.6,
          rotY: cellRandom(cell.x, cell.y, 83) * Math.PI * 2,
          scale: 0.85 + cellRandom(cell.x, cell.y, 84) * 0.4,
        });
      }
      this.splitAcrossVariants(treeVariants, treePlacements, 80).forEach((placements, i) => {
        this.placeVariant(treeVariants[i], placements, 4.2, { colorJitter: 0.2, sway: 0.012 });
      });
    }
  }

  private buildRocks(): void {
    const assets = getAssetLibrary();
    const rockVariants = assets.nature('Rocks');
    if (rockVariants.length === 0) return;
    const placements: Placement[] = this.cellsWhere((t) => t === '^').map((cell) => ({
      x: cell.x * TILE_SIZE,
      y: 0,
      z: cell.y * TILE_SIZE,
      rotY: cellRandom(cell.x, cell.y, 91) * Math.PI * 2,
      scale: 0.9 + cellRandom(cell.x, cell.y, 92) * 0.6,
    }));
    this.splitAcrossVariants(rockVariants, placements, 90).forEach((byVariant, i) => {
      this.placeVariant(rockVariants[i], byVariant, 1.4, { colorJitter: 0.25 });
    });
  }

  // ---------------- Structures ----------------

  /** Rotation that makes a building's entrance face the adjacent door tile, if any. */
  private doorFacing(cell: Cell): number {
    if (this.tileAt(cell.x, cell.y + 1) === 'D') return 0; // door south (+z)
    if (this.tileAt(cell.x, cell.y - 1) === 'D') return Math.PI;
    if (this.tileAt(cell.x + 1, cell.y) === 'D') return Math.PI / 2;
    if (this.tileAt(cell.x - 1, cell.y) === 'D') return -Math.PI / 2;
    return 0;
  }

  private buildBuildings(): void {
    const assets = getAssetLibrary();
    const cells = this.cellsWhere((t) => t === 'B');
    if (cells.length === 0) return;

    for (const cell of cells) {
      const roll = cellRandom(cell.x, cell.y, 100);
      const model = HOUSE_MODELS[Math.floor(roll * HOUSE_MODELS.length)];
      const building = assets.villageClone(model);

      // Fit the building into its tile (buildings may span a bit beyond for depth).
      const box = new THREE.Box3().setFromObject(building);
      const size = new THREE.Vector3();
      box.getSize(size);
      const footprint = Math.max(size.x, size.z, 0.001);
      const scale = (TILE_SIZE * 1.25) / footprint;
      building.scale.setScalar(scale);
      building.position.set(
        cell.x * TILE_SIZE - (box.min.x + size.x / 2) * scale,
        -box.min.y * scale,
        cell.y * TILE_SIZE - (box.min.z + size.z / 2) * scale,
      );
      const pivot = new THREE.Object3D();
      pivot.position.set(cell.x * TILE_SIZE, 0, cell.y * TILE_SIZE);
      building.position.sub(pivot.position);
      pivot.add(building);
      pivot.rotation.y = this.doorFacing(cell);
      this.group.add(pivot);

      // A lantern by the entrance and the odd crate/hay give villages some life.
      if (cellRandom(cell.x, cell.y, 101) < 0.65) {
        const lantern = assets.townClone('lantern');
        const lanternBox = new THREE.Box3().setFromObject(lantern);
        const lanternScale = 1.1 / Math.max(0.001, lanternBox.max.y - lanternBox.min.y);
        lantern.scale.setScalar(lanternScale);
        lantern.position.set(TILE_SIZE * 0.42, 0, TILE_SIZE * 0.42);
        pivot.add(lantern);
      }
      if (cellRandom(cell.x, cell.y, 102) < 0.3) {
        const propModel: VillageModel = cellRandom(cell.x, cell.y, 103) < 0.5 ? 'Crate' : 'Hay';
        const prop = assets.villageClone(propModel);
        const propBox = new THREE.Box3().setFromObject(prop);
        const propScale = 0.55 / Math.max(0.001, propBox.max.y - propBox.min.y);
        prop.scale.setScalar(propScale);
        prop.position.set(-TILE_SIZE * 0.4, 0, TILE_SIZE * 0.34);
        prop.rotation.y = cellRandom(cell.x, cell.y, 104) * Math.PI;
        pivot.add(prop);
      }
    }
  }

  /** Marks each gym entrance with a stone gate: two pillars and a banner. */
  private buildGymGates(): void {
    const assets = getAssetLibrary();
    const gymCells = this.cellsWhere((t) => t === 'G');
    for (const cell of gymCells) {
      // Gate on the entrance side only: the G tile whose south neighbour is a walkable approach.
      const south = this.tileAt(cell.x, cell.y + 1);
      if (south === 'G' || !(WALKABLE[south] ?? false)) continue;

      const gate = new THREE.Object3D();
      gate.position.set(cell.x * TILE_SIZE, 0, cell.y * TILE_SIZE + TILE_SIZE * 0.45);
      for (const side of [-1, 1]) {
        const pillar = assets.townClone('pillar-stone');
        const box = new THREE.Box3().setFromObject(pillar);
        const scale = 1.9 / Math.max(0.001, box.max.y - box.min.y);
        pillar.scale.setScalar(scale);
        pillar.position.set(side * TILE_SIZE * 0.46, 0, 0);
        gate.add(pillar);

        const banner = assets.townClone(side < 0 ? 'banner-red' : 'banner-green');
        const bannerBox = new THREE.Box3().setFromObject(banner);
        const bannerScale = 1.1 / Math.max(0.001, bannerBox.max.y - bannerBox.min.y);
        banner.scale.setScalar(bannerScale);
        banner.position.set(side * TILE_SIZE * 0.46, 1.85, 0);
        gate.add(banner);
      }
      this.group.add(gate);
    }
  }

  private buildFences(): void {
    const assets = getAssetLibrary();
    const cells = this.cellsWhere((t) => t === 'F');
    if (cells.length === 0) return;

    const parts = assets.townParts('fence');
    if (parts.length === 0) return;
    // Kenney fence section spans ~1 unit along X; stretch to the 2-unit tile.
    let fenceLength = 0.001;
    for (const part of parts) {
      if (!part.geometry.boundingBox) part.geometry.computeBoundingBox();
      fenceLength = Math.max(fenceLength, part.geometry.boundingBox!.max.x - part.geometry.boundingBox!.min.x);
    }
    const scale = TILE_SIZE / fenceLength;

    const placements: Placement[] = cells.map((cell) => {
      // Follow the fence line: vertical neighbours rotate the section 90°.
      const vertical = this.tileAt(cell.x, cell.y - 1) === 'F' || this.tileAt(cell.x, cell.y + 1) === 'F';
      const horizontal = this.tileAt(cell.x - 1, cell.y) === 'F' || this.tileAt(cell.x + 1, cell.y) === 'F';
      return {
        x: cell.x * TILE_SIZE,
        y: 0,
        z: cell.y * TILE_SIZE,
        rotY: vertical && !horizontal ? Math.PI / 2 : 0,
        scale,
      };
    });
    for (const part of parts) {
      this.instantiate(part, placements);
    }
  }
}
