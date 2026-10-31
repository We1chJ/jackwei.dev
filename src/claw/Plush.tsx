// Yellow Jack plushie: fleece blob body (sheen fabric with a fine fuzz normal map), mismatched
// googly eyes, open mouth, sprout and stub arms. A rounded-box collider, so plushies sit and
// stack in the pit instead of rolling like balls. One of them (SHINY) is the gold one.
// The bodies are one component each; all the looks are drawn together, instanced per part.
import { forwardRef, useMemo, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { RigidBody, RoundCuboidCollider, interactionGroups, type CollisionEnterPayload, type RapierRigidBody } from '@react-three/rapier';
import { orangePeelNormal } from '../gacha/textures';
import { ItemInstances, place, type Part } from '../arcade/instances';

export const PG = {
  static: interactionGroups(6, [7, 8]),
  plush: interactionGroups(7, [6, 7, 8]),
  finger: interactionGroups(8, [6, 7]),     // the claw head and fingers
};
export const PLUSH = { hx: 0.034, hy: 0.03, hz: 0.027, r: 0.018 };   // collider: half extents + rounding
export const PLUSH_TOP = PLUSH.hy + PLUSH.r;
export const SHINY = 7;

export const PLUSH_COLORS = ['#F6F3EA', '#F6F3EA', '#FFB3CF', '#A9DBFF', '#B8F2D6', '#FFE58A'];
const plushColor = (i: number) => PLUSH_COLORS[i % PLUSH_COLORS.length];

let mats: ReturnType<typeof build> | null = null;
function build() {
  const fuzz = orangePeelNormal(); fuzz.repeat.set(3, 3);
  return {
    fabric: new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.95, sheen: 1, sheenRoughness: 0.42, sheenColor: new THREE.Color('#ffffff'), normalMap: fuzz, normalScale: new THREE.Vector2(0.5, 0.5) }),
    gold: new THREE.MeshPhysicalMaterial({ color: '#F2C14A', metalness: 0.85, roughness: 0.3, clearcoat: 0.4, normalMap: fuzz, normalScale: new THREE.Vector2(0.25, 0.25) }),
    seam: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 }),
    eyeWhite: new THREE.MeshPhysicalMaterial({ color: '#FFFFFF', roughness: 0.15, clearcoat: 1 }),
    pupil: new THREE.MeshPhysicalMaterial({ color: '#0B0B0D', roughness: 0.1, clearcoat: 1 }),
    mouth: new THREE.MeshStandardMaterial({ color: '#B8325A', roughness: 0.9 }),
    teeth: new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.8 }),
    leaf: new THREE.MeshPhysicalMaterial({ color: '#57C24A', roughness: 0.9, sheen: 1, sheenColor: new THREE.Color('#B8FFAA') }),
    tag: new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.85, side: THREE.DoubleSide }),
  };
}

const seamGeo = new THREE.TorusGeometry(1, 0.035, 6, 48);
const tagGeo = new THREE.PlaneGeometry(0.012, 0.019);
const sphere = new THREE.SphereGeometry(1, 32, 24);
const smallSphere = new THREE.SphereGeometry(1, 16, 12);
const stem = new THREE.CylinderGeometry(0.0035, 0.0045, 0.024, 8);

type Props = {
  index: number; position: [number, number, number]; rotation: [number, number, number];
  onHit?: (index: number, p: CollisionEnterPayload) => void;
};

/** One plushie's body. Its looks are drawn by Plushies, below. */
export const PlushBody = forwardRef<RapierRigidBody, Props>(function PlushBody({ index, position, rotation, onHit }, ref) {
  return (
    <RigidBody
      ref={ref} colliders={false} position={position} rotation={rotation}
      mass={0.09} friction={0.95} restitution={0.05} linearDamping={0.3} angularDamping={0.9} ccd
      collisionGroups={PG.plush} onCollisionEnter={(p) => onHit?.(index, p)}
    >
      <RoundCuboidCollider args={[PLUSH.hx, PLUSH.hy, PLUSH.hz, PLUSH.r]} />
    </RigidBody>
  );
});

type AllProps = {
  count: number;
  bodies: MutableRefObject<(RapierRigidBody | null)[]>;
  scales: MutableRefObject<THREE.Vector3[]>;
  meshesRef: MutableRefObject<THREE.InstancedMesh[]>;
};

/** Every plushie, a draw per part. */
export function Plushies({ count, bodies, scales, meshesRef }: AllProps) {
  const parts = useMemo((): Part[] => {
    const m = (mats ??= build());
    const all = Array.from({ length: count }, (_, i) => i);
    const fleece = all.filter((i) => i !== SHINY), shiny = all.filter((i) => i === SHINY);
    const bodyColors = all.map(plushColor);
    const seamColors = all.map((i) => new THREE.Color(plushColor(i)).multiplyScalar(0.82));
    // Fleece parts come in the fabric for most and gold for the shiny one.
    const fur = (geometry: THREE.BufferGeometry, at: THREE.Matrix4, castShadow = false): Part[] => [
      { geometry, material: m.fabric, at, items: fleece, colors: bodyColors, castShadow, receiveShadow: castShadow },
      { geometry, material: m.gold, at, items: shiny, castShadow, receiveShadow: castShadow },
    ];
    return [
      ...fur(sphere, place([0, 0, 0], [0, 0, 0], [0.053, 0.049, 0.045]), true),
      // side seam where front and back panels are sewn, and the care tag sticking out of it
      { geometry: seamGeo, material: m.seam, at: place([0, 0, 0], [0, Math.PI / 2, 0], [0.045, 0.049, 0.053]), items: fleece, colors: seamColors },
      { geometry: tagGeo, material: m.tag, at: place([0.054, -0.024, -0.004], [0, Math.PI / 2, 0.35]), items: fleece },
      // stub arms
      ...fur(smallSphere, place([-0.049, -0.014, 0.006], [0, 0, 0], [0.012, 0.016, 0.012])),
      ...fur(smallSphere, place([0.049, -0.014, 0.006], [0, 0, 0], [0.012, 0.016, 0.012])),
      // googly eyes: small left, big right, like the mascot
      { geometry: smallSphere, material: m.eyeWhite, at: place([-0.018, 0.012, 0.038], [0, 0, 0], [0.0135, 0.0135, 0.008]) },
      { geometry: smallSphere, material: m.pupil, at: place([-0.016, 0.011, 0.045], [0, 0, 0], [0.0058, 0.0058, 0.003]) },
      { geometry: smallSphere, material: m.eyeWhite, at: place([0.016, 0.015, 0.037], [0, 0, 0], [0.018, 0.018, 0.009]) },
      { geometry: smallSphere, material: m.pupil, at: place([0.019, 0.013, 0.045], [0, 0, 0], [0.0075, 0.0075, 0.003]) },
      // shocked open mouth
      { geometry: smallSphere, material: m.mouth, at: place([0.002, -0.017, 0.04], [0, 0, 0], [0.012, 0.011, 0.006]) },
      { geometry: smallSphere, material: m.teeth, at: place([0.002, -0.009, 0.043], [0, 0, 0], [0.008, 0.0025, 0.002]) },
      // sprout
      { geometry: stem, material: m.leaf, at: place([0.002, 0.058, 0], [0, 0, -0.12]) },
      { geometry: smallSphere, material: m.leaf, at: place([-0.008, 0.07, 0], [0, 0, 0.55], [0.012, 0.004, 0.007]) },
      { geometry: smallSphere, material: m.leaf, at: place([0.013, 0.071, 0], [0, 0, -0.5], [0.012, 0.004, 0.007]) },
    ];
  }, [count]);
  return <ItemInstances count={count} bodies={bodies} scales={scales} parts={parts} meshesRef={meshesRef} />;
}
