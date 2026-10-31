// Many small moving things drawn as a few instanced meshes. The capsules, plushies and cards were
// each a handful of meshes per item, over a thousand draw calls between them. Their rigid bodies
// stay as they were (colliders only); this reads every body each frame and writes the matrices of
// every part, so a part shared by sixty items is one draw.
import { useEffect, useMemo, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { RapierRigidBody } from '@react-three/rapier';

export type Part = {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** The part's place within an item (one for all, or one per item). */
  at?: THREE.Matrix4 | ((item: number) => THREE.Matrix4);
  /** Which items have this part (default: all of them). */
  items?: number[];
  /** A tint per item, multiplied into the material's colour. */
  colors?: THREE.ColorRepresentation[];
  castShadow?: boolean;
  receiveShadow?: boolean;
  renderOrder?: number;
};

/** A part's transform within its item. */
export function place(position: [number, number, number], rotation: [number, number, number] = [0, 0, 0], scale: [number, number, number] | number = 1) {
  const s = typeof scale === 'number' ? [scale, scale, scale] as const : scale;
  return new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...s));
}

type Props = {
  count: number;
  bodies: MutableRefObject<(RapierRigidBody | null)[]>;
  /** Per-item scale (squash and stretch, shrinking away); 1 when absent. */
  scales?: MutableRefObject<THREE.Vector3[]>;
  /** Per-item give along a world direction (a soft thing squashing against what it hit). */
  bends?: MutableRefObject<Bend[]>;
  /** The bodies' parent group is scaled by this (the gashapon is blown up): converts world to local. */
  unit?: number;
  parts: Part[];
  /** The meshes, for raycasting: see itemOf(). */
  meshesRef?: MutableRefObject<THREE.InstancedMesh[]>;
};

const ONE = new THREE.Vector3(1, 1, 1);

/** Squash along n: amount below 0 flattens, above stretches. The sides bulge to keep the volume. */
export type Bend = { n: THREE.Vector3; amount: number };
function squash(m: THREE.Matrix4, { n, amount }: Bend, a: THREE.Matrix4) {
  const k = 1 + amount, side = 1 / Math.sqrt(k), c = k - side;
  a.set(
    side + c * n.x * n.x, c * n.x * n.y, c * n.x * n.z, 0,
    c * n.x * n.y, side + c * n.y * n.y, c * n.y * n.z, 0,
    c * n.x * n.z, c * n.y * n.z, side + c * n.z * n.z, 0,
    0, 0, 0, 1,
  );
  const e = m.elements, x = e[12], y = e[13], z = e[14];
  e[12] = e[13] = e[14] = 0;
  m.premultiply(a);
  e[12] = x; e[13] = y; e[14] = z;
}

export function ItemInstances({ count, bodies, scales, bends, unit = 1, parts, meshesRef }: Props) {
  const built = useMemo(() => parts.map((p) => {
    const items = p.items ?? Array.from({ length: count }, (_, i) => i);
    const mesh = new THREE.InstancedMesh(p.geometry, p.material, items.length);
    // The items move: culling would need the bounds recomputed every frame, and raycasting
    // culls against a sphere InstancedMesh computes once, so it gets one that holds everything.
    mesh.frustumCulled = false;
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    mesh.castShadow = !!p.castShadow;
    mesh.receiveShadow = !!p.receiveShadow;
    if (p.renderOrder != null) mesh.renderOrder = p.renderOrder;
    if (p.colors) {
      const c = new THREE.Color();
      items.forEach((it, k) => mesh.setColorAt(k, c.set(p.colors![it])));
      mesh.instanceColor!.needsUpdate = true;
    }
    mesh.userData.items = items;
    const slot = new Int32Array(count).fill(-1);
    items.forEach((it, k) => { slot[it] = k; });
    const at = items.map((it) => (typeof p.at === 'function' ? p.at(it) : p.at) ?? null);
    return { mesh, slot, at };
  }), [parts, count]);

  useEffect(() => {
    if (meshesRef) meshesRef.current = built.map((b) => b.mesh);
    return () => { built.forEach((b) => b.mesh.dispose()); if (meshesRef) meshesRef.current = []; };
  }, [built, meshesRef]);

  const [m, mp, ma] = useMemo(() => [new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4()], []);
  const [v, q] = useMemo(() => [new THREE.Vector3(), new THREE.Quaternion()], []);
  // Just after the physics step (priority 0), before the effects draw (1).
  useFrame(() => {
    for (let i = 0; i < count; i++) {
      const b = bodies.current[i];
      if (!b) continue;
      const t = b.translation(), r = b.rotation();
      m.compose(v.set(t.x / unit, t.y / unit, t.z / unit), q.set(r.x, r.y, r.z, r.w), scales?.current[i] ?? ONE);
      const bend = bends?.current[i];
      if (bend && Math.abs(bend.amount) > 0.002) squash(m, bend, ma);
      for (const p of built) {
        const k = p.slot[i];
        if (k < 0) continue;
        p.mesh.setMatrixAt(k, p.at[k] ? mp.multiplyMatrices(m, p.at[k]) : m);
      }
    }
    for (const p of built) p.mesh.instanceMatrix.needsUpdate = true;
  }, 0.5);

  return <group>{built.map((b, i) => <primitive key={i} object={b.mesh} />)}</group>;
}

/** The item an intersection with one of these meshes belongs to, or -1. */
export function itemOf(hit: THREE.Intersection): number {
  const items = (hit.object as THREE.InstancedMesh).userData.items as number[] | undefined;
  return items && hit.instanceId != null ? items[hit.instanceId] : -1;
}

/** A point in an item's frame, in the world: offset is in the item's own units (scaled by `unit`). */
export function itemPoint(out: THREE.Vector3, body: RapierRigidBody, offset: THREE.Vector3, unit = 1, q = new THREE.Quaternion()) {
  const t = body.translation(), r = body.rotation();
  return out.copy(offset).multiplyScalar(unit).applyQuaternion(q.set(r.x, r.y, r.z, r.w)).add(t as THREE.Vector3);
}
