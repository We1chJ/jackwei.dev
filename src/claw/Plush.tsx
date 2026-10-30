// Yellow Jack plushie: fleece blob body (sheen fabric with a fine fuzz normal map), mismatched
// googly eyes, open mouth, sprout and stub arms. A rounded-box collider, so plushies sit and
// stack in the pit instead of rolling like balls.
import { forwardRef } from 'react';
import * as THREE from 'three';
import { RigidBody, RoundCuboidCollider, interactionGroups, type CollisionEnterPayload, type RapierRigidBody } from '@react-three/rapier';
import { orangePeelNormal } from '../gacha/textures';

export const PG = {
  static: interactionGroups(6, [7, 8]),
  plush: interactionGroups(7, [6, 7, 8]),
  finger: interactionGroups(8, [6, 7]),     // the claw head and fingers
};
export const PLUSH = { hx: 0.034, hy: 0.03, hz: 0.027, r: 0.018 };   // collider: half extents + rounding
export const PLUSH_TOP = PLUSH.hy + PLUSH.r;

export const PLUSH_COLORS = [
  { body: '#F6F3EA', sheen: '#FFFFFF' },
  { body: '#F6F3EA', sheen: '#FFFFFF' },
  { body: '#FFB3CF', sheen: '#FFE3EE' },
  { body: '#A9DBFF', sheen: '#E3F3FF' },
  { body: '#B8F2D6', sheen: '#E6FFF3' },
  { body: '#FFE58A', sheen: '#FFF6CF' },
];

let fuzz: THREE.Texture | null = null;
const cache = new Map<string, THREE.MeshPhysicalMaterial>();
function fabric(color: string, sheen: string, shiny: boolean) {
  const key = color + shiny;
  let m = cache.get(key);
  if (!m) {
    fuzz ??= (() => { const t = orangePeelNormal(); t.repeat.set(3, 3); return t; })();
    m = shiny
      ? new THREE.MeshPhysicalMaterial({ color: '#F2C14A', metalness: 0.85, roughness: 0.3, clearcoat: 0.4, normalMap: fuzz, normalScale: new THREE.Vector2(0.25, 0.25) })
      : new THREE.MeshPhysicalMaterial({ color, roughness: 0.95, sheen: 1, sheenRoughness: 0.42, sheenColor: new THREE.Color(sheen), normalMap: fuzz, normalScale: new THREE.Vector2(0.5, 0.5) });
    cache.set(key, m);
  }
  return m;
}
const eyeWhite = new THREE.MeshPhysicalMaterial({ color: '#FFFFFF', roughness: 0.15, clearcoat: 1 });
const pupil = new THREE.MeshPhysicalMaterial({ color: '#0B0B0D', roughness: 0.1, clearcoat: 1 });
const mouth = new THREE.MeshStandardMaterial({ color: '#B8325A', roughness: 0.9 });
const teeth = new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.8 });
const leaf = new THREE.MeshPhysicalMaterial({ color: '#57C24A', roughness: 0.9, sheen: 1, sheenColor: new THREE.Color('#B8FFAA') });
const tag = new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.85, side: THREE.DoubleSide });
const seamMats = new Map<string, THREE.MeshStandardMaterial>();
const seam = (color: string) => { let s = seamMats.get(color); if (!s) { s = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.82), roughness: 1 }); seamMats.set(color, s); } return s; };
const seamGeo = new THREE.TorusGeometry(1, 0.035, 6, 48);
const tagGeo = new THREE.PlaneGeometry(0.012, 0.019);

const sphere = new THREE.SphereGeometry(1, 32, 24);
const smallSphere = new THREE.SphereGeometry(1, 16, 12);
const stem = new THREE.CylinderGeometry(0.0035, 0.0045, 0.024, 8);

type Props = {
  index: number; position: [number, number, number]; rotation: [number, number, number];
  visualRef: (g: THREE.Group | null) => void; onHit?: (index: number, p: CollisionEnterPayload) => void;
};

export const Plush = forwardRef<RapierRigidBody, Props>(function Plush({ index, position, rotation, visualRef, onHit }, ref) {
  const shiny = index === 7;
  const c = PLUSH_COLORS[index % PLUSH_COLORS.length];
  const body = fabric(c.body, c.sheen, shiny);
  return (
    <RigidBody
      ref={ref} colliders={false} position={position} rotation={rotation}
      mass={0.09} friction={0.95} restitution={0.05} linearDamping={0.3} angularDamping={0.9} ccd
      collisionGroups={PG.plush} onCollisionEnter={(p) => onHit?.(index, p)}
    >
      <RoundCuboidCollider args={[PLUSH.hx, PLUSH.hy, PLUSH.hz, PLUSH.r]} />
      <group ref={visualRef} userData={{ plush: index, shiny }}>
        <mesh geometry={sphere} material={body} scale={[0.053, 0.049, 0.045]} castShadow receiveShadow />
        {/* side seam where front and back panels are sewn, and the care tag sticking out of it */}
        {!shiny && <mesh geometry={seamGeo} material={seam(c.body)} rotation-y={Math.PI / 2} scale={[0.045, 0.049, 0.053]} />}
        {!shiny && <mesh geometry={tagGeo} material={tag} position={[0.054, -0.024, -0.004]} rotation={[0, Math.PI / 2, 0.35]} />}
        {/* stub arms */}
        <mesh geometry={smallSphere} material={body} position={[-0.049, -0.014, 0.006]} scale={[0.012, 0.016, 0.012]} castShadow />
        <mesh geometry={smallSphere} material={body} position={[0.049, -0.014, 0.006]} scale={[0.012, 0.016, 0.012]} castShadow />
        {/* googly eyes: small left, big right, like the mascot */}
        <mesh geometry={smallSphere} material={eyeWhite} position={[-0.018, 0.012, 0.038]} scale={[0.0135, 0.0135, 0.008]} />
        <mesh geometry={smallSphere} material={pupil} position={[-0.016, 0.011, 0.045]} scale={[0.0058, 0.0058, 0.003]} />
        <mesh geometry={smallSphere} material={eyeWhite} position={[0.016, 0.015, 0.037]} scale={[0.018, 0.018, 0.009]} />
        <mesh geometry={smallSphere} material={pupil} position={[0.019, 0.013, 0.045]} scale={[0.0075, 0.0075, 0.003]} />
        {/* shocked open mouth */}
        <mesh geometry={smallSphere} material={mouth} position={[0.002, -0.017, 0.04]} scale={[0.012, 0.011, 0.006]} />
        <mesh geometry={smallSphere} material={teeth} position={[0.002, -0.009, 0.043]} scale={[0.008, 0.0025, 0.002]} />
        {/* sprout */}
        <mesh geometry={stem} material={leaf} position={[0.002, 0.058, 0]} rotation-z={-0.12} />
        <mesh geometry={smallSphere} material={leaf} position={[-0.008, 0.07, 0]} rotation={[0, 0, 0.55]} scale={[0.012, 0.004, 0.007]} />
        <mesh geometry={smallSphere} material={leaf} position={[0.013, 0.071, 0]} rotation={[0, 0, -0.5]} scale={[0.012, 0.004, 0.007]} />
      </group>
    </RigidBody>
  );
});
