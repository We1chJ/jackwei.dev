import { forwardRef, useMemo } from 'react';
import * as THREE from 'three';
import { BallCollider, RigidBody, type RapierRigidBody, type CollisionEnterPayload } from '@react-three/rapier';
import { CAPSULE_R, SCALE } from './dims';
import { capsuleBottom, capsuleTop } from './geometry';
import { capsuleMaterials, materials } from './materials';
import { G } from './groups';

const topGeo = capsuleTop(CAPSULE_R);
const bottomGeo = capsuleBottom(CAPSULE_R);
const rollGeo = new THREE.CylinderGeometry(CAPSULE_R * 0.34, CAPSULE_R * 0.34, CAPSULE_R * 1.15, 24).rotateZ(Math.PI / 2);
const bandGeo = new THREE.CylinderGeometry(CAPSULE_R * 0.345, CAPSULE_R * 0.345, CAPSULE_R * 0.28, 24).rotateZ(Math.PI / 2);

type Props = {
  index: number;
  position: [number, number, number];
  rotation: [number, number, number];
  onHit?: (index: number, payload: CollisionEnterPayload) => void;
  visualRef?: (group: THREE.Group | null) => void;
};

/** One gashapon capsule: tinted clear top, coloured bottom, a rolled paper slip inside. */
export const Capsule = forwardRef<RapierRigidBody, Props>(function Capsule({ index, position, rotation, onHit, visualRef }, ref) {
  const m = capsuleMaterials(index);
  const paper = materials().paper;
  const visual = useMemo(() => ({ index }), [index]);
  return (
    <RigidBody
      ref={ref}
      colliders={false}
      position={position}
      rotation={rotation}
      mass={0.04}
      friction={0.45}
      restitution={0.28}
      linearDamping={0.15}
      gravityScale={SCALE}   // the machine is scaled up; this keeps drops at real-size timing
      angularDamping={0.6}   // stands in for rolling resistance, which Rapier lacks
      ccd
      collisionGroups={G.capsuleHopper}
      onCollisionEnter={(p) => onHit?.(index, p)}
      userData={visual}
    >
      <BallCollider args={[CAPSULE_R]} />
      <group ref={visualRef} name={`capsule-${index}`} userData={{ capsule: index }}>
        <mesh geometry={bottomGeo} material={m.bottom} castShadow receiveShadow />
        <mesh geometry={topGeo} material={m.top} castShadow />
        <group position={[0, -CAPSULE_R * 0.42, 0]} rotation={[0, (index * 1.7) % Math.PI, 0]}>
          <mesh geometry={rollGeo} material={paper} castShadow />
          <mesh geometry={bandGeo} material={m.band} />
        </group>
      </group>
    </RigidBody>
  );
});
