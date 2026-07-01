import * as THREE from 'three';
import { organicNoiseTexture } from './TextureFactory.ts';

export interface HumanoidPalette {
  skin: string;
  outfit: string;
  outfitAccent: string;
  hair: string;
}

export const PALETTES: Record<string, HumanoidPalette> = {
  player: { skin: '#e3b18a', outfit: '#3a6b9e', outfitAccent: '#e8c93a', hair: '#3a2a1e' },
  rival: { skin: '#e3b18a', outfit: '#9e3a3a', outfitAccent: '#2a2a2a', hair: '#c94a2a' },
  professor: { skin: '#d8a97a', outfit: '#e8e4d8', outfitAccent: '#5a5a5a', hair: '#cfcfcf' },
  youth: { skin: '#e3b18a', outfit: '#5a9e5a', outfitAccent: '#e8e4d8', hair: '#2a2a2a' },
  lass: { skin: '#e3b18a', outfit: '#c94a8a', outfitAccent: '#e8e4d8', hair: '#5a2a1e' },
  hiker: { skin: '#c98a5a', outfit: '#8a6a3a', outfitAccent: '#3a2a1e', hair: '#1e1e1e' },
  fisher: { skin: '#c98a5a', outfit: '#3a8a9e', outfitAccent: '#e8c93a', hair: '#5a5a5a' },
  scientist: { skin: '#e3b18a', outfit: '#e8e4d8', outfitAccent: '#3a6b9e', hair: '#2a2a2a' },
  elder: { skin: '#d8a97a', outfit: '#5a3a6b', outfitAccent: '#e8e4d8', hair: '#e8e4d8' },
  ranger: { skin: '#c98a5a', outfit: '#3a6b3a', outfitAccent: '#c9a25c', hair: '#3a2a1e' },
  gymLeader: { skin: '#e3b18a', outfit: '#2a2a3a', outfitAccent: '#e8c93a', hair: '#8a3ac4' },
  villain: { skin: '#d8a97a', outfit: '#4a2a4a', outfitAccent: '#c94a4a', hair: '#1e1e1e' },
};

export function buildHumanoid(paletteKey: keyof typeof PALETTES | string): THREE.Object3D {
  const palette = PALETTES[paletteKey] ?? PALETTES.youth;
  const group = new THREE.Object3D();

  const noise = organicNoiseTexture();
  const skinMat = new THREE.MeshStandardMaterial({ color: palette.skin, map: noise, roughness: 0.7 });
  const outfitMat = new THREE.MeshStandardMaterial({ color: palette.outfit, map: noise, roughness: 0.85 });
  const accentMat = new THREE.MeshStandardMaterial({ color: palette.outfitAccent, map: noise, roughness: 0.85 });
  const hairMat = new THREE.MeshStandardMaterial({ color: palette.hair, map: noise, roughness: 0.6 });

  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.7, 6), accentMat);
  legs.position.y = 0.35;
  group.add(legs);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.5, 2, 8), outfitMat);
  torso.position.y = 1.0;
  group.add(torso);

  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.4, 2, 6), outfitMat);
    arm.position.set(side * 0.32, 1.0, 0);
    arm.name = side < 0 ? 'armLeft' : 'armRight';
    group.add(arm);
  }

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skinMat);
  head.position.y = 1.55;
  group.add(head);

  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.27, 8, 6, 0, Math.PI * 2, 0, Math.PI / 1.8), hairMat);
  hair.position.y = 1.62;
  group.add(hair);

  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), new THREE.MeshStandardMaterial({ color: '#12130f' }));
    eye.position.set(side * 0.09, 1.56, 0.23);
    group.add(eye);
  }

  group.traverse((child) => {
    if (child instanceof THREE.Mesh) { child.castShadow = true; child.receiveShadow = true; }
  });
  group.userData.legPair = legs;
  return group;
}
