import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Hero 3D : noyau de données (GLB exporté depuis Blender) sur fond clair.
// L'icosaèdre procédural s'affiche tout de suite et sert de repli si le GLB échoue.

const BLUE = new THREE.Color('#2f5bff');
const VIOLET = new THREE.Color('#7c3aed');

type SceneState = 'none' | 'fallback' | 'glb';

export function initScene(canvas: HTMLCanvasElement): void {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const setState = (s: SceneState): void => {
    canvas.dataset.scene = s;
  };

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    setState('none');
    return;
  }

  let pixelRatio = Math.min(window.devicePixelRatio, 1.75);
  renderer.setPixelRatio(pixelRatio);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const key = new THREE.DirectionalLight('#ffffff', 1.6);
  key.position.set(3, 4, 5);
  scene.add(key, new THREE.HemisphereLight('#ffffff', '#dfe3f5', 0.6));

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
  camera.position.set(0, 0.2, 7.2);

  const pivot = new THREE.Group();
  scene.add(pivot);

  // --- Repli procédural, visible immédiatement
  const fallback = new THREE.Group();
  const shell = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.3, 1),
    new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35, wireframe: true })
  );
  const inner = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.75, 2),
    new THREE.MeshStandardMaterial({ color: BLUE, emissive: BLUE, emissiveIntensity: 1.2, roughness: 0.3 })
  );
  fallback.add(shell, inner);
  pivot.add(fallback);
  setState('fallback');

  // --- Particules en orbite (NormalBlending : l'additif disparaît sur fond blanc)
  const COUNT = 260;
  const pos = new Float32Array(COUNT * 3);
  const col = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    const r = 2.1 + Math.random() * 0.9;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    pos.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph) * 0.55, r * Math.sin(ph) * Math.sin(th)], i * 3);
    const c = Math.random() < 0.5 ? BLUE : VIOLET;
    col.set([c.r, c.g, c.b], i * 3);
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const particles = new THREE.Points(
    pGeo,
    new THREE.PointsMaterial({ size: 0.035, vertexColors: true, transparent: true, opacity: 0.75, depthWrite: false })
  );
  scene.add(particles);

  let ringA: THREE.Object3D | null = null;
  let ringB: THREE.Object3D | null = null;
  let running = false;

  function resize(): void {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  const pointer = { x: 0, y: 0 };
  window.addEventListener(
    'pointermove',
    (e) => {
      pointer.x = (e.clientX / window.innerWidth - 0.5) * 2;
      pointer.y = (e.clientY / window.innerHeight - 0.5) * 2;
    },
    { passive: true }
  );

  const clock = new THREE.Clock();

  // Qualité adaptative : si le GPU peine (appareil modeste, rendu logiciel), on baisse la résolution.
  let slowFrames = 0;

  function renderFrame(): void {
    const raw = clock.getDelta();
    const dt = Math.min(raw, 0.05);
    if (running && pixelRatio > 1) {
      slowFrames = raw > 0.045 ? slowFrames + 1 : 0;
      if (slowFrames > 20) {
        pixelRatio = 1;
        renderer.setPixelRatio(pixelRatio);
        resize();
        slowFrames = 0;
      }
    }
    if (!reduced) {
      pivot.rotation.y += dt * 0.22;
      pivot.rotation.x += (pointer.y * 0.25 - pivot.rotation.x) * 0.05;
      pivot.rotation.z += (-pointer.x * 0.12 - pivot.rotation.z) * 0.05;
      if (ringA) ringA.rotateY(dt * 0.35);
      if (ringB) ringB.rotateY(-dt * 0.25);
      fallback.rotation.x += dt * 0.1;
      particles.rotation.y -= dt * 0.05;
    }
    renderer.render(scene, camera);
  }

  function start(): void {
    if (reduced || running) return;
    running = true;
    clock.getDelta();
    renderer.setAnimationLoop(renderFrame);
  }

  function stop(): void {
    running = false;
    renderer.setAnimationLoop(null);
  }

  resize();
  window.addEventListener('resize', () => {
    resize();
    if (!running) renderFrame();
  });

  // Ne tourner que si le hero est visible et l'onglet actif
  let inView = true;
  const sync = (): void => {
    if (inView && !document.hidden) start();
    else stop();
  };
  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    sync();
  }).observe(canvas);
  // Filet de sécurité : sous forte charge, l'observer peut être retardé ; le scroll coupe la boucle tout de suite.
  window.addEventListener(
    'scroll',
    () => {
      const r = canvas.getBoundingClientRect();
      const visible = r.bottom > 0 && r.top < window.innerHeight;
      if (visible !== inView) {
        inView = visible;
        sync();
      }
    },
    { passive: true }
  );
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else if (inView) start();
  });

  renderFrame();
  start();

  // --- Chargement du GLB Blender
  import('three/addons/loaders/GLTFLoader.js')
    .then(({ GLTFLoader }) => new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/core.glb`))
    .then((gltf) => {
      const model = gltf.scene;
      const lights: THREE.Object3D[] = [];
      model.traverse((o) => {
        if ((o as THREE.Light).isLight || (o as THREE.Camera).isCamera) lights.push(o);
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          const m = mesh.material as THREE.MeshPhysicalMaterial;
          if ('transmission' in m) m.transmission = 0;
          if (m.name === 'Ceramic_White') {
            m.envMapIntensity = 1.1;
            m.roughness = 0.34;
          } else if (m.name === 'Core_Glow') {
            // Émission modérée : la tone map désature les émissions fortes en blanc lavande.
            m.color.set('#2f5bff');
            m.emissive.set('#2f4bff');
            m.emissiveIntensity = 1.5;
          } else if (m.name === 'Core_Inner') {
            m.emissive.set('#8b5cf6');
            m.emissiveIntensity = 2.2;
          }
        }
      });
      lights.forEach((l) => l.removeFromParent());
      const root = model.getObjectByName('DataCore') ?? model;
      root.rotation.set(0, 0, 0);
      ringA = model.getObjectByName('RingA') ?? null;
      ringB = model.getObjectByName('RingB') ?? null;
      pivot.remove(fallback);
      pivot.add(model);
      setState('glb');
      if (!running) renderFrame();
    })
    .catch(() => {
      // Le repli procédural reste affiché.
    });
}
