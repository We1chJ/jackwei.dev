// Hand refinements on top of the generated factory (img2threejs `refine-code` edits).
// Kept separate from createGachaMachineModel.ts, which the generator overwrites on every
// pass. Each function documents the spec entry it realises so the spec stays the source
// of truth (3d/gacha-machine/object-sculpt-spec.json).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const CAPSULE_RADIUS = 0.095;   // 0.19 D diameter (spec: capsule-NN dimensions)
const SEAM_TUBE = 0.006;        // ~0.01 D black equatorial seam (spec: capsule-01-seam)

/** Spec: capsule-NN "two-tone split and seam are hand-refined".
 *  Replaces each capsule's single sphere with a coloured top hemisphere, a white bottom
 *  hemisphere and a thin black seam torus at the equator. */
export function splitCapsules(root: THREE.Object3D): number {
  const runtime = root.userData.sculptRuntime as { meshes?: Record<string, THREE.Mesh> } | undefined;
  if (!runtime?.meshes) return 0;
  let count = 0;
  const white = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0 });
  const ink = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.6, metalness: 0 });
  for (const [id, mesh] of Object.entries(runtime.meshes)) {
    if (!/^capsule-\d+$/.test(id) || mesh.userData.twoTone) continue;
    const parent = mesh.parent;
    if (!parent) continue;
    const topMaterial = mesh.material as THREE.Material;
    // Top hemisphere keeps the generated (coloured) material.
    mesh.geometry.dispose();
    mesh.geometry = new THREE.SphereGeometry(CAPSULE_RADIUS, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    mesh.userData.twoTone = true;
    // Bottom hemisphere, white.
    const bottom = new THREE.Mesh(
      new THREE.SphereGeometry(CAPSULE_RADIUS, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      white,
    );
    bottom.name = `${mesh.name} (bottom)`;
    bottom.castShadow = mesh.castShadow;
    bottom.receiveShadow = mesh.receiveShadow;
    bottom.userData.explodeWithParent = true;
    // Equatorial seam.
    const seam = new THREE.Mesh(new THREE.TorusGeometry(CAPSULE_RADIUS, SEAM_TUBE, 8, 48), ink);
    seam.rotation.x = Math.PI / 2;
    seam.name = `${mesh.name} (seam)`;
    seam.userData.explodeWithParent = true;
    mesh.add(bottom, seam);
    void topMaterial;
    count += 1;
  }
  return count;
}

// Spec geometryDescriptor.edgeTreatment per part: housing 0.08 D, sign plate 0.02 D, tray 0.03 D.
const FILLETS: Record<string, number> = { root: 0.08, 'sign-plate': 0.02, 'tray-opening': 0.03 };

/** Spec: root/body-fillet, sign-plate and tray-opening edgeTreatment "rounded".
 *  Swaps the generated unit BoxGeometry (scaled to the part's dimensions) for a
 *  RoundedBoxGeometry of the same size, only when the mesh still carries a plain box. */
export function roundBoxes(root: THREE.Object3D): number {
  const runtime = root.userData.sculptRuntime as { meshes?: Record<string, THREE.Mesh> } | undefined;
  if (!runtime?.meshes) return 0;
  let count = 0;
  for (const [id, radius] of Object.entries(FILLETS)) {
    const mesh = runtime.meshes[id];
    if (!mesh || mesh.geometry.type !== 'BoxGeometry' || mesh.userData.rounded) continue;
    mesh.geometry.computeBoundingBox();
    const size = mesh.geometry.boundingBox!.getSize(new THREE.Vector3());
    const r = Math.min(radius, size.x / 2, size.y / 2, size.z / 2);
    mesh.geometry.dispose();
    mesh.geometry = new RoundedBoxGeometry(size.x, size.y, size.z, 4, r);
    mesh.userData.rounded = true;
    count += 1;
  }
  return count;
}

/** Spec: tray-opening/tray-lip (micro) — lighter band along the top edge of the opening. */
export function addTrayLip(root: THREE.Object3D): boolean {
  const runtime = root.userData.sculptRuntime as { meshes?: Record<string, THREE.Mesh> } | undefined;
  const tray = runtime?.meshes?.['tray-opening'];
  if (!tray || tray.userData.lip) return false;
  tray.geometry.computeBoundingBox();
  const size = tray.geometry.boundingBox!.getSize(new THREE.Vector3());
  const lip = new THREE.Mesh(
    new THREE.BoxGeometry(size.x * 0.88, size.y * 0.12, 0.006),
    new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.8 }),
  );
  lip.position.set(0, size.y * 0.5 - size.y * 0.12, size.z / 2 + 0.002);
  lip.name = 'Tray opening lip';
  lip.userData.explodeWithParent = true;
  tray.add(lip);
  tray.userData.lip = true;
  return true;
}

/** Applies every refinement that is ready. Returns a small report for the review log. */
export function refineGachaMachine(root: THREE.Object3D): { capsulesSplit: number; boxesRounded: number; trayLip: boolean } {
  return {
    capsulesSplit: splitCapsules(root),
    boxesRounded: roundBoxes(root),
    trayLip: addTrayLip(root),
  };
}
