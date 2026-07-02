import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Species } from '../data/speciesSchema.ts';
import { getAssetLibrary } from './AssetLibrary.ts';
import { monsterModelForSpecies } from './creatureMapping.ts';

/**
 * Builds the 3D model of a species from its mapped Quaternius monster GLB
 * (see creatureMapping.ts). The GLB loads lazily: `object` is usable (add to
 * scene, position, scale) immediately, the skinned mesh pops in when ready.
 * The model is re-tinted with the species palette and re-scaled from the
 * species sprite descriptor, so every species keeps a distinct look.
 */

export type CreatureAnimState = 'idle' | 'walk' | 'attack' | 'hit' | 'faint';

export interface CreatureModelHandle {
  object: THREE.Object3D;
  /** Resolves once the GLB clone is attached and actions are available. */
  ready: Promise<void>;
  mixer?: THREE.AnimationMixer;
  actions?: Partial<Record<CreatureAnimState, THREE.AnimationAction>>;
  floats: boolean;
}

/** Clip names per animation state, first match wins (ground vs flying archetypes). */
const CLIP_NAMES: Record<CreatureAnimState, string[]> = {
  idle: ['Idle', 'Flying_Idle'],
  walk: ['Walk', 'Fast_Flying', 'Run'],
  attack: ['Punch', 'Bite_Front', 'Headbutt'],
  hit: ['HitReact', 'HitRecieve'],
  faint: ['Death'],
};

function findClip(clips: THREE.AnimationClip[], names: string[]): THREE.AnimationClip | undefined {
  for (const name of names) {
    const clip = clips.find((c) => c.name === name || c.name.endsWith(`|${name}`));
    if (clip) return clip;
  }
  return undefined;
}

/**
 * Re-tints the cloned model's materials from the species palette. Quaternius
 * monsters use consistently named flat-color materials: `X_Main` becomes the
 * primary colour, `X_Secondary` the secondary one, decorative parts (wings,
 * horns, spikes…) the accent. Eyes/teeth/mouth parts keep their colours.
 */
function tintMaterials(root: THREE.Object3D, palette: [string, string, string]): void {
  const primary = new THREE.Color(palette[0]);
  const secondary = new THREE.Color(palette[1]);
  const accent = new THREE.Color(palette[2]);
  const KEEP = /Eye|Teeth|Tongue|Mouth|Belt|Wood|Metal|Straps|Black/i;
  const ACCENT = /Wings|Horn|Gold|_Red|Spikes|Ears|Beak|Flaps|Hair|Petals/i;

  const seen = new Map<THREE.Material, THREE.Material>();
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const replaced = materials.map((mat) => {
      const cached = seen.get(mat);
      if (cached) return cached;
      const name = mat.name || '';
      let target: THREE.Color | undefined;
      if (KEEP.test(name)) target = undefined;
      else if (/_?Main/i.test(name)) target = primary;
      else if (/Secondary/i.test(name)) target = secondary;
      else if (ACCENT.test(name)) target = accent;
      else target = primary;
      if (!target) {
        seen.set(mat, mat);
        return mat;
      }
      const tinted = (mat as THREE.MeshStandardMaterial).clone();
      tinted.color.copy(target);
      tinted.userData = {}; // owned by this instance, disposable
      seen.set(mat, tinted);
      return tinted;
    });
    mesh.material = Array.isArray(mesh.material) ? replaced : replaced[0];
  });
}

export function buildCreatureModel(species: Species): CreatureModelHandle {
  const object = new THREE.Object3D();
  const sprite = species.sprite;
  const floats = sprite.bodyShape === 'floating';

  const handle: CreatureModelHandle = {
    object,
    floats,
    ready: Promise.resolve(),
  };

  const model = monsterModelForSpecies(species.id);
  handle.ready = getAssetLibrary()
    .animatedTemplate(`assets/creatures/${model}.glb`)
    .then((template) => {
      const inner = cloneSkeleton(template.scene);
      tintMaterials(inner, sprite.palette);
      // Normalize: species sprite size ~0.6 (tiny) to 1.8 (legendary), matching
      // the footprint the previous procedural models had (~1.2 units per size).
      const scale = (sprite.size * 1.3) / template.height;
      inner.scale.setScalar(scale);
      // Drop grounded models to the floor; keep the authored hover of flyers.
      if (template.groundOffset < 0.05) inner.position.y = -template.groundOffset * scale;
      object.add(inner);

      const mixer = new THREE.AnimationMixer(inner);
      const actions: CreatureModelHandle['actions'] = {};
      for (const state of Object.keys(CLIP_NAMES) as CreatureAnimState[]) {
        const clip = findClip(template.clips, CLIP_NAMES[state]);
        if (!clip) continue;
        const action = mixer.clipAction(clip);
        if (state === 'attack' || state === 'hit' || state === 'faint') {
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
        }
        actions[state] = action;
      }
      handle.mixer = mixer;
      handle.actions = actions;
      actions.idle?.play();
    })
    .catch((err) => {
      console.error(`Creature model failed to load (${model})`, err);
    });

  return handle;
}
