import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { Tree } from '@dgreenheck/ez-tree';

/**
 * Loads every real art asset the game uses — GLB models (grass clumps, flowers,
 * rocks) and PBR ground textures shipped with the MIT-licensed EZ-Tree package
 * (see ASSETS.md) — and pre-generates the tree/bush mesh variants used for
 * instancing. Everything is loaded once at startup and shared read-only.
 */

export interface MeshAsset {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

export interface TreeVariant {
  branches: MeshAsset;
  leaves: MeshAsset;
}

export type Biome = 'temperate' | 'alpine' | 'volcanic' | 'marsh' | 'gloom' | 'coastal';

const BIOME_TREE_PRESETS: Record<Biome, string[]> = {
  temperate: ['Oak Medium', 'Ash Medium', 'Aspen Medium'],
  alpine: ['Pine Medium', 'Pine Large'],
  volcanic: ['Ash Small', 'Pine Small'],
  marsh: ['Ash Medium', 'Aspen Small'],
  gloom: ['Ash Large', 'Oak Small'],
  coastal: ['Aspen Medium', 'Oak Small'],
};

const BUSH_PRESETS = ['Bush 1', 'Bush 2', 'Bush 3'];

function biomeForMap(mapId: string): Biome {
  if (mapId.includes('frostgale') || mapId.includes('route_8')) return 'alpine';
  if (mapId.includes('harrow') || mapId.includes('route_3')) return 'volcanic';
  if (mapId.includes('fenmoor') || mapId.includes('route_7')) return 'marsh';
  if (mapId.includes('hollowmere') || mapId.includes('route_9') || mapId.includes('wyrmspire')) return 'gloom';
  if (mapId.includes('tidalmere') || mapId.includes('route_4')) return 'coastal';
  return 'temperate';
}

function firstMesh(root: THREE.Object3D): THREE.Mesh {
  let found: THREE.Mesh | undefined;
  root.traverse((child) => {
    if (!found && child instanceof THREE.Mesh) found = child;
  });
  if (!found) throw new Error('GLB contains no mesh');
  return found;
}

function toMeshAsset(mesh: THREE.Mesh): MeshAsset {
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  // Bake the mesh's own transform into the geometry so instancing matrices
  // only need to encode world placement.
  const geometry = mesh.geometry.clone();
  mesh.updateMatrix();
  geometry.applyMatrix4(mesh.matrix);
  return { geometry, material };
}

function buildTreeVariant(preset: string, seed: number): TreeVariant {
  const tree = new Tree();
  tree.loadPreset(preset);
  tree.options.seed = seed;
  tree.generate();
  const branchesMat = Array.isArray(tree.branchesMesh.material) ? tree.branchesMesh.material[0] : tree.branchesMesh.material;
  const leavesMat = Array.isArray(tree.leavesMesh.material) ? tree.leavesMesh.material[0] : tree.leavesMesh.material;
  return {
    branches: { geometry: tree.branchesMesh.geometry, material: branchesMat },
    leaves: { geometry: tree.leavesMesh.geometry, material: leavesMat },
  };
}

export class AssetLibrary {
  grassClump!: MeshAsset;
  flowers: MeshAsset[] = [];
  rocks: MeshAsset[] = [];
  grassTexture!: THREE.Texture;
  dirtTexture!: THREE.Texture;
  dirtNormal!: THREE.Texture;
  private treeCache = new Map<string, TreeVariant>();
  private bushCache = new Map<string, TreeVariant>();

  async load(): Promise<void> {
    const gltfLoader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('draco/');
    gltfLoader.setDRACOLoader(dracoLoader);
    const textureLoader = new THREE.TextureLoader();

    const [grass, flowerBlue, flowerWhite, flowerYellow, rock1, rock2, rock3] = await Promise.all([
      gltfLoader.loadAsync('assets/models/grass.glb'),
      gltfLoader.loadAsync('assets/models/flower_blue.glb'),
      gltfLoader.loadAsync('assets/models/flower_white.glb'),
      gltfLoader.loadAsync('assets/models/flower_yellow.glb'),
      gltfLoader.loadAsync('assets/models/rock1.glb'),
      gltfLoader.loadAsync('assets/models/rock2.glb'),
      gltfLoader.loadAsync('assets/models/rock3.glb'),
    ]);

    this.grassClump = toMeshAsset(firstMesh(grass.scene));
    this.flowers = [flowerBlue, flowerWhite, flowerYellow].map((g) => toMeshAsset(firstMesh(g.scene)));
    this.rocks = [rock1, rock2, rock3].map((g) => toMeshAsset(firstMesh(g.scene)));

    const loadTexture = async (url: string, repeat: number): Promise<THREE.Texture> => {
      const texture = await textureLoader.loadAsync(url);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(repeat, repeat);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      return texture;
    };

    this.grassTexture = await loadTexture('assets/textures/grass.jpg', 1);
    this.dirtTexture = await loadTexture('assets/textures/dirt_color.jpg', 1);
    this.dirtNormal = await textureLoader.loadAsync('assets/textures/dirt_normal.jpg');
    this.dirtNormal.wrapS = THREE.RepeatWrapping;
    this.dirtNormal.wrapT = THREE.RepeatWrapping;
  }

  /** Tree variants for a map, generated lazily and cached — heavy geometry built once per preset. */
  treesForMap(mapId: string): TreeVariant[] {
    const presets = BIOME_TREE_PRESETS[biomeForMap(mapId)];
    return presets.map((preset, i) => {
      const key = `${preset}`;
      if (!this.treeCache.has(key)) this.treeCache.set(key, buildTreeVariant(preset, 1000 + i * 137));
      return this.treeCache.get(key)!;
    });
  }

  bushes(): TreeVariant[] {
    return BUSH_PRESETS.map((preset, i) => {
      if (!this.bushCache.has(preset)) this.bushCache.set(preset, buildTreeVariant(preset, 500 + i * 61));
      return this.bushCache.get(preset)!;
    });
  }
}

let sharedLibrary: AssetLibrary | undefined;
let sharedLoad: Promise<AssetLibrary> | undefined;

export function loadAssetLibrary(): Promise<AssetLibrary> {
  if (!sharedLoad) {
    const library = new AssetLibrary();
    sharedLoad = library.load().then(() => {
      sharedLibrary = library;
      return library;
    });
  }
  return sharedLoad;
}

export function getAssetLibrary(): AssetLibrary {
  if (!sharedLibrary) throw new Error('Asset library not loaded yet');
  return sharedLibrary;
}
