import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { getAssetLibrary } from './AssetLibrary.ts';

/**
 * Humanoids are the CC0 Quaternius "Animated Men/Women" GLB characters
 * (see ASSETS.md), re-tinted per role with the palettes below (skin, outfit,
 * hair…) so every NPC role keeps its own look. The GLB loads lazily; the
 * returned object can be placed immediately.
 */

export interface HumanoidPalette {
  skin: string;
  outfit: string;
  outfitAccent: string;
  hair: string;
  cap?: string;
}

export const PALETTES: Record<string, HumanoidPalette> = {
  player: { skin: '#e3b18a', outfit: '#3a4a5e', outfitAccent: '#2a3140', hair: '#3a2a1e', cap: '#d94f4f' },
  rival: { skin: '#e3b18a', outfit: '#9e3a3a', outfitAccent: '#2a2a2a', hair: '#c94a2a' },
  professor: { skin: '#d8a97a', outfit: '#e8e4d8', outfitAccent: '#5a5a5a', hair: '#cfcfcf' },
  youth: { skin: '#e3b18a', outfit: '#5a9e5a', outfitAccent: '#3a5e3a', hair: '#2a2a2a', cap: '#3a6b9e' },
  lass: { skin: '#e3b18a', outfit: '#c94a8a', outfitAccent: '#8a3060', hair: '#5a2a1e' },
  hiker: { skin: '#c98a5a', outfit: '#8a6a3a', outfitAccent: '#5e4826', hair: '#1e1e1e' },
  fisher: { skin: '#c98a5a', outfit: '#3a8a9e', outfitAccent: '#28606e', hair: '#5a5a5a', cap: '#e8c93a' },
  scientist: { skin: '#e3b18a', outfit: '#e8e4d8', outfitAccent: '#b8b4a8', hair: '#2a2a2a' },
  elder: { skin: '#d8a97a', outfit: '#5a3a6b', outfitAccent: '#3e2849', hair: '#e8e4d8' },
  ranger: { skin: '#c98a5a', outfit: '#3a6b3a', outfitAccent: '#284a28', hair: '#3a2a1e', cap: '#c9a25c' },
  gymLeader: { skin: '#e3b18a', outfit: '#2a2a3a', outfitAccent: '#e8c93a', hair: '#8a3ac4' },
  villain: { skin: '#d8a97a', outfit: '#4a2a4a', outfitAccent: '#c94a4a', hair: '#1e1e1e' },
};

/** Which Quaternius character model plays each role. */
const ROLE_MODELS: Record<string, string> = {
  player: 'Man',
  rival: 'Man_in_Long_Sleeves',
  professor: 'Man_in_Suit',
  youth: 'Man',
  lass: 'Woman_Casual',
  hiker: 'Man_in_Long_Sleeves',
  fisher: 'Man',
  scientist: 'Man_in_Suit',
  elder: 'Woman_in_Dress',
  ranger: 'Man_in_Long_Sleeves',
  gymLeader: 'Woman_in_Tank_Top',
  villain: 'Man_in_Suit',
};

const HUMAN_HEIGHT = 1.7;
const FADE = 0.22;

interface HumanoidAnim {
  mixer: THREE.AnimationMixer;
  idle?: THREE.AnimationAction;
  walk?: THREE.AnimationAction;
  current?: THREE.AnimationAction;
}

function findClip(clips: THREE.AnimationClip[], suffix: string): THREE.AnimationClip | undefined {
  return clips.find((c) => c.name.endsWith(suffix));
}

/** Tints the character's flat-colour materials (Shirt, Pants, Skin, Hair…) from the palette. */
function tintHumanoid(root: THREE.Object3D, palette: HumanoidPalette): void {
  const groups: [RegExp, string][] = [
    [/^(Shirt2?|Jacket|LightJacket)$/i, palette.outfit],
    [/^(Pants|Details|TieTexture|Shoes|Socks)$/i, palette.outfitAccent],
    [/^Skin$/i, palette.skin],
    [/^(Hair2?|HairBase|Eyebrows)$/i, palette.hair],
  ];
  const seen = new Map<THREE.Material, THREE.Material>();
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const replaced = materials.map((mat) => {
      const cached = seen.get(mat);
      if (cached) return cached;
      const rule = groups.find(([re]) => re.test(mat.name || ''));
      if (!rule) {
        seen.set(mat, mat);
        return mat;
      }
      const tinted = (mat as THREE.MeshStandardMaterial).clone();
      tinted.color.set(rule[1]);
      tinted.userData = {};
      seen.set(mat, tinted);
      return tinted;
    });
    mesh.material = Array.isArray(mesh.material) ? replaced : replaced[0];
  });
}

/**
 * Builds a humanoid for the given role (palette key). The returned group can be
 * positioned/rotated immediately; the animated model attaches when loaded.
 */
export function buildHumanoid(paletteKey: keyof typeof PALETTES | string): THREE.Object3D {
  const palette = PALETTES[paletteKey] ?? PALETTES.youth;
  const model = ROLE_MODELS[paletteKey] ?? 'Man';
  const group = new THREE.Object3D();

  getAssetLibrary()
    .animatedTemplate(`assets/characters/${model}.glb`)
    .then((template) => {
      const inner = cloneSkeleton(template.scene);
      tintHumanoid(inner, palette);
      inner.scale.setScalar(HUMAN_HEIGHT / template.height);
      group.add(inner);

      const mixer = new THREE.AnimationMixer(inner);
      const anim: HumanoidAnim = { mixer };
      const idleClip = findClip(template.clips, '_Idle');
      const walkClip = findClip(template.clips, '_Walk');
      if (idleClip) anim.idle = mixer.clipAction(idleClip);
      if (walkClip) anim.walk = mixer.clipAction(walkClip);
      // Desynchronize NPCs sharing a template so they don't move in lockstep.
      anim.idle?.play();
      if (anim.idle) anim.idle.time = Math.random() * (idleClip?.duration ?? 1);
      anim.current = anim.idle;
      group.userData.anim = anim;
    })
    .catch((err) => console.error(`Character model failed to load (${model})`, err));

  return group;
}

/**
 * Advances the character animation. `dt` is the frame delta in seconds;
 * crossfades between the Idle and Walk GLTF clips based on `walking`.
 */
export function animateHumanoidWalk(group: THREE.Object3D, dt: number, walking: boolean): void {
  const anim = group.userData.anim as HumanoidAnim | undefined;
  if (!anim) return;
  const target = walking ? anim.walk ?? anim.idle : anim.idle;
  if (target && target !== anim.current) {
    target.reset();
    if (anim.current) target.crossFadeFrom(anim.current, FADE, false);
    target.play();
    anim.current = target;
  }
  anim.mixer.update(dt);
}
