import { forwardRef, useMemo, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { BallCollider, RigidBody, type RapierRigidBody, type CollisionEnterPayload } from '@react-three/rapier';
import { CAPSULE_R, SCALE } from './dims';
import { capsuleBottom, capsuleTop } from './geometry';
import { capsuleColor, capsuleMaterials, materials } from './materials';
import { G } from './groups';
import { ItemInstances, place, type Part } from '../arcade/instances';

const topGeo = capsuleTop(CAPSULE_R);
const bottomGeo = capsuleBottom(CAPSULE_R);
const rollGeo = new THREE.CylinderGeometry(CAPSULE_R * 0.34, CAPSULE_R * 0.34, CAPSULE_R * 1.15, 24).rotateZ(Math.PI / 2);
const bandGeo = new THREE.CylinderGeometry(CAPSULE_R * 0.345, CAPSULE_R * 0.345, CAPSULE_R * 0.28, 24).rotateZ(Math.PI / 2);

type Props = {
  index: number;
  position: [number, number, number];
  rotation: [number, number, number];
  onHit?: (index: number, payload: CollisionEnterPayload) => void;
};

/** One gashapon capsule's body: a ball. Its looks are drawn by Capsules, below. */
export const CapsuleBody = forwardRef<RapierRigidBody, Props>(function CapsuleBody({ index, position, rotation, onHit }, ref) {
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
    >
      <BallCollider args={[CAPSULE_R]} />
    </RigidBody>
  );
});

type AllProps = {
  count: number;
  bodies: MutableRefObject<(RapierRigidBody | null)[]>;
  scales: MutableRefObject<THREE.Vector3[]>;
  meshesRef: MutableRefObject<THREE.InstancedMesh[]>;
};

/** Every capsule, in four draws: tinted clear top, coloured bottom, the rolled paper slip and its band. */
export function Capsules({ count, bodies, scales, meshesRef }: AllProps) {
  const parts = useMemo((): Part[] => {
    const m = capsuleMaterials();
    const tint = (k: 'top' | 'bottom') => Array.from({ length: count }, (_, i) => capsuleColor(i)[k]);
    const slip = (i: number) => place([0, -CAPSULE_R * 0.42, 0], [0, (i * 1.7) % Math.PI, 0]);
    return [
      { geometry: bottomGeo, material: m.bottom, colors: tint('bottom'), castShadow: true, receiveShadow: true },
      { geometry: rollGeo, material: materials().paper, at: slip },
      { geometry: bandGeo, material: m.band, at: slip, colors: tint('bottom') },
      { geometry: topGeo, material: m.top, colors: tint('top'), renderOrder: 2 },
    ];
  }, [count]);
  return <ItemInstances count={count} bodies={bodies} scales={scales} unit={SCALE} parts={parts} meshesRef={meshesRef} />;
}
