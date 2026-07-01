import * as THREE from 'three';
import type { SpeciesSprite } from '../data/speciesSchema.ts';
import { organicNoiseTexture } from './TextureFactory.ts';

/**
 * Builds a deterministic low-poly 3D model for a species purely from its
 * `SpeciesSprite` descriptor — no external art assets are used anywhere in
 * this project. The same descriptor always yields the same shape. Every part
 * shares one small mottled noise texture (tinted per-species via `color`) so
 * surfaces read as organic skin/scale/fur rather than flat plastic.
 */

function mat(color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, map: organicNoiseTexture(), roughness: 0.6, metalness: 0.05, ...extra });
}

function addEyes(parent: THREE.Object3D, style: SpeciesSprite['eyeStyle'], headRadius: number): void {
  const eyeColor = style === 'glow' ? '#eaffb0' : '#12130f';
  const eyeMat = mat(eyeColor, style === 'glow' ? { emissive: '#a9ff6b', emissiveIntensity: 1.2 } : {});
  const count = style === 'multi' ? 4 : 2;
  const eyeSize = style === 'sharp' ? headRadius * 0.12 : headRadius * 0.16;
  for (let i = 0; i < count; i += 1) {
    const geom = style === 'sharp'
      ? new THREE.ConeGeometry(eyeSize, eyeSize * 1.4, 4)
      : new THREE.SphereGeometry(eyeSize, 8, 6);
    const eye = new THREE.Mesh(geom, eyeMat);
    const spread = headRadius * (count === 4 ? 0.55 : 0.5);
    const row = Math.floor(i / 2);
    const side = i % 2 === 0 ? -1 : 1;
    eye.position.set(side * spread, headRadius * 0.15 - row * headRadius * 0.4, headRadius * 0.85);
    if (style === 'sleepy') eye.scale.set(1, 0.35, 0.6);
    parent.add(eye);
  }
}

function buildBody(sprite: SpeciesSprite, primary: THREE.MeshStandardMaterial): THREE.Object3D {
  const group = new THREE.Object3D();
  const s = sprite.size;

  switch (sprite.bodyShape) {
    case 'quadruped': {
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.42 * s, 0.6 * s, 2, 8), primary);
      torso.rotation.z = Math.PI / 2;
      torso.position.y = 0.55 * s;
      group.add(torso);
      const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34 * s, 1), primary);
      head.position.set(0, 0.62 * s, 0.55 * s);
      group.add(head);
      addEyes(head, sprite.eyeStyle, 0.34 * s);
      for (const [dx, dz] of [[-0.28, 0.32], [0.28, 0.32], [-0.28, -0.32], [0.28, -0.32]] as const) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1 * s, 0.11 * s, 0.42 * s, 6), primary);
        leg.position.set(dx * s, 0.21 * s, dz * s);
        group.add(leg);
      }
      group.userData.headRef = head;
      break;
    }
    case 'biped': {
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.32 * s, 0.5 * s, 2, 8), primary);
      torso.position.y = 0.75 * s;
      group.add(torso);
      const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3 * s, 1), primary);
      head.position.set(0, 1.25 * s, 0.05 * s);
      group.add(head);
      addEyes(head, sprite.eyeStyle, 0.3 * s);
      for (const dx of [-0.22, 0.22]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.11 * s, 0.13 * s, 0.5 * s, 6), primary);
        leg.position.set(dx * s, 0.25 * s, 0);
        group.add(leg);
        const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.08 * s, 0.32 * s, 2, 6), primary);
        arm.position.set(dx * 1.7 * s, 0.85 * s, 0);
        arm.rotation.z = dx < 0 ? 0.3 : -0.3;
        group.add(arm);
      }
      group.userData.headRef = head;
      break;
    }
    case 'serpentine': {
      const segCount = 5;
      let prevY = 0.3 * s;
      for (let i = 0; i < segCount; i += 1) {
        const radius = 0.32 * s * (1 - i * 0.11);
        const seg = new THREE.Mesh(new THREE.SphereGeometry(radius, 8, 6), primary);
        seg.position.set(0, prevY, 0.3 * s - i * 0.26 * s);
        group.add(seg);
        if (i === 0) {
          addEyes(seg, sprite.eyeStyle, radius);
          group.userData.headRef = seg;
        }
        prevY += 0.02 * s;
      }
      break;
    }
    case 'avian': {
      const torso = new THREE.Mesh(new THREE.ConeGeometry(0.3 * s, 0.7 * s, 6), primary);
      torso.rotation.x = Math.PI;
      torso.position.y = 0.55 * s;
      group.add(torso);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.24 * s, 8, 6), primary);
      head.position.set(0, 0.95 * s, 0.1 * s);
      group.add(head);
      addEyes(head, sprite.eyeStyle, 0.24 * s);
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.07 * s, 0.22 * s, 5), mat('#e8b23a'));
      beak.rotation.x = Math.PI / 2;
      beak.position.set(0, 0.92 * s, 0.32 * s);
      group.add(beak);
      group.userData.headRef = head;
      break;
    }
    case 'insectoid': {
      const thorax = new THREE.Mesh(new THREE.SphereGeometry(0.3 * s, 8, 6), primary);
      thorax.position.y = 0.4 * s;
      group.add(thorax);
      const abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.24 * s, 8, 6), primary);
      abdomen.scale.set(1, 1, 1.4);
      abdomen.position.set(0, 0.4 * s, -0.4 * s);
      group.add(abdomen);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.18 * s, 8, 6), primary);
      head.position.set(0, 0.45 * s, 0.32 * s);
      group.add(head);
      addEyes(head, sprite.eyeStyle, 0.18 * s);
      for (const [dx, dz] of [[-0.3, 0.1], [0.3, 0.1], [-0.3, -0.1], [0.3, -0.1], [-0.3, -0.3], [0.3, -0.3]] as const) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * s, 0.03 * s, 0.3 * s, 5), primary);
        leg.position.set(dx * s, 0.2 * s, dz * s);
        leg.rotation.z = dx < 0 ? 0.6 : -0.6;
        group.add(leg);
      }
      group.userData.headRef = head;
      break;
    }
    case 'aquatic': {
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34 * s, 0.5 * s, 2, 8), primary);
      body.rotation.z = Math.PI / 2;
      body.position.y = 0.4 * s;
      group.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.28 * s, 8, 6), primary);
      head.position.set(0, 0.4 * s, 0.5 * s);
      group.add(head);
      addEyes(head, sprite.eyeStyle, 0.28 * s);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.28 * s, 0.4 * s, 4), primary);
      tail.rotation.x = -Math.PI / 2;
      tail.position.set(0, 0.4 * s, -0.55 * s);
      group.add(tail);
      group.userData.headRef = head;
      break;
    }
    case 'floating': {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.4 * s, 10, 8), primary);
      body.position.y = 0.8 * s;
      group.add(body);
      addEyes(body, sprite.eyeStyle, 0.4 * s);
      group.userData.headRef = body;
      group.userData.floats = true;
      break;
    }
    case 'plant': {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * s, 0.36 * s, 0.4 * s, 8), mat('#6b4a2f'));
      pot.position.y = 0.2 * s;
      group.add(pot);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.3 * s, 8, 6), primary);
      bulb.position.y = 0.55 * s;
      group.add(bulb);
      addEyes(bulb, sprite.eyeStyle, 0.3 * s);
      group.userData.headRef = bulb;
      break;
    }
    case 'crystalline': {
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.36 * s, 1), primary);
      core.position.y = 0.6 * s;
      group.add(core);
      addEyes(core, sprite.eyeStyle, 0.36 * s);
      group.userData.headRef = core;
      break;
    }
    case 'blob':
    case 'small':
    default: {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.36 * s, 10, 8), primary);
      body.scale.set(1, 0.85, 1);
      body.position.y = 0.36 * s;
      group.add(body);
      addEyes(body, sprite.eyeStyle, 0.36 * s);
      group.userData.headRef = body;
      break;
    }
  }

  return group;
}

function applyPattern(root: THREE.Object3D, sprite: SpeciesSprite, secondary: THREE.MeshStandardMaterial, accent: THREE.MeshStandardMaterial): void {
  const meshes: THREE.Mesh[] = [];
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) meshes.push(child);
  });
  if (meshes.length === 0) return;

  switch (sprite.pattern) {
    case 'stripes':
      meshes.forEach((m, i) => { if (i % 2 === 0) m.material = secondary; });
      break;
    case 'spots': {
      const box = new THREE.Box3().setFromObject(root);
      const size = new THREE.Vector3();
      box.getSize(size);
      const spotCount = 3;
      for (let i = 0; i < spotCount; i += 1) {
        const spot = new THREE.Mesh(new THREE.SphereGeometry(size.x * 0.08, 6, 5), accent);
        spot.position.set((Math.random() - 0.5) * size.x * 0.6, box.max.y * (0.4 + i * 0.15), size.z * 0.35);
        root.add(spot);
      }
      break;
    }
    case 'gradient':
      meshes.forEach((m, i) => { if (i > meshes.length / 2) m.material = secondary; });
      break;
    case 'shell': {
      const head = root.userData.headRef as THREE.Object3D | undefined;
      const shellSize = 0.4 * sprite.size;
      const shell = new THREE.Mesh(new THREE.SphereGeometry(shellSize, 8, 6, 0, Math.PI * 2, 0, Math.PI / 1.6), secondary);
      shell.position.set(0, (head?.position.y ?? 0.4) - shellSize * 0.2, -shellSize * 0.1);
      root.add(shell);
      break;
    }
    case 'crystal': {
      for (let i = 0; i < 3; i += 1) {
        const shard = new THREE.Mesh(new THREE.ConeGeometry(0.06 * sprite.size, 0.22 * sprite.size, 4), accent);
        shard.position.set((i - 1) * 0.16 * sprite.size, 0.9 * sprite.size, 0);
        root.add(shard);
      }
      break;
    }
    case 'flame': {
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.14 * sprite.size, 0.4 * sprite.size, 6), accent);
      flame.position.set(0, 0.3 * sprite.size, -0.4 * sprite.size);
      root.add(flame);
      break;
    }
    case 'fluffy':
      meshes.forEach((m) => { m.material = secondary; });
      break;
    case 'solid':
    default:
      break;
  }
}

function addExtras(root: THREE.Object3D, sprite: SpeciesSprite, accent: THREE.MeshStandardMaterial): void {
  const head = (root.userData.headRef as THREE.Object3D | undefined) ?? root;
  const s = sprite.size;

  if (sprite.hasWings) {
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.ConeGeometry(0.05 * s, 0.5 * s, 4), accent);
      wing.rotation.z = side * Math.PI * 0.32;
      wing.rotation.x = Math.PI / 2;
      wing.position.set(side * 0.4 * s, 0.6 * s, -0.1 * s);
      wing.name = 'wing';
      root.add(wing);
    }
  }

  if (sprite.hasTail) {
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.09 * s, 0.4 * s, 5), accent);
    tail.rotation.x = Math.PI / 2.2;
    tail.position.set(0, 0.35 * s, -0.5 * s);
    tail.name = 'tail';
    root.add(tail);
  }

  if (sprite.hornStyle && sprite.hornStyle !== 'none') {
    const hornGeom = new THREE.ConeGeometry(0.05 * s, 0.22 * s, 5);
    const positions: [number, number, number][] =
      sprite.hornStyle === 'double' ? [[-0.12, 1, 0], [0.12, 1, 0]] :
      sprite.hornStyle === 'antler' ? [[-0.14, 1, 0], [0.14, 1, 0], [0, 1.05, 0.05]] :
      [[0, 1, 0]];
    for (const [dx, dyMult, dz] of positions) {
      const horn = new THREE.Mesh(hornGeom, accent);
      horn.position.set(dx * s, head.position.y + 0.28 * s * dyMult, (head.position.z ?? 0) + dz * s);
      root.add(horn);
    }
  }
}

export interface CreatureModelHandle {
  object: THREE.Object3D;
  head?: THREE.Object3D;
  floats: boolean;
}

export function buildCreatureModel(sprite: SpeciesSprite): CreatureModelHandle {
  const primary = mat(sprite.palette[0]);
  const secondary = mat(sprite.palette[1]);
  const accent = mat(sprite.palette[2], { roughness: 0.35 });

  const root = buildBody(sprite, primary);
  applyPattern(root, sprite, secondary, accent);
  addExtras(root, sprite, accent);
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  return {
    object: root,
    head: root.userData.headRef as THREE.Object3D | undefined,
    floats: !!root.userData.floats,
  };
}
