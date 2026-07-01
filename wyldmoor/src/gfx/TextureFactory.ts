import * as THREE from 'three';

/**
 * All ground/prop/creature surface detail in this project comes from canvas-drawn
 * textures generated at runtime — there is no external art pipeline. Every generator
 * here is memoized so each texture type is drawn once and reused across every
 * instance that needs it (a single grass texture is shared by every grass tile, etc).
 */

const cache = new Map<string, THREE.CanvasTexture>();

function makeCanvas(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  return { canvas, ctx };
}

function finish(key: string, canvas: HTMLCanvasElement, repeat: [number, number] = [1, 1]): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  cache.set(key, texture);
  return texture;
}

function speckle(ctx: CanvasRenderingContext2D, size: number, count: number, colorFn: () => string, minR: number, maxR: number): void {
  for (let i = 0; i < count; i += 1) {
    ctx.fillStyle = colorFn();
    const r = minR + Math.random() * (maxR - minR);
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function grassTexture(variant: 'short' | 'tall' = 'short'): THREE.CanvasTexture {
  const key = `grass-${variant}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const size = 128;
  const { canvas, ctx } = makeCanvas(size);
  const base = variant === 'tall' ? '#2e7a3a' : '#4f9a4a';
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  speckle(ctx, size, 90, () => (Math.random() > 0.5 ? '#3f8a44' : '#5cae55'), 1, 3);
  speckle(ctx, size, 20, () => '#2a5e30', 1, 2);

  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  for (let i = 0; i < 40; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 4, y - 6 - Math.random() * 6);
    ctx.stroke();
  }

  return finish(key, canvas);
}

export function dirtPathTexture(): THREE.CanvasTexture {
  const key = 'dirt-path';
  const cached = cache.get(key);
  if (cached) return cached;

  const size = 128;
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = '#c9b488';
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, 60, () => (Math.random() > 0.5 ? '#b89f6e' : '#d8c49a'), 1, 3);
  speckle(ctx, size, 14, () => '#8a744c', 2, 4);
  ctx.strokeStyle = 'rgba(80,64,40,0.15)';
  for (let i = 0; i < 6; i += 1) {
    ctx.beginPath();
    ctx.moveTo(Math.random() * size, Math.random() * size);
    ctx.quadraticCurveTo(Math.random() * size, Math.random() * size, Math.random() * size, Math.random() * size);
    ctx.stroke();
  }
  return finish(key, canvas);
}

export function sandTexture(): THREE.CanvasTexture {
  const key = 'sand';
  const cached = cache.get(key);
  if (cached) return cached;
  const size = 128;
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = '#e3d19a';
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, 120, () => (Math.random() > 0.5 ? '#d8c48a' : '#f0e0ae'), 0.5, 1.6);
  return finish(key, canvas);
}

export function stoneTexture(): THREE.CanvasTexture {
  const key = 'stone';
  const cached = cache.get(key);
  if (cached) return cached;
  const size = 128;
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = '#8a8478';
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, 50, () => (Math.random() > 0.5 ? '#767064' : '#9a9488'), 3, 9);
  ctx.strokeStyle = 'rgba(40,36,30,0.3)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 10; i += 1) {
    ctx.beginPath();
    ctx.moveTo(Math.random() * size, Math.random() * size);
    ctx.lineTo(Math.random() * size, Math.random() * size);
    ctx.stroke();
  }
  return finish(key, canvas);
}

export function barkTexture(): THREE.CanvasTexture {
  const key = 'bark';
  const cached = cache.get(key);
  if (cached) return cached;
  const size = 64;
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = '#6b4a2f';
  ctx.fillRect(0, 0, size, size);
  for (let x = 0; x < size; x += 4) {
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.08)';
    ctx.fillRect(x, 0, 2, size);
  }
  return finish(key, canvas, [1, 2]);
}

export function leafTexture(): THREE.CanvasTexture {
  const key = 'leaf';
  const cached = cache.get(key);
  if (cached) return cached;
  const size = 128;
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = '#2f7a3f';
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, 140, () => (Math.random() > 0.5 ? '#256b34' : '#3f9a4e'), 2, 6);
  speckle(ctx, size, 20, () => 'rgba(255,255,255,0.10)', 1, 3);
  return finish(key, canvas);
}

export function roofTexture(): THREE.CanvasTexture {
  const key = 'roof';
  const cached = cache.get(key);
  if (cached) return cached;
  const size = 128;
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = '#a4483f';
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 10) {
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, y, size, 2);
  }
  speckle(ctx, size, 40, () => (Math.random() > 0.5 ? '#8f3a32' : '#b8544a'), 2, 4);
  return finish(key, canvas, [1, 2]);
}

export function wallTexture(): THREE.CanvasTexture {
  const key = 'wall';
  const cached = cache.get(key);
  if (cached) return cached;
  const size = 128;
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = '#d7c9a3';
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, 200, () => 'rgba(120,100,70,0.08)', 0.5, 1.5);
  ctx.strokeStyle = 'rgba(120,100,70,0.25)';
  for (let y = 0; y < size; y += 24) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }
  return finish(key, canvas, [1, 1]);
}

export function fenceTexture(): THREE.CanvasTexture {
  const key = 'fence';
  const cached = cache.get(key);
  if (cached) return cached;
  const size = 64;
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = '#b08d5a';
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 3) {
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, y, size, 1);
  }
  return finish(key, canvas, [2, 1]);
}

export function waterTexture(): THREE.CanvasTexture {
  const key = 'water';
  const cached = cache.get(key);
  if (cached) return cached;
  const size = 128;
  const { canvas, ctx } = makeCanvas(size);
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#2e6bc9');
  gradient.addColorStop(1, '#4a92e0');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 10; i += 1) {
    const y = Math.random() * size;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(size * 0.3, y - 6, size * 0.7, y + 6, size, y);
    ctx.stroke();
  }
  speckle(ctx, size, 30, () => 'rgba(255,255,255,0.18)', 1, 2.5);
  return finish(key, canvas);
}

/** Shared subtle organic mottling reused (and tinted via `material.color`) by every creature and humanoid part. */
export function organicNoiseTexture(): THREE.CanvasTexture {
  const key = 'organic-noise';
  const cached = cache.get(key);
  if (cached) return cached;
  const size = 128;
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, 260, () => `rgba(0,0,0,${(0.03 + Math.random() * 0.07).toFixed(2)})`, 1, 4);
  speckle(ctx, size, 90, () => `rgba(255,255,255,${(0.04 + Math.random() * 0.06).toFixed(2)})`, 1, 3);
  return finish(key, canvas);
}
