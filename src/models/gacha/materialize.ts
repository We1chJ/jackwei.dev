// Look-dev on top of the generated factory: physically-based plastics and glass, the
// sticker outline language (black + white inverted-hull shells), the mascot medallion
// decal, the sign text decal, and the two-tone capsule mesh used by the physics scene.
// Spec references: materials[*], root.localFeatures.outline-halo, medallion-face/mascot-decal,
// sign-yellow/jack-gacha-text, capsule-NN (two-tone + seam).
import * as THREE from 'three';
import { CAPSULE_COLOURS, CAPSULE_RADIUS } from './layout';

export type Runtime = { nodes: Record<string, THREE.Object3D>; meshes: Record<string, THREE.Mesh> };
export const getRuntime = (root: THREE.Object3D): Runtime => root.userData.sculptRuntime as Runtime;

export const OUTLINE_BLACK = 0.012;   // 0.013 D in the spec
export const OUTLINE_WHITE = 0.024;   // black line + white halo

/** Inverted-hull shell material: pushes vertices out along the normal by a constant distance. */
export function shellMaterial(color: THREE.ColorRepresentation, thickness: number): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, toneMapped: false });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uThick = { value: thickness };
    shader.vertexShader = 'uniform float uThick;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  transformed += normalize(normal) * uThick;',
    );
  };
  return mat;
}
const SHELL_BLACK = shellMaterial(0x000000, OUTLINE_BLACK);
const SHELL_WHITE = shellMaterial(0xffffff, OUTLINE_WHITE);

/** Adds the black + white outline shells to one mesh (shares its geometry). */
export function outlineMesh(mesh: THREE.Mesh): void {
  if (mesh.userData.outlined) return;
  for (const mat of [SHELL_WHITE, SHELL_BLACK]) {
    const shell = new THREE.Mesh(mesh.geometry, mat);
    shell.name = `${mesh.name} (outline)`;
    shell.userData.shell = true;
    shell.userData.explodeWithParent = true;
    shell.castShadow = false;
    shell.receiveShadow = false;
    mesh.add(shell);
  }
  mesh.userData.outlined = true;
}

/** Outlines every opaque mesh under root except the ones flagged noOutline (dome, decals). */
export function addOutlines(root: THREE.Object3D): number {
  const targets: THREE.Mesh[] = [];
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh && !mesh.userData.shell && !mesh.userData.noOutline && !mesh.userData.outlined) targets.push(mesh);
  });
  targets.forEach(outlineMesh);
  return targets.length;
}

function plastic(mat: THREE.Material, roughness: number, clearcoat: number): void {
  const m = mat as THREE.MeshPhysicalMaterial;
  if (!m.isMeshPhysicalMaterial) return;
  m.roughness = roughness;
  m.metalness = 0;
  m.clearcoat = clearcoat;
  m.clearcoatRoughness = 0.18;
  m.envMapIntensity = 0.9;
  m.needsUpdate = true;
}

/** Fresnel-darkened rim so the glass dome keeps a dark silhouette ring from every angle
 *  (a BackSide shell would show through the glass as a black interior). */
function glassRim(radius: number): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uPower: { value: 5.0 }, uStrength: { value: 0.9 } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uPower; uniform float uStrength; varying vec3 vN; varying vec3 vV;
      void main(){ float f = pow(1.0 - abs(dot(vN, vV)), uPower); gl_FragColor = vec4(0.0, 0.0, 0.0, f * uStrength); }`,
  });
  const rim = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.004, 48, 32), mat);
  rim.name = 'Glass dome rim';
  rim.userData.noOutline = true;
  rim.userData.explodeWithParent = true;
  rim.renderOrder = 2;
  return rim;
}

export function makeSignTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const draw = (font: string) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    ctx.font = `160px ${font}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('JACK GACHA', canvas.width / 2, canvas.height / 2 + 8);
    texture.needsUpdate = true;
  };
  draw('"Arial Black", Impact, sans-serif');
  if (typeof document !== 'undefined' && 'fonts' in document) {
    document.fonts.load('160px "Lilita One"').then(() => draw('"Lilita One", "Arial Black", sans-serif')).catch(() => {});
  }
  return texture;
}

/** Upgrades the generated materials to the "polished toy" look and adds the decals. */
export function materialize(root: THREE.Object3D, mascotUrl = '/mascot.jpg'): void {
  const rt = getRuntime(root);
  for (const [id, mesh] of Object.entries(rt.meshes)) {
    if (id === 'dome') {
      const g = mesh.material as THREE.MeshPhysicalMaterial;
      g.transmission = 1; g.thickness = 0.12; g.ior = 1.5; g.roughness = 0.03;
      g.clearcoat = 1; g.clearcoatRoughness = 0.05; g.attenuationColor = new THREE.Color('#dff0ff');
      g.attenuationDistance = 1.6; g.envMapIntensity = 1.3; g.color.set('#f4fbff'); g.transparent = true;
      g.needsUpdate = true;
      mesh.userData.noOutline = true;
      mesh.renderOrder = 1;
      mesh.castShadow = false;
      mesh.add(glassRim(0.5));
    } else if (id.startsWith('capsule-')) {
      plastic(mesh.material as THREE.Material, 0.22, 1);
      mesh.visible = false;   // physics scene renders its own capsules
      mesh.userData.noOutline = true;
    } else if (id === 'medallion' || id === 'sign-plate') {
      plastic(mesh.material as THREE.Material, 0.45, 0.4);
    } else if (id === 'root') {
      plastic(mesh.material as THREE.Material, 0.5, 0.35);
    } else if (id === 'tray-opening') {
      plastic(mesh.material as THREE.Material, 0.8, 0);
    } else {
      plastic(mesh.material as THREE.Material, 0.35, 0.6);
    }
  }
  // Mascot decal: a circle on the +Z cap of the medallion (node pivot sits at the -Z face).
  const mascot = new THREE.TextureLoader().load(mascotUrl);
  mascot.colorSpace = THREE.SRGBColorSpace;
  mascot.anisotropy = 8;
  const face = new THREE.Mesh(
    new THREE.CircleGeometry(0.186, 64),
    new THREE.MeshStandardMaterial({ map: mascot, roughness: 0.5, metalness: 0 }),
  );
  face.position.set(0, 0, 0.0615);
  face.name = 'Mascot decal';
  face.userData.noOutline = true;
  face.userData.explodeWithParent = true;
  rt.nodes['medallion']?.add(face);
  // Sign text decal on the +Z face of the plate (plate depth 0.02).
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(0.46, 0.115),
    new THREE.MeshBasicMaterial({ map: makeSignTexture(), transparent: true, toneMapped: false }),
  );
  sign.position.set(0, 0, 0.0115);
  sign.name = 'Sign text';
  sign.userData.noOutline = true;
  sign.userData.explodeWithParent = true;
  rt.nodes['sign-plate']?.add(sign);
  // Crank parts are interactive.
  for (const id of ['crank-disc', 'crank-bar', 'crank-knob']) {
    const mesh = rt.meshes[id];
    if (mesh) mesh.userData.crank = true;
  }
  addOutlines(root);
}

const capsuleTopMaterials: Record<string, THREE.MeshPhysicalMaterial> = {};
const capsuleWhite = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.12 });
const capsuleInk = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.6 });

/** Two-tone capsule with seam and outlines, for the physics scene. */
export function createCapsuleMesh(colour: keyof typeof CAPSULE_COLOURS): THREE.Group {
  const top = (capsuleTopMaterials[colour] ??= new THREE.MeshPhysicalMaterial({
    color: CAPSULE_COLOURS[colour], roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.12,
  }));
  const group = new THREE.Group();
  const upper = new THREE.Mesh(new THREE.SphereGeometry(CAPSULE_RADIUS, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), top);
  const lower = new THREE.Mesh(new THREE.SphereGeometry(CAPSULE_RADIUS, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), capsuleWhite);
  const seam = new THREE.Mesh(new THREE.TorusGeometry(CAPSULE_RADIUS, 0.006, 8, 48), capsuleInk);
  seam.rotation.x = Math.PI / 2;
  seam.userData.noOutline = true;
  for (const m of [upper, lower]) { m.castShadow = true; m.receiveShadow = true; }
  group.add(upper, lower, seam);
  outlineMesh(upper); outlineMesh(lower);
  return group;
}
