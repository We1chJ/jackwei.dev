// A graded collectible card: holographic foil card (iridescent clear coat, so the rainbow
// shifts with the viewing angle) sealed in an acrylic slab with a red grading label.
import { forwardRef } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three-stdlib';
import { CuboidCollider, RigidBody, type CollisionEnterPayload, type RapierRigidBody } from '@react-three/rapier';
import { PROJECTS } from '../data/projects';
import { cardBack, cardFront, gradeLabel } from './art';
import { VG } from './Cabinet';
import { SLAB } from './dims';

const slabGeo = new RoundedBoxGeometry(SLAB.w, SLAB.h, SLAB.t, 2, 0.003);
const cardGeo = new THREE.PlaneGeometry(0.062, 0.0868);
const labelGeo = new THREE.PlaneGeometry(0.07, 0.0142);
const CARD_Y = -0.0085, LABEL_Y = 0.0445;

const slabMat = new THREE.MeshPhysicalMaterial({
  color: '#EAF6FF', roughness: 0.03, transparent: true, opacity: 0.1, clearcoat: 1, clearcoatRoughness: 0.02,
  specularIntensity: 1, envMapIntensity: 1.4, depthWrite: false,
});
let back: THREE.MeshPhysicalMaterial | null = null;
const fronts = new Map<number, { front: THREE.MeshPhysicalMaterial; label: THREE.MeshStandardMaterial }>();

export function cardMaterials(project: number) {
  back ??= new THREE.MeshPhysicalMaterial({ map: cardBack(), roughness: 0.38, clearcoat: 0.6 });
  let m = fronts.get(project);
  if (!m) {
    const p = PROJECTS[project], foil = p.rarity === 'LEGENDARY' || p.rarity === 'SHINY';
    m = {
      front: new THREE.MeshPhysicalMaterial({
        map: cardFront(p, project, PROJECTS.length), roughness: foil ? 0.22 : 0.3, metalness: foil ? 0.45 : 0.18,
        iridescence: 1, iridescenceIOR: foil ? 2.0 : 1.6, iridescenceThicknessRange: [180, foil ? 900 : 560],
        clearcoat: 1, clearcoatRoughness: 0.04,
      }),
      label: new THREE.MeshStandardMaterial({ map: gradeLabel(p, project), roughness: 0.5 }),
    };
    fronts.set(project, m);
  }
  return { ...m, back, slab: slabMat };
}

type Props = {
  index: number;
  project: number;
  position: [number, number, number];
  visualRef: (g: THREE.Group | null) => void;
  onHit?: (index: number, p: CollisionEnterPayload) => void;
};

export const Card = forwardRef<RapierRigidBody, Props>(function Card({ index, project, position, visualRef, onHit }, ref) {
  const m = cardMaterials(project);
  return (
    <RigidBody
      ref={ref} type="kinematicPosition" colliders={false} position={position}
      mass={0.06} friction={0.5} restitution={0.15} linearDamping={0.1} angularDamping={0.4} ccd
      collisionGroups={VG.item} onCollisionEnter={(p) => onHit?.(index, p)}
    >
      <CuboidCollider args={[SLAB.w / 2, SLAB.h / 2, SLAB.t / 2]} />
      <group ref={visualRef} userData={{ vitem: index }}>
        <mesh geometry={cardGeo} material={m.front} position={[0, CARD_Y, 0.0028]} />
        <mesh geometry={cardGeo} material={m.back!} position={[0, CARD_Y, -0.0028]} rotation-y={Math.PI} />
        <mesh geometry={labelGeo} material={m.label} position={[0, LABEL_Y, 0.0042]} />
        <mesh geometry={slabGeo} material={m.slab} renderOrder={2} />
      </group>
    </RigidBody>
  );
});
