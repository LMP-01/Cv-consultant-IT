import * as THREE from 'three';
import type { MapDef, TileCode } from '../data/mapSchema.ts';
import { sandTexture, stoneTexture, barkTexture, roofTexture, wallTexture, fenceTexture, waterTexture, dirtPathTexture } from '../gfx/TextureFactory.ts';
import { getAssetLibrary, type MeshAsset, type TreeVariant } from '../gfx/AssetLibrary.ts';
import { applyWindSway } from '../gfx/Wind.ts';

export const TILE_SIZE = 2;

const WALKABLE: Record<TileCode, boolean> = {
  '.': true, ',': true, '"': true, '~': false, '#': false, '^': false,
  B: false, D: true, F: false, S: true, b: true, G: true, ' ': false,
};

const ENCOUNTER_TILE: Partial<Record<TileCode, number>> = { ',': 0.06, '"': 0.14 };

export interface CellQuery {
  walkable: boolean;
  encounterChance: number;
  tile: TileCode;
}

interface Cell { x: number; y: number }

/** Deterministic per-cell pseudo-random in [0,1) so vegetation layouts are stable across visits. */
function cellRandom(x: number, y: number, salt: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

export class MapRuntime {
  readonly def: MapDef;
  readonly group = new THREE.Object3D();
  private grid: TileCode[][];
  private waterMaterial?: THREE.MeshStandardMaterial;
  private elapsed = 0;
  /** Procedurally-created resources owned by this map (shared AssetLibrary resources are never registered here). */
  private owned: { dispose(): void }[] = [];
  private instancedMeshes: THREE.InstancedMesh[] = [];

  constructor(def: MapDef) {
    this.def = def;
    this.grid = def.tiles.map((row) => row.split('') as TileCode[]);
    this.buildGround();
    this.buildWater();
    this.buildVegetation();
    this.buildRocks();
    this.buildBuildings();
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
    placements: { x: number; y: number; z: number; rotY: number; scale: number }[],
    opts: { castShadow?: boolean; receiveShadow?: boolean; colorJitter?: number } = {},
  ): THREE.InstancedMesh | undefined {
    if (placements.length === 0) return undefined;
    const mesh = new THREE.InstancedMesh(asset.geometry, asset.material, placements.length);
    mesh.castShadow = opts.castShadow ?? true;
    mesh.receiveShadow = opts.receiveShadow ?? true;
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

  private static assetHeight(asset: MeshAsset): number {
    if (!asset.geometry.boundingBox) asset.geometry.computeBoundingBox();
    return Math.max(0.001, asset.geometry.boundingBox!.max.y);
  }

  // ---------------- Ground ----------------

  private buildGround(): void {
    const assets = getAssetLibrary();
    const groundGeom = this.own(new THREE.BoxGeometry(TILE_SIZE, 0.12, TILE_SIZE));

    const groups: { cells: Cell[]; material: THREE.MeshStandardMaterial }[] = [
      {
        cells: this.cellsWhere((t) => t === ',' || t === '"'),
        // Color components >1 brighten/saturate the texture rather than darken it.
        material: this.own(new THREE.MeshStandardMaterial({ map: assets.grassTexture, color: new THREE.Color(0.5, 0.82, 0.4), roughness: 0.95 })),
      },
      {
        cells: this.cellsWhere((t) => t === '.' || t === 'D'),
        material: this.own(new THREE.MeshStandardMaterial({ map: dirtPathTexture(), color: new THREE.Color(0.72, 0.58, 0.42), normalMap: assets.dirtNormal, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 1 })),
      },
      {
        cells: this.cellsWhere((t) => t === 'S'),
        material: this.own(new THREE.MeshStandardMaterial({ map: sandTexture(), roughness: 1 })),
      },
      {
        cells: this.cellsWhere((t) => t === 'G'),
        material: this.own(new THREE.MeshStandardMaterial({ map: stoneTexture(), roughness: 0.85 })),
      },
      {
        cells: this.cellsWhere((t) => t === 'b'),
        material: this.own(new THREE.MeshStandardMaterial({ map: barkTexture(), roughness: 0.9 })),
      },
      {
        // Ground under trees, rocks, buildings and fences so props never float over void.
        cells: this.cellsWhere((t) => t === '#' || t === '^' || t === 'B' || t === 'F'),
        material: this.own(new THREE.MeshStandardMaterial({ map: assets.grassTexture, color: new THREE.Color(0.55, 0.8, 0.45), roughness: 1 })),
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
    const normalMap = assets.dirtNormal.clone();
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
    const clumpPlacements: { x: number; y: number; z: number; rotY: number; scale: number }[] = [];
    for (const cell of grassCells) {
      const tall = this.grid[cell.y][cell.x] === '"';
      const clumps = tall ? 11 : 5;
      for (let i = 0; i < clumps; i += 1) {
        const ox = (cellRandom(cell.x, cell.y, 10 + i) - 0.5) * TILE_SIZE * 0.9;
        const oz = (cellRandom(cell.x, cell.y, 20 + i) - 0.5) * TILE_SIZE * 0.9;
        clumpPlacements.push({
          x: cell.x * TILE_SIZE + ox,
          y: 0,
          z: cell.y * TILE_SIZE + oz,
          rotY: cellRandom(cell.x, cell.y, 30 + i) * Math.PI * 2,
          scale: (tall ? 1.15 : 0.75) * (0.8 + cellRandom(cell.x, cell.y, 40 + i) * 0.5),
        });
      }
    }
    if (clumpPlacements.length > 0) {
      const grassMaterial = (assets.grassClump.material as THREE.MeshStandardMaterial).clone();
      grassMaterial.color.set(0x53953f);
      grassMaterial.roughness = 0.9;
      this.own(grassMaterial);
      applyWindSway(grassMaterial, 0.09);
      const clumpHeight = MapRuntime.assetHeight(assets.grassClump);
      const normalized = clumpPlacements.map((p) => ({ ...p, scale: (p.scale * 0.72) / clumpHeight }));
      this.instantiate({ geometry: assets.grassClump.geometry, material: grassMaterial }, normalized, { castShadow: false, colorJitter: 0.3 });
    }

    // Flowers on a fraction of grass tiles, one colour per cell.
    const flowerPlacementsByType: { x: number; y: number; z: number; rotY: number; scale: number }[][] = [[], [], []];
    for (const cell of grassCells) {
      if (cellRandom(cell.x, cell.y, 55) > 0.14) continue;
      const type = Math.floor(cellRandom(cell.x, cell.y, 56) * 3);
      flowerPlacementsByType[type].push({
        x: cell.x * TILE_SIZE + (cellRandom(cell.x, cell.y, 57) - 0.5) * TILE_SIZE * 0.7,
        y: 0,
        z: cell.y * TILE_SIZE + (cellRandom(cell.x, cell.y, 58) - 0.5) * TILE_SIZE * 0.7,
        rotY: cellRandom(cell.x, cell.y, 59) * Math.PI * 2,
        scale: 0.6 + cellRandom(cell.x, cell.y, 60) * 0.4,
      });
    }
    flowerPlacementsByType.forEach((placements, type) => {
      if (placements.length === 0) return;
      const material = (assets.flowers[type].material as THREE.MeshStandardMaterial).clone();
      this.own(material);
      applyWindSway(material, 0.05);
      const flowerHeight = MapRuntime.assetHeight(assets.flowers[type]);
      const normalized = placements.map((p) => ({ ...p, scale: (p.scale * 0.45) / flowerHeight }));
      this.instantiate({ geometry: assets.flowers[type].geometry, material }, normalized, { castShadow: false });
    });

    // Bushes sprinkled on tall grass.
    const bushVariants = assets.bushes();
    const bushPlacements: { x: number; y: number; z: number; rotY: number; scale: number }[][] = bushVariants.map(() => []);
    for (const cell of grassCells) {
      if (this.grid[cell.y][cell.x] !== '"') continue;
      if (cellRandom(cell.x, cell.y, 70) > 0.08) continue;
      const variant = Math.floor(cellRandom(cell.x, cell.y, 71) * bushVariants.length);
      bushPlacements[variant].push({
        x: cell.x * TILE_SIZE,
        y: 0,
        z: cell.y * TILE_SIZE,
        rotY: cellRandom(cell.x, cell.y, 72) * Math.PI * 2,
        scale: 1,
      });
    }
    bushVariants.forEach((variant, i) => {
      this.placeTreeVariant(variant, bushPlacements[i], 1.3);
    });

    // Trees on '#' cells, split across the map's biome variants.
    const treeVariants = assets.treesForMap(this.def.id);
    const treePlacements: { x: number; y: number; z: number; rotY: number; scale: number }[][] = treeVariants.map(() => []);
    for (const cell of this.cellsWhere((t) => t === '#')) {
      const variant = Math.floor(cellRandom(cell.x, cell.y, 80) * treeVariants.length);
      treePlacements[variant].push({
        x: cell.x * TILE_SIZE + (cellRandom(cell.x, cell.y, 81) - 0.5) * 0.6,
        y: 0,
        z: cell.y * TILE_SIZE + (cellRandom(cell.x, cell.y, 82) - 0.5) * 0.6,
        rotY: cellRandom(cell.x, cell.y, 83) * Math.PI * 2,
        scale: 0.85 + cellRandom(cell.x, cell.y, 84) * 0.4,
      });
    }
    treeVariants.forEach((variant, i) => {
      this.placeTreeVariant(variant, treePlacements[i], 5.2);
    });
  }

  /** Trees/bushes are two shared meshes (branches + leaves); scale placements so the tallest point hits `targetHeight`. */
  private placeTreeVariant(
    variant: TreeVariant,
    placements: { x: number; y: number; z: number; rotY: number; scale: number }[],
    targetHeight: number,
  ): void {
    if (placements.length === 0) return;
    const height = Math.max(MapRuntime.assetHeight(variant.branches), MapRuntime.assetHeight(variant.leaves));
    const normalized = placements.map((p) => ({ ...p, scale: (p.scale * targetHeight) / height }));
    this.instantiate(variant.branches, normalized);
    const leavesMaterial = (variant.leaves.material as THREE.MeshStandardMaterial).clone();
    this.own(leavesMaterial);
    applyWindSway(leavesMaterial, 0.012);
    this.instantiate({ geometry: variant.leaves.geometry, material: leavesMaterial }, normalized);
  }

  private buildRocks(): void {
    const assets = getAssetLibrary();
    const rockCells = this.cellsWhere((t) => t === '^');
    const placementsByType: { x: number; y: number; z: number; rotY: number; scale: number }[][] = assets.rocks.map(() => []);
    for (const cell of rockCells) {
      const type = Math.floor(cellRandom(cell.x, cell.y, 90) * assets.rocks.length);
      placementsByType[type].push({
        x: cell.x * TILE_SIZE,
        y: 0,
        z: cell.y * TILE_SIZE,
        rotY: cellRandom(cell.x, cell.y, 91) * Math.PI * 2,
        scale: 1,
      });
    }
    assets.rocks.forEach((rock, i) => {
      if (placementsByType[i].length === 0) return;
      const height = MapRuntime.assetHeight(rock);
      const normalized = placementsByType[i].map((p) => ({ ...p, scale: ((0.9 + cellRandom(p.x, p.z, 92) * 0.6) * 1.3) / height }));
      this.instantiate(rock, normalized);
    });
  }

  // ---------------- Structures ----------------

  private buildBuildings(): void {
    const cells = this.cellsWhere((t) => t === 'B');
    if (cells.length === 0) return;

    const wallMat = this.own(new THREE.MeshStandardMaterial({ map: wallTexture(), roughness: 0.9 }));
    const roofMat = this.own(new THREE.MeshStandardMaterial({ map: roofTexture(), roughness: 0.7 }));
    const trimMat = this.own(new THREE.MeshStandardMaterial({ map: stoneTexture(), roughness: 0.85 }));
    const doorMat = this.own(new THREE.MeshStandardMaterial({ map: barkTexture(), color: 0x8a6a45, roughness: 0.8 }));
    const glassMat = this.own(new THREE.MeshStandardMaterial({ color: 0xbfe3ef, roughness: 0.1, metalness: 0.3, emissive: 0x334455, emissiveIntensity: 0.25 }));

    const w = TILE_SIZE * 0.98;
    const baseGeom = this.own(new THREE.BoxGeometry(w, 0.35, w));
    const wallsGeom = this.own(new THREE.BoxGeometry(w * 0.94, 1.9, w * 0.94));
    const roofGeom = this.own(MapRuntime.gableRoofGeometry(w * 1.12, w * 1.12, 0.95));
    const doorGeom = this.own(new THREE.BoxGeometry(0.5, 0.95, 0.06));
    const windowGeom = this.own(new THREE.BoxGeometry(0.42, 0.42, 0.05));
    const chimneyGeom = this.own(new THREE.BoxGeometry(0.22, 0.7, 0.22));

    for (const cell of cells) {
      const building = new THREE.Object3D();

      const base = new THREE.Mesh(baseGeom, trimMat);
      base.position.y = 0.175;
      building.add(base);

      const walls = new THREE.Mesh(wallsGeom, wallMat);
      walls.position.y = 0.35 + 0.95;
      building.add(walls);

      const roof = new THREE.Mesh(roofGeom, roofMat);
      roof.position.y = 2.25;
      roof.rotation.y = cellRandom(cell.x, cell.y, 100) > 0.5 ? Math.PI / 2 : 0;
      building.add(roof);

      const door = new THREE.Mesh(doorGeom, doorMat);
      door.position.set(0, 0.35 + 0.475, w * 0.47 + 0.01);
      building.add(door);

      for (const side of [-1, 1]) {
        const window = new THREE.Mesh(windowGeom, glassMat);
        window.position.set(side * 0.55, 1.45, w * 0.47 + 0.01);
        building.add(window);
      }

      const chimney = new THREE.Mesh(chimneyGeom, trimMat);
      chimney.position.set(w * 0.28, 2.75, -w * 0.2);
      building.add(chimney);

      building.position.set(cell.x * TILE_SIZE, 0, cell.y * TILE_SIZE);
      building.traverse((child) => {
        if (child instanceof THREE.Mesh) { child.castShadow = true; child.receiveShadow = true; }
      });
      this.group.add(building);
    }
  }

  /** Simple triangular-prism gable roof with slight eaves, ridge along Z. */
  private static gableRoofGeometry(width: number, depth: number, height: number): THREE.BufferGeometry {
    const w = width / 2;
    const d = depth / 2;
    const positions = new Float32Array([
      // front gable triangle
      -w, 0, d, w, 0, d, 0, height, d,
      // back gable triangle
      w, 0, -d, -w, 0, -d, 0, height, -d,
      // left slope
      -w, 0, -d, -w, 0, d, 0, height, d, -w, 0, -d, 0, height, d, 0, height, -d,
      // right slope
      w, 0, d, w, 0, -d, 0, height, -d, w, 0, d, 0, height, -d, 0, height, d,
      // underside
      -w, 0, -d, w, 0, -d, w, 0, d, -w, 0, -d, w, 0, d, -w, 0, d,
    ]);
    const uvs = new Float32Array(positions.length / 3 * 2);
    for (let i = 0; i < positions.length / 3; i += 1) {
      uvs[i * 2] = (positions[i * 3] / width + 0.5) * 2;
      uvs[i * 2 + 1] = (positions[i * 3 + 2] / depth + 0.5) * 2;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.computeVertexNormals();
    return geometry;
  }

  private buildFences(): void {
    const cells = this.cellsWhere((t) => t === 'F');
    if (cells.length === 0) return;
    const mat = this.own(new THREE.MeshStandardMaterial({ map: fenceTexture(), roughness: 0.9 }));
    const postGeom = this.own(new THREE.BoxGeometry(0.12, 0.7, 0.12));
    const railGeom = this.own(new THREE.BoxGeometry(TILE_SIZE, 0.08, 0.06));

    for (const cell of cells) {
      const fence = new THREE.Object3D();
      for (const px of [-TILE_SIZE * 0.4, TILE_SIZE * 0.4]) {
        const post = new THREE.Mesh(postGeom, mat);
        post.position.set(px, 0.35, 0);
        fence.add(post);
      }
      for (const railY of [0.28, 0.55]) {
        const rail = new THREE.Mesh(railGeom, mat);
        rail.position.set(0, railY, 0);
        fence.add(rail);
      }
      fence.position.set(cell.x * TILE_SIZE, 0, cell.y * TILE_SIZE);
      fence.traverse((child) => {
        if (child instanceof THREE.Mesh) { child.castShadow = true; child.receiveShadow = true; }
      });
      this.group.add(fence);
    }
  }
}
