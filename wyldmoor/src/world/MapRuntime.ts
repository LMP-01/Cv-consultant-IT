import * as THREE from 'three';
import type { MapDef, TileCode } from '../data/mapSchema.ts';

export const TILE_SIZE = 2;

const WALKABLE: Record<TileCode, boolean> = {
  '.': true, ',': true, '"': true, '~': false, '#': false, '^': false,
  B: false, D: true, F: false, S: true, b: true, G: true, ' ': false,
};

const ENCOUNTER_TILE: Partial<Record<TileCode, number>> = { ',': 0.06, '"': 0.14 };

const GROUND_COLORS: Partial<Record<TileCode, number>> = {
  '.': 0xcbb488, ',': 0x4f9a4a, '"': 0x2e7a3a, S: 0xe0cf9a, b: 0x9c7a4a, G: 0xb9a97a, D: 0xb9a97a,
};

export interface CellQuery {
  walkable: boolean;
  encounterChance: number;
  tile: TileCode;
}

export class MapRuntime {
  readonly def: MapDef;
  readonly group = new THREE.Object3D();
  private grid: TileCode[][];

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

  private buildGround(): void {
    const geom = new THREE.BoxGeometry(TILE_SIZE * 0.98, 0.1, TILE_SIZE * 0.98);
    const byColor = new Map<number, { x: number; y: number }[]>();
    for (let y = 0; y < this.def.height; y += 1) {
      for (let x = 0; x < this.def.width; x += 1) {
        const tile = this.grid[y][x];
        if (tile === ' ') continue;
        const color = GROUND_COLORS[tile] ?? new THREE.Color(this.def.groundColor).getHex();
        if (!byColor.has(color)) byColor.set(color, []);
        byColor.get(color)!.push({ x, y });
      }
    }
    for (const [color, cells] of byColor) {
      const mesh = new THREE.InstancedMesh(geom, new THREE.MeshStandardMaterial({ color, flatShading: true }), cells.length);
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
      const waterMesh = new THREE.InstancedMesh(
        waterGeom,
        new THREE.MeshStandardMaterial({ color: 0x3a7bd5, flatShading: true, transparent: true, opacity: 0.85 }),
        waterCells.length,
      );
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
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.8, 6), new THREE.MeshStandardMaterial({ color: 0x6b4a2f, flatShading: true }));
      trunk.position.y = 0.4;
      g.add(trunk);
      const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 0), new THREE.MeshStandardMaterial({ color: 0x2f7a3f, flatShading: true }));
      leaves.position.y = 1.3;
      g.add(leaves);
      return g;
    });

    this.instanceProp(rocks, () => {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 0), new THREE.MeshStandardMaterial({ color: 0x8a8478, flatShading: true }));
      rock.position.y = 0.4;
      rock.rotation.set(Math.random(), Math.random(), Math.random());
      return rock;
    });

    this.instanceProp(buildings, () => {
      const g = new THREE.Object3D();
      const base = new THREE.Mesh(new THREE.BoxGeometry(TILE_SIZE * 0.95, 2.2, TILE_SIZE * 0.95), new THREE.MeshStandardMaterial({ color: 0xd7c9a3, flatShading: true }));
      base.position.y = 1.1;
      g.add(base);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(TILE_SIZE * 0.75, 1, 4), new THREE.MeshStandardMaterial({ color: 0xa4483f, flatShading: true }));
      roof.rotation.y = Math.PI / 4;
      roof.position.y = 2.7;
      g.add(roof);
      return g;
    });

    this.instanceProp(fences, () => {
      const fence = new THREE.Mesh(new THREE.BoxGeometry(TILE_SIZE * 0.9, 0.6, 0.12), new THREE.MeshStandardMaterial({ color: 0xb08d5a, flatShading: true }));
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
