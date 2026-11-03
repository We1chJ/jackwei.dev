// The résumé coming out: a small crumpled ball in the middle of the window bursts open into the page,
// landing flat on the exact pixels of the real one (ResumePages.tsx), which then takes over. The paper's
// frames come from paper.ts; the shading and normals here follow React Bits' PaperCrumple. Once flat the
// sheet is drawn unlit, so it matches the page.
import * as THREE from 'three';
import { PAPER_ASPECT, type Paper } from './paper';

const OPEN_S = 0.9;       // ball to flat page
const FADE_MS = 100;         // the real page shows through
const START = 0.2;           // the ball's size at the start, against its size at full scale
const SPIN = -1.1;           // radians the ball is turned from where the page ends up
const TUMBLE = 0.5;
const CREASE = 0.55;         // how much of the folds stays in while it opens
const PAPER_BACK = '#f4f0e8';
const SHADOW = 0.24;

let solving: Promise<Paper> | null = null;
/** Solves the paper once, off the main thread. */
export function preparePaper() {
  solving ??= new Promise<Paper>((resolve, reject) => {
    const worker = new Worker(new URL('./paper.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<Paper>) => { resolve(e.data); worker.terminate(); };
    worker.onerror = () => { solving = null; reject(new Error('paper: the solver failed')); worker.terminate(); };
  });
  return solving;
}

const smooth = THREE.MathUtils.smoothstep;
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

export interface Unfolding {
  opened: Promise<void>;   // flat: show the real page
  stop(): void;
}

/** Plays over `panel`, onto `page`, a canvas inside it. Throws if WebGL isn't available. */
export function unfold(panel: HTMLElement, page: HTMLCanvasElement, paper: Paper): Unfolding {
  const canvas = document.createElement('canvas');
  canvas.className = 'reel-paper';
  canvas.setAttribute('aria-hidden', 'true');
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  panel.after(canvas);
  const vw = innerWidth, vh = innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(vw, vh, false);
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const { rest, uvs, indices, samples, creased } = paper;
  const count = rest.length / 3;
  const positions = new Float32Array(count * 3);
  const drawn = new Float32Array(indices.length * 3), normals = new Float32Array(indices.length * 3), drawnUvs = new Float32Array(indices.length * 2);
  const faces = new Float32Array(indices.length);
  const touching: number[][] = Array.from({ length: count }, () => []);
  indices.forEach((v, i) => {
    drawnUvs[i * 2] = uvs[v * 2];
    drawnUvs[i * 2 + 1] = uvs[v * 2 + 1];
    touching[v].push(Math.floor(i / 3) * 3);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(drawn, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('uv', new THREE.BufferAttribute(drawnUvs, 2));

  const print = new THREE.CanvasTexture(page);
  print.colorSpace = THREE.SRGBColorSpace;
  print.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const lighting = { value: 1 };
  const material = (side: THREE.Side, map: THREE.Texture | null) => {
    const m = new THREE.MeshStandardMaterial({ side, map, color: map ? '#fff' : PAPER_BACK, roughness: 0.92, metalness: 0 });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.paperLighting = lighting;
      shader.fragmentShader = `uniform float paperLighting;\n${shader.fragmentShader}`.replace(
        '#include <opaque_fragment>',
        'outgoingLight = mix(diffuseColor.rgb, outgoingLight, paperLighting);\n#include <opaque_fragment>',
      );
    };
    return m;
  };
  const front = new THREE.Mesh(geometry, material(THREE.FrontSide, print));
  const back = new THREE.Mesh(geometry, material(THREE.BackSide, null));
  front.castShadow = front.receiveShadow = back.receiveShadow = true;
  front.frustumCulled = back.frustumCulled = false;
  const sheet = new THREE.Group();
  sheet.add(front, back);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, vw / vh, 0.1, 10000);
  camera.position.z = vh / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));   // z = 0 is 1:1 with the screen
  const reach = Math.max(vw, vh);
  const light = new THREE.DirectionalLight(0xfffaf0, 1.8);
  light.position.set(-0.57 * reach, 0.82 * reach, reach * 4);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.bias = -0.0002;
  light.shadow.normalBias = 0.6;
  light.shadow.radius = 3;
  Object.assign(light.shadow.camera, { left: -reach, bottom: -reach, right: reach, top: reach, near: 1, far: reach * 6 });
  const floorGeometry = new THREE.PlaneGeometry(reach * 4, reach * 4);
  const floorMaterial = new THREE.ShadowMaterial({ opacity: SHADOW, depthWrite: false });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.receiveShadow = true;
  scene.add(sheet, new THREE.HemisphereLight(0xffffff, 0xa4a0b0, 1.6), light, light.target, floor);

  // where the page lands: layout boxes, since the panel may still be mid-transition
  const w = page.offsetWidth, h = page.offsetHeight;
  const toX = page.offsetLeft - panel.scrollLeft + w / 2 - vw / 2, toY = vh / 2 - (page.offsetTop - panel.scrollTop + h / 2);
  const stretch = h / (w * PAPER_ASPECT);   // the solver assumes letter paper; this page may differ a little

  const shape = (fold: number, memory: number) => {
    const at = fold * (samples.length - 1), lower = Math.floor(at), upper = Math.min(lower + 1, samples.length - 1), mix = at - lower;
    const from = samples[lower], to = samples[upper];
    for (let i = 0; i < positions.length; i++) positions[i] = from[i] + (to[i] - from[i]) * mix + (creased[i] - rest[i]) * memory * (1 - fold);
    for (let f = 0; f < indices.length; f += 3) {
      const a = indices[f] * 3, b = indices[f + 1] * 3, c = indices[f + 2] * 3;
      const bx = positions[b] - positions[a], by = positions[b + 1] - positions[a + 1], bz = positions[b + 2] - positions[a + 2];
      const cx = positions[c] - positions[a], cy = positions[c + 1] - positions[a + 1], cz = positions[c + 2] - positions[a + 2];
      const nx = by * cz - bz * cy, ny = bz * cx - bx * cz, nz = bx * cy - by * cx, l = Math.hypot(nx, ny, nz) || 1;
      faces[f] = nx / l; faces[f + 1] = ny / l; faces[f + 2] = nz / l;
    }
    // normals blend across gentle bends and stay hard across a crease
    for (let i = 0; i < indices.length; i++) {
      const v = indices[i], source = v * 3, f = Math.floor(i / 3) * 3;
      let nx = 0, ny = 0, nz = 0;
      for (const other of touching[v]) {
        const dot = faces[f] * faces[other] + faces[f + 1] * faces[other + 1] + faces[f + 2] * faces[other + 2];
        const weight = smooth(dot, 0.81, 0.98);
        nx += faces[other] * weight; ny += faces[other + 1] * weight; nz += faces[other + 2] * weight;
      }
      const l = Math.hypot(nx, ny, nz) || 1;
      drawn[i * 3] = positions[source]; drawn[i * 3 + 1] = positions[source + 1]; drawn[i * 3 + 2] = positions[source + 2];
      normals[i * 3] = nx / l; normals[i * 3 + 1] = ny / l; normals[i * 3 + 2] = nz / l;
    }
    geometry.attributes.position.needsUpdate = geometry.attributes.normal.needsUpdate = true;
    lighting.value = smooth(fold + memory, 0, 0.4);
  };

  let raf = 0, timer = 0, stopped = false, start = 0, flat: () => void = () => {};
  const dispose = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    clearTimeout(timer);
    canvas.remove();
    geometry.dispose();
    floorGeometry.dispose();
    floorMaterial.dispose();
    front.material.dispose();
    back.material.dispose();
    print.dispose();
    light.shadow.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  };
  const opened = new Promise<void>((resolve) => { flat = resolve; });
  // compiles the shaders and uploads the page now, on the clip's still last frame, not on the ball's first
  shape(1, CREASE);
  sheet.scale.setScalar(0.001);
  renderer.render(scene, camera);
  const frame = (now: number) => {
    start ||= now;
    const open = Math.min(1, (now - start) / 1000 / OPEN_S);
    const out = easeOut(open), fold = 1 - out, turned = fold * fold;   // straight before it's wide, or it would run off the window
    shape(fold, CREASE * (1 - smooth(open, 0.5, 1)));
    const size = w * (START + (1 - START) * out);
    sheet.scale.set(size, size * stretch, size);
    sheet.rotation.set(TUMBLE * turned, -TUMBLE * turned, SPIN * turned);
    sheet.position.set(toX * out, toY * out, 0);
    floor.position.z = -w * (0.03 + 0.2 * fold);
    floorMaterial.opacity = SHADOW * (1 - smooth(open, 0.8, 1));
    renderer.render(scene, camera);
    if (open < 1) { raf = requestAnimationFrame(frame); return; }
    flat();
    canvas.style.opacity = '0';
    timer = window.setTimeout(dispose, FADE_MS);
  };
  raf = requestAnimationFrame(frame);
  return { opened, stop: dispose };
}
