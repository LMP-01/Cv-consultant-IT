import * as THREE from 'three';

// Scène "flux de données" : particules qui circulent le long de rubans,
// grille wireframe au sol, cœur icosaèdre, parallax souris.

const CYAN = new THREE.Color('#00f0ff');
const MAGENTA = new THREE.Color('#ff2d78');
const VIOLET = new THREE.Color('#7b5bff');

const STREAM_COUNT = 14;
const POINTS_PER_STREAM = 130;

export function initScene(canvas: HTMLCanvasElement): void {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    canvas.style.display = 'none';
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#05060f', 0.028);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 2.2, 16);

  // --- Grille sol, perspective "Tron" ---
  const grid = new THREE.GridHelper(160, 64, VIOLET, new THREE.Color('#101430'));
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.35;
  grid.position.y = -4.5;
  scene.add(grid);

  // --- Cœur : icosaèdre wireframe double couche ---
  const core = new THREE.Group();
  const icoOuter = new THREE.Mesh(
    new THREE.IcosahedronGeometry(2.4, 1),
    new THREE.MeshBasicMaterial({ color: CYAN, wireframe: true, transparent: true, opacity: 0.28 })
  );
  const icoInner = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.4, 0),
    new THREE.MeshBasicMaterial({ color: MAGENTA, wireframe: true, transparent: true, opacity: 0.4 })
  );
  core.add(icoOuter, icoInner);
  core.position.set(5.5, 1.5, 2);
  scene.add(core);

  // --- Rubans de flux de données : courbes + particules qui les parcourent ---
  const streams: { curve: THREE.CatmullRomCurve3; points: THREE.Points; offsets: Float32Array; speed: number }[] = [];
  const streamGroup = new THREE.Group();

  for (let s = 0; s < STREAM_COUNT; s++) {
    const y = -3 + (s / STREAM_COUNT) * 9 + (s % 3) * 0.4;
    const z = -6 + (s % 5) * 2.2;
    const amp = 1 + (s % 4) * 0.7;
    const ctrl: THREE.Vector3[] = [];
    for (let i = 0; i <= 6; i++) {
      const x = -34 + (i / 6) * 68;
      ctrl.push(new THREE.Vector3(x, y + Math.sin(i * 1.7 + s) * amp * 0.5, z + Math.cos(i * 1.3 + s * 2) * amp));
    }
    const curve = new THREE.CatmullRomCurve3(ctrl);

    const positions = new Float32Array(POINTS_PER_STREAM * 3);
    const colors = new Float32Array(POINTS_PER_STREAM * 3);
    const offsets = new Float32Array(POINTS_PER_STREAM);
    const col = s % 3 === 0 ? MAGENTA : s % 3 === 1 ? CYAN : VIOLET;
    for (let i = 0; i < POINTS_PER_STREAM; i++) {
      offsets[i] = Math.random();
      const p = curve.getPoint(offsets[i]);
      positions.set([p.x, p.y, p.z], i * 3);
      colors.set([col.r, col.g, col.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.09,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const points = new THREE.Points(geo, mat);
    streamGroup.add(points);
    streams.push({ curve, points, offsets, speed: 0.012 + (s % 5) * 0.006 });
  }
  scene.add(streamGroup);

  // --- Poussière d'étoiles en fond ---
  const dustCount = 700;
  const dustPos = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    dustPos.set([(Math.random() - 0.5) * 90, (Math.random() - 0.5) * 50, (Math.random() - 0.5) * 60 - 10], i * 3);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({ size: 0.05, color: '#5a6a9a', transparent: true, opacity: 0.6, depthWrite: false })
  );
  scene.add(dust);

  // --- Parallax souris + scroll ---
  const target = { x: 0, y: 0 };
  window.addEventListener('pointermove', (e) => {
    target.x = (e.clientX / window.innerWidth - 0.5) * 2;
    target.y = (e.clientY / window.innerHeight - 0.5) * 2;
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const clock = new THREE.Clock();

  function renderFrame(): void {
    const dt = clock.getDelta();
    const t = clock.elapsedTime;

    for (const s of streams) {
      const pos = s.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < POINTS_PER_STREAM; i++) {
        s.offsets[i] = (s.offsets[i] + s.speed * dt * 4) % 1;
        const p = s.curve.getPoint(s.offsets[i]);
        pos.setXYZ(i, p.x, p.y, p.z);
      }
      pos.needsUpdate = true;
    }

    core.rotation.y += dt * 0.25;
    core.rotation.x = Math.sin(t * 0.3) * 0.2;
    icoInner.rotation.y -= dt * 0.5;
    dust.rotation.y += dt * 0.008;

    const scrollDepth = window.scrollY / Math.max(1, document.body.scrollHeight - window.innerHeight);
    camera.position.x += (target.x * 1.6 - camera.position.x) * 0.04;
    camera.position.y += (2.2 - target.y * 1.2 - scrollDepth * 3 - camera.position.y) * 0.04;
    camera.lookAt(0, 0.5, 0);

    renderer.render(scene, camera);
  }

  if (prefersReducedMotion) {
    // Une seule frame statique : le décor sans le mouvement.
    renderFrame();
    return;
  }

  renderer.setAnimationLoop(renderFrame);

  // Pause quand l'onglet est caché (batterie mobile).
  document.addEventListener('visibilitychange', () => {
    renderer.setAnimationLoop(document.hidden ? null : renderFrame);
  });
}
