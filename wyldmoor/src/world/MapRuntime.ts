import * as THREE from 'three';
import type { MapDef, TileCode } from '../data/mapSchema.ts';
import {
  grassTexture, dirtPathTexture, sandTexture, stoneTexture,
  barkTexture, leafTexture, roofTexture, wallTexture, fenceTexture, waterTexture,
} from '../gfx/TextureFactory.ts';

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

function groundMaterialFor(tile: TileCode, groundColorHex: number): THREE.MeshStandardMaterial {
  switch (tile) {
    case ',':
      return new THREE.MeshStandardMaterial({ map: grassTexture('short'), roughness: 0.95 });
    case '"':
      return new THREE.MeshStandardMaterial({ map: grassTexture('tall'), roughness: 0.95 });
    case 'S':
      return new THREE.MeshStandardMaterial({ map: sandTexture(), roughness: 1 });
    case 'b':
      return new THREE.MeshStandardMaterial({ map: barkTexture(), roughness: 0.9 });
    case 'G':
      return new THREE.MeshStandardMaterial({ map: stoneTexture(), roughness: 0.85 });
    case '.':
    case 'D':
      return new THREE.MeshStandardMaterial({ map: dirtPathTexture(), roughness: 1 });
    default:
      return new THREE.MeshStandardMaterial({ map: dirtPathTexture(), color: groundColorHex, roughness: 1 });
  }
}

export class MapRuntime {
  readonly def: MapDef;
  readonly group = new THREE.Object3D();
  private grid: TileCode[][];
  private waterMaterial?: THREE.MeshStandardMaterial;
  private elapsed = 0;

  constructor(def: MapDef) {
    this.def = def;
    this.grid = def.tiles.map((row) => row.split('') as TileCode[]);
    this.buildGround();
    this.buildProps();
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

  /** Frees this map's own geometries/materials on transition. Shared cached textures are left intact
   *  (only the water shimmer texture is a per-map clone, so it's disposed explicitly here). */
  dispose(): void {
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.InstancedMesh) {
        child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of materials) mat.dispose();
      }
    });
    this.waterMaterial?.map?.dispose();
  }

  /** Animates the water shimmer; called once per frame while this map is active. */
  update(dt: number): void {
    this.elapsed += dt;
    if (this.waterMaterial?.map) {
      this.waterMaterial.map.offset.set(Math.sin(this.elapsed * 0.05) * 0.3, this.elapsed * 0.02 % 1);
    }
  }

  private buildGround(): void {
    const geom = new THREE.BoxGeometry(TILE_SIZE * 0.98, 0.1, TILE_SIZE * 0.98);
    const groundColorHex = new THREE.Color(this.def.groundColor).getHex();
    const byTile = new Map<TileCode, { x: number; y: number }[]>();
    for (let y = 0; y < this.def.height; y += 1) {
      for (let x = 0; x < this.def.width; x += 1) {
        const tile = this.grid[y][x];
        if (tile === ' ' || tile === '~') continue;
        if (!byTile.has(tile)) byTile.set(tile, []);
        byTile.get(tile)!.push({ x, y });
      }
    }
    for (const [tile, cells] of byTile) {
      const mesh = new THREE.InstancedMesh(geom, groundMaterialFor(tile, groundColorHex), cells.length);
      mesh.receiveShadow = true;
      const m = new THREE.Matrix4();
      cells.forEach((cell, i) => {
        m.makeTranslation(cell.x * TILE_SIZE, 0, cell.y * TILE_SIZE);
        mesh.setMatrixAt(i, m);
      });
      this.group.add(mesh);
    }

    const waterCells: { x: number; y: number }[] = [];
    for (let y = 0; y < this.def.height; y += 1) {
      for (let x = 0; x < this.def.width; x += 1) {
        if (this.grid[y][x] === '~') waterCells.push({ x, y });
      }
    }
    if (waterCells.length > 0) {
      const waterGeom = new THREE.BoxGeometry(TILE_SIZE * 0.98, 0.06, TILE_SIZE * 0.98);
      const map = waterTexture().clone();
      map.needsUpdate = true;
      this.waterMaterial = new THREE.MeshStandardMaterial({
        map, transparent: true, opacity: 0.88, roughness: 0.25, metalness: 0.1,
      });
      const waterMesh = new THREE.InstancedMesh(waterGeom, this.waterMaterial, waterCells.length);
      const m = new THREE.Matrix4();
      waterCells.forEach((cell, i) => {
        m.makeTranslation(cell.x * TILE_SIZE, -0.02, cell.y * TILE_SIZE);
        waterMesh.setMatrixAt(i, m);
      });
      this.group.add(waterMesh);
    }
  }

  private buildProps(): void {
    const trees: { x: number; y: number }[] = [];
    const rocks: { x: number; y: number }[] = [];
    const buildings: { x: number; y: number }[] = [];
    const fences: { x: number; y: number }[] = [];

    for (let y = 0; y < this.def.height; y += 1) {
      for (let x = 0; x < this.def.width; x += 1) {
        const tile = this.grid[y][x];
        if (tile === '#') trees.push({ x, y });
        else if (tile === '^') rocks.push({ x, y });
        else if (tile === 'B') buildings.push({ x, y });
        else if (tile === 'F') fences.push({ x, y });
      }
    }

    this.instanceProp(trees, () => {
      const g = new THREE.Object3D();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.8, 7), new THREE.MeshStandardMaterial({ map: barkTexture(), roughness: 0.9 }));
      trunk.position.y = 0.4;
      g.add(trunk);
      const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 1), new THREE.MeshStandardMaterial({ map: leafTexture(), roughness: 0.85 }));
      leaves.position.y = 1.3;
      g.add(leaves);
      return g;
    });

    this.instanceProp(rocks, () => {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 0), new THREE.MeshStandardMaterial({ map: stoneTexture(), roughness: 0.8 }));
      rock.position.y = 0.4;
      rock.rotation.set(Math.random(), Math.random(), Math.random());
      return rock;
    });

    this.instanceProp(buildings, () => {
      const g = new THREE.Object3D();
      const base = new THREE.Mesh(new THREE.BoxGeometry(TILE_SIZE * 0.95, 2.2, TILE_SIZE * 0.95), new THREE.MeshStandardMaterial({ map: wallTexture(), roughness: 0.9 }));
      base.position.y = 1.1;
      g.add(base);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(TILE_SIZE * 0.75, 1, 4), new THREE.MeshStandardMaterial({ map: roofTexture(), roughness: 0.75 }));
      roof.rotation.y = Math.PI / 4;
      roof.position.y = 2.7;
      g.add(roof);
      return g;
    });

    this.instanceProp(fences, () => {
      const fence = new THREE.Mesh(new THREE.BoxGeometry(TILE_SIZE * 0.9, 0.6, 0.12), new THREE.MeshStandardMaterial({ map: fenceTexture(), roughness: 0.9 }));
      fence.position.y = 0.3;
      return fence;
    });
  }

  private instanceProp(cells: { x: number; y: number }[], build: () => THREE.Object3D): void {
    for (const cell of cells) {
      const obj = build();
      obj.position.x += cell.x * TILE_SIZE;
      obj.position.z += cell.y * TILE_SIZE;
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh) { child.castShadow = true; child.receiveShadow = true; }
      });
      this.group.add(obj);
    }
  }
}
