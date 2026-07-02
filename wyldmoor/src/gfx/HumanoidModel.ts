import * as THREE from 'three';
import { organicNoiseTexture } from './TextureFactory.ts';

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

export interface HumanoidRig {
  legLeft: THREE.Object3D;
  legRight: THREE.Object3D;
  armLeft: THREE.Object3D;
  armRight: THREE.Object3D;
}

/**
 * Builds a stylized humanoid ~1.7 units tall with separately-pivoted limbs
 * (pivot groups at hip/shoulder height) so the walk cycle can swing them.
 * The rig is stashed in `userData.rig`.
 */
export function buildHumanoid(paletteKey: keyof typeof PALETTES | string): THREE.Object3D {
  const palette = PALETTES[paletteKey] ?? PALETTES.youth;
  const group = new THREE.Object3D();
  const noise = organicNoiseTexture();

  const skinMat = new THREE.MeshStandardMaterial({ color: palette.skin, map: noise, roughness: 0.65 });
  const outfitMat = new THREE.MeshStandardMaterial({ color: palette.outfit, map: noise, roughness: 0.85 });
  const accentMat = new THREE.MeshStandardMaterial({ color: palette.outfitAccent, map: noise, roughness: 0.85 });
  const hairMat = new THREE.MeshStandardMaterial({ color: palette.hair, map: noise, roughness: 0.55 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: '#2e2620', map: noise, roughness: 0.7 });

  const makeLimb = (
    pivotY: number,
    pivotX: number,
    radius: number,
    length: number,
    material: THREE.Material,
    withShoe: boolean,
  ): THREE.Object3D => {
    const pivot = new THREE.Object3D();
    pivot.position.set(pivotX, pivotY, 0);
    const limb = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 3, 8), material);
    limb.position.y = -(length / 2 + radius * 0.5);
    pivot.add(limb);
    if (withShoe) {
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(radius * 2.3, radius * 1.3, radius * 3.4), shoeMat);
      shoe.position.set(0, -(length + radius * 1.4), radius * 0.7);
      pivot.add(shoe);
    }
    return pivot;
  };

  // Legs pivot at the hips.
  const legLeft = makeLimb(0.82, -0.13, 0.09, 0.56, accentMat, true);
  const legRight = makeLimb(0.82, 0.13, 0.09, 0.56, accentMat, true);
  group.add(legLeft, legRight);

  // Torso: jacket with slight taper.
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.44, 4, 10), outfitMat);
  torso.position.y = 1.12;
  torso.scale.set(1, 1, 0.8);
  group.add(torso);

  // Arms pivot at the shoulders.
  const armLeft = makeLimb(1.32, -0.3, 0.07, 0.42, outfitMat, false);
  const armRight = makeLimb(1.32, 0.3, 0.07, 0.42, outfitMat, false);
  group.add(armLeft, armRight);
  for (const arm of [armLeft, armRight]) {
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), skinMat);
    hand.position.y = -0.56;
    arm.add(hand);
  }

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), skinMat);
  head.position.y = 1.66;
  head.scale.set(1, 1.05, 1);
  group.add(head);

  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.25, 14, 10, 0, Math.PI * 2, 0, Math.PI / 1.9), hairMat);
  hair.position.y = 1.72;
  group.add(hair);

  if (palette.cap) {
    const capMat = new THREE.MeshStandardMaterial({ color: palette.cap, map: noise, roughness: 0.7 });
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2.4), capMat);
    cap.position.y = 1.76;
    group.add(cap);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.03, 12, 1, false, -Math.PI / 3, Math.PI / 1.5), capMat);
    brim.position.set(0, 1.82, 0.2);
    brim.rotation.x = -0.15;
    group.add(brim);
  }

  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), new THREE.MeshStandardMaterial({ color: '#12130f' }));
    eye.position.set(side * 0.085, 1.68, 0.215);
    group.add(eye);
  }

  group.traverse((child) => {
    if (child instanceof THREE.Mesh) { child.castShadow = true; child.receiveShadow = true; }
  });

  const rig: HumanoidRig = { legLeft, legRight, armLeft, armRight };
  group.userData.rig = rig;
  // Back-compat: previous animation code rotated a single legPair object.
  group.userData.legPair = legLeft;
  return group;
}

/** Drives the limb swing; phase advances while walking, limbs settle when idle. */
export function animateHumanoidWalk(group: THREE.Object3D, phase: number, walking: boolean): void {
  const rig = group.userData.rig as HumanoidRig | undefined;
  if (!rig) return;
  if (walking) {
    const swing = Math.sin(phase) * 0.55;
    rig.legLeft.rotation.x = swing;
    rig.legRight.rotation.x = -swing;
    rig.armLeft.rotation.x = -swing * 0.7;
    rig.armRight.rotation.x = swing * 0.7;
  } else {
    for (const limb of [rig.legLeft, rig.legRight, rig.armLeft, rig.armRight]) {
      limb.rotation.x *= 0.82;
    }
  }
}
