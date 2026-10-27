// Review harness for the img2threejs pipeline: renders the generated factory with the
// reference camera and the look-dev lights, then flags readiness for a headless capture.
// Query params: ?az=<deg> azimuth, ?el=<deg> elevation, ?mode=neutral|grazing|reference,
// ?bg=<hex> background, ?ortho=1 for an orthographic review view.
import * as THREE from 'three';
import {
  createJackGachaCapsuleMachineModel,
  createJackGachaCapsuleMachineLookDevLights,
  createJackGachaCapsuleMachineEnvironment,
  frameJackGachaCapsuleMachineCamera,
  configureJackGachaCapsuleMachineRenderer,
  createJackGachaCapsuleMachineInspectControls,
} from '../../src/models/gacha/createGachaMachineModel';
import { refineGachaMachine } from '../../src/models/gacha/refineGachaMachine';

const q = new URLSearchParams(location.search);
const az = Number(q.get('az') ?? 0);
const el = Number(q.get('el') ?? 8);
const mode = (q.get('mode') ?? 'reference') as 'neutral' | 'grazing' | 'reference';
const bgParam = q.get('bg') ?? 'FFC800';          // 'none' = transparent (for silhouette gates)
const margin = Number(q.get('margin') ?? 1.12);   // frame margin: object height ~ 1/margin of the frame
const shift = Number(q.get('shift') ?? 0);        // world-units vertical shift of camera+target

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: bgParam === 'none' });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
configureJackGachaCapsuleMachineRenderer(renderer);
if (bgParam === 'none') {
  renderer.setClearColor(0x000000, 0);
  document.documentElement.style.background = 'transparent';
  document.body.style.background = 'transparent';
}
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
if (bgParam !== 'none') scene.background = new THREE.Color('#' + bgParam);
scene.environment = createJackGachaCapsuleMachineEnvironment(renderer);

const model = createJackGachaCapsuleMachineModel({ castShadow: true, receiveShadow: true });
if (q.get('refine') !== '0') refineGachaMachine(model);   // hand refinements (refine-code)
scene.add(model);
scene.add(createJackGachaCapsuleMachineLookDevLights(mode));

// Ground catcher for the contact shadow, just under the housing (?shadow=0 disables it for
// silhouette gates, where the long cast shadow would inflate the foreground mask).
if (q.get('shadow') !== '0') {
  const box = new THREE.Box3().setFromObject(model);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 10),
    new THREE.ShadowMaterial({ opacity: 0.18 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = box.min.y - 0.001;
  ground.receiveShadow = true;
  scene.add(ground);
}

const camera = new THREE.PerspectiveCamera(20, innerWidth / innerHeight, 0.1, 100);
frameJackGachaCapsuleMachineCamera(camera, model, { margin, azimuthDeg: az, elevationDeg: el });
if (shift !== 0) {
  // Reference layout has the machine in the upper part of the frame; move camera and target
  // together so the object rises in frame without changing perspective.
  const target = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
  camera.position.y += shift;
  target.y += shift;
  camera.lookAt(target);
  camera.updateProjectionMatrix();
}

(window as any).__gacha = { scene, model, camera, renderer, runtime: model.userData.sculptRuntime };

// Debug dump (read with chrome --dump-dom): world-space bounds of every named node.
if (q.get('dump') === '1') {
  model.updateMatrixWorld(true);
  const lines: string[] = [];
  const b = new THREE.Box3();
  const nodes = model.userData.sculptRuntime?.nodes ?? {};
  for (const [id, node] of Object.entries(nodes as Record<string, THREE.Object3D>)) {
    b.setFromObject(node);
    const s = b.getSize(new THREE.Vector3());
    const c = b.getCenter(new THREE.Vector3());
    const ws = node.getWorldScale(new THREE.Vector3());
    lines.push(`${id}\tsize=${s.x.toFixed(3)},${s.y.toFixed(3)},${s.z.toFixed(3)}\tcenter=${c.x.toFixed(3)},${c.y.toFixed(3)},${c.z.toFixed(3)}\tworldScale=${ws.x.toFixed(3)},${ws.y.toFixed(3)},${ws.z.toFixed(3)}\tchildren=${node.children.length}`);
  }
  const pre = document.createElement('pre');
  pre.id = 'dump';
  pre.textContent = lines.join('\n');
  document.body.appendChild(pre);
}

// Interactive by default (drag to orbit, wheel to zoom); headless captures are unaffected.
const controls = createJackGachaCapsuleMachineInspectControls(camera, renderer.domElement);
controls.target.copy(new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3()));
controls.target.y += shift;
controls.update();
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
let frames = 0;
function tick() {
  controls.update();
  renderer.render(scene, camera);
  frames += 1;
  if (frames === 3) document.title = 'ready';
  requestAnimationFrame(tick);
}
tick();
