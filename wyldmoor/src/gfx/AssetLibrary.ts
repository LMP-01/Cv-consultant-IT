import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

/**
 * Loads every real art asset the game uses (see ASSETS.md — all CC0):
 * - Quaternius animated GLB models for creatures and characters (lazy, cached);
 * - Quaternius stylized-nature GLBs (trees/bushes/rocks/grass/flowers, preloaded
 *   and split into per-variant mesh parts ready for instancing);
 * - Kenney Fantasy Town Kit GLB modules (walls/roofs/props, preloaded);
 * - Poly Haven PBR ground textures and the sky HDRI.
 * Everything is loaded once and shared read-only.
 */

export interface MeshAsset {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

/** One prop variant, e.g. a single tree: its mesh primitives with transforms baked in. */
export type PropVariant = MeshAsset[];

export type Biome = 'temperate' | 'alpine' | 'volcanic' | 'marsh' | 'gloom' | 'coastal';

export function biomeForMap(mapId: string): Biome {
  if (mapId.includes('frostgale') || mapId.includes('route_8')) return 'alpine';
  if (mapId.includes('harrow') || mapId.includes('route_3')) return 'volcanic';
  if (mapId.includes('fenmoor') || mapId.includes('route_7')) return 'marsh';
  if (mapId.includes('hollowmere') || mapId.includes('route_9') || mapId.includes('wyrmspire')) return 'gloom';
  if (mapId.includes('tidalmere') || mapId.includes('route_4')) return 'coastal';
  return 'temperate';
}

/** Which nature GLB files supply the trees of each biome. */
const BIOME_TREE_FILES: Record<Biome, (typeof NATURE_FILES)[number][]> = {
  temperate: ['Trees', 'Maple_Trees'],
  alpine: ['Pine_Trees'],
  volcanic: ['Dead_Trees'],
  marsh: ['Birch_Trees'],
  gloom: ['Dead_Trees', 'Birch_Trees'],
  coastal: ['Palm_Trees', 'Trees'],
};

const NATURE_FILES = [
  'Trees', 'Maple_Trees', 'Pine_Trees', 'Dead_Trees', 'Birch_Trees', 'Palm_Trees',
  'Bushes', 'Flower_Bushes', 'Flowers', 'Grass', 'Rocks',
] as const;

const TOWN_PIECES = [
  'wall', 'wall-corner', 'wall-door', 'wall-window-glass', 'wall-window-shutters', 'wall-window-stone',
  'wall-wood', 'wall-wood-corner', 'wall-wood-door', 'wall-wood-window-glass', 'wall-wood-window-shutters',
  'roof', 'roof-gable', 'roof-gable-end', 'roof-gable-top', 'roof-point', 'roof-flat',
  'roof-high', 'roof-high-gable', 'roof-high-gable-end', 'roof-high-gable-top', 'roof-high-point',
  'lantern', 'cart', 'stall-green', 'stall-red', 'stall-bench',
  'fountain-round', 'hedge', 'banner-green', 'banner-red', 'chimney',
  'pillar-stone', 'pillar-wood', 'fence', 'fence-gate', 'fence-broken',
  'stairs-stone', 'windmill', 'wheel',
] as const;

export type TownPiece = (typeof TOWN_PIECES)[number];

/** Quaternius Medieval Village pack: complete buildings & props (see ASSETS.md). */
const VILLAGE_MODELS = [
  'Fantasy_House', 'Fantasy_Inn', 'Fantasy_Barracks', 'Fantasy_Stable', 'Fantasy_Sawmill',
  'Blacksmith', 'Bell_Tower', 'Mill', 'Well', 'Market_Stand',
  'Cart', 'Bench', 'Crate', 'Hay', 'Bonfire',
] as const;

export type VillageModel = (typeof VILLAGE_MODELS)[number];

export interface GroundTexture {
  map: THREE.Texture;
  normalMap: THREE.Texture;
}

export interface CreatureTemplate {
  scene: THREE.Group;
  clips: THREE.AnimationClip[];
  /** Height of the model's bounding box in its native units. */
  height: number;
  /** Y offset of the bounding box bottom (flying creatures hover above 0). */
  groundOffset: number;
}

function collectMeshParts(root: THREE.Object3D): PropVariant {
  const parts: PropVariant = [];
  root.updateWorldMatrix(true, true);
  root.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld);
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    parts.push({ geometry, material });
  });
  // Packs lay their variants out in a display row (offset sometimes baked into
  // the vertices themselves): re-centre each variant on X/Z and sit it on y=0.
  const box = new THREE.Box3();
  for (const part of parts) {
    part.geometry.computeBoundingBox();
    box.union(part.geometry.boundingBox!);
  }
  if (!box.isEmpty()) {
    const centerX = (box.min.x + box.max.x) / 2;
    const centerZ = (box.min.z + box.max.z) / 2;
    for (const part of parts) {
      part.geometry.translate(-centerX, -box.min.y, -centerZ);
      part.geometry.computeBoundingBox();
    }
  }
  return parts;
}

export function variantHeight(variant: PropVariant): number {
  let maxY = 0.001;
  for (const part of variant) {
    if (!part.geometry.boundingBox) part.geometry.computeBoundingBox();
    maxY = Math.max(maxY, part.geometry.boundingBox!.max.y);
  }
  return maxY;
}

export class AssetLibrary {
  ground!: Record<'grass' | 'dirt' | 'stone' | 'sand' | 'snow', GroundTexture>;
  /** Equirectangular HDRI used as scene.environment (image-based lighting). */
  envMap!: THREE.DataTexture;

  /** Per-file nature variants, e.g. natureVariants['Rocks'] = 5 rock variants. */
  private natureVariants = new Map<string, PropVariant[]>();
  private townTemplates = new Map<string, THREE.Group>();
  private villageTemplates = new Map<string, THREE.Group>();
  private creatureCache = new Map<string, Promise<CreatureTemplate>>();
  private gltfLoader!: GLTFLoader;

  async load(): Promise<void> {
    this.gltfLoader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('draco/');
    this.gltfLoader.setDRACOLoader(dracoLoader);
    const textureLoader = new THREE.TextureLoader();

    const loadGround = async (name: string, repeat: number): Promise<GroundTexture> => {
      const [map, normalMap] = await Promise.all([
        textureLoader.loadAsync(`assets/textures/${name}_diff_1k.jpg`),
        textureLoader.loadAsync(`assets/textures/${name}_nor_1k.jpg`),
      ]);
      map.colorSpace = THREE.SRGBColorSpace;
      for (const tex of [map, normalMap]) {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(repeat, repeat);
        tex.anisotropy = 4;
      }
      return { map, normalMap };
    };

    const [grass, dirt, stone, sand, snow, env, ...natureGltfs] = await Promise.all([
      loadGround('grass', 1),
      loadGround('dirt', 1),
      loadGround('stone', 1),
      loadGround('sand', 1),
      loadGround('snow', 1),
      new RGBELoader().loadAsync('assets/env/sky_1k.hdr'),
      ...NATURE_FILES.map((f) => this.gltfLoader.loadAsync(`assets/nature/${f}.glb`)),
    ]);

    this.ground = { grass, dirt, stone, sand, snow };
    env.mapping = THREE.EquirectangularReflectionMapping;
    this.envMap = env;

    NATURE_FILES.forEach((file, i) => {
      const gltf = natureGltfs[i] as GLTF;
      // Unwrap single wrapper nodes (e.g. "RootNode") so each child is one variant.
      let level: THREE.Object3D = gltf.scene;
      while (level.children.length === 1 && !(level.children[0] as THREE.Mesh).isMesh) {
        level = level.children[0];
      }
      const variants: PropVariant[] = [];
      for (const child of level.children) {
        const parts = collectMeshParts(child);
        if (parts.length > 0) variants.push(parts);
      }
      this.natureVariants.set(file, variants);
    });

    const markShared = (scene: THREE.Group): THREE.Group => {
      scene.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.userData.sharedGeometry = true;
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const mat of materials) mat.userData.sharedMaterial = true;
        }
      });
      return scene;
    };

    const [townGltfs, villageGltfs] = await Promise.all([
      Promise.all(TOWN_PIECES.map((p) => this.gltfLoader.loadAsync(`assets/town/${p}.glb`))),
      Promise.all(VILLAGE_MODELS.map((m) => this.gltfLoader.loadAsync(`assets/village/${m}.glb`))),
    ]);
    TOWN_PIECES.forEach((piece, i) => this.townTemplates.set(piece, markShared(townGltfs[i].scene)));
    VILLAGE_MODELS.forEach((model, i) => this.villageTemplates.set(model, markShared(villageGltfs[i].scene)));
  }

  /** A fresh clone of a complete village building/prop (shares geometry+materials with the template). */
  villageClone(model: VillageModel): THREE.Object3D {
    const template = this.villageTemplates.get(model);
    if (!template) throw new Error(`Village model not loaded: ${model}`);
    return template.clone(true);
  }

  nature(file: (typeof NATURE_FILES)[number]): PropVariant[] {
    return this.natureVariants.get(file) ?? [];
  }

  treesForBiome(biome: Biome): PropVariant[] {
    return BIOME_TREE_FILES[biome].flatMap((file) => this.nature(file));
  }

  /** A fresh clone of a Kenney town module, ready to place (shares geometry with the template). */
  townClone(piece: TownPiece): THREE.Object3D {
    const template = this.townTemplates.get(piece);
    if (!template) throw new Error(`Town piece not loaded: ${piece}`);
    return template.clone(true);
  }

  /** Instancing-ready mesh parts of a town module (transforms baked relative to its root). */
  townParts(piece: TownPiece): PropVariant {
    const template = this.townTemplates.get(piece);
    if (!template) throw new Error(`Town piece not loaded: ${piece}`);
    return collectMeshParts(template);
  }

  /**
   * Loads (once) an animated GLB — creature monster or humanoid character.
   * `path` is relative to public/, e.g. 'assets/creatures/Bunny.glb'.
   */
  animatedTemplate(path: string): Promise<CreatureTemplate> {
    let promise = this.creatureCache.get(path);
    if (!promise) {
      promise = this.gltfLoader.loadAsync(path).then((gltf) => {
        gltf.scene.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = true;
            mesh.userData.sharedGeometry = true;
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const mat of materials) mat.userData.sharedMaterial = true;
            // Skinned meshes are animated well outside their bind-pose bounds.
            mesh.frustumCulled = false;
          }
        });
        const box = new THREE.Box3().setFromObject(gltf.scene);
        return {
          scene: gltf.scene,
          clips: gltf.animations,
          height: Math.max(0.001, box.max.y - box.min.y),
          groundOffset: box.min.y,
        };
      });
      this.creatureCache.set(path, promise);
    }
    return promise;
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
