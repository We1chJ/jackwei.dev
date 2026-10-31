// A graded collectible card (one of Jack's jobs, see data/experience.ts): holographic foil card (iridescent clear coat, so the rainbow
// shifts with the viewing angle) sealed in an acrylic slab with a red grading label.
// The bodies are one component each; all the looks are drawn together, a draw per part (and
// per project for the printed front and label).
import { forwardRef, useMemo, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three-stdlib';
import { CuboidCollider, RigidBody, type CollisionEnterPayload, type RapierRigidBody } from '@react-three/rapier';
import { EXPERIENCE } from '../data/experience';
import { cardBack, cardFront, gradeLabel } from './art';
import { VG } from './Cabinet';
import { SLAB } from './dims';
import { ItemInstances, place, type Part } from '../arcade/instances';

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
    const p = EXPERIENCE[project], foil = p.rarity === 'LEGENDARY' || p.rarity === 'SHINY';
    m = {
      front: new THREE.MeshPhysicalMaterial({
        map: cardFront(p, project, EXPERIENCE.length), roughness: foil ? 0.22 : 0.3, metalness: foil ? 0.45 : 0.18,
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
  position: [number, number, number];
  onHit?: (index: number, p: CollisionEnterPayload) => void;
};

/** One card's body: a slab. Its looks are drawn by Cards, below. */
export const CardBody = forwardRef<RapierRigidBody, Props>(function CardBody({ index, position, onHit }, ref) {
  return (
    <RigidBody
      ref={ref} type="kinematicPosition" colliders={false} position={position}
      mass={0.06} friction={0.5} restitution={0.15} linearDamping={0.1} angularDamping={0.4} ccd
      collisionGroups={VG.item} onCollisionEnter={(p) => onHit?.(index, p)}
    >
      <CuboidCollider args={[SLAB.w / 2, SLAB.h / 2, SLAB.t / 2]} />
    </RigidBody>
  );
});

type AllProps = {
  /** Each card's project. */
  projects: number[];
  bodies: MutableRefObject<(RapierRigidBody | null)[]>;
  scales: MutableRefObject<THREE.Vector3[]>;
  meshesRef: MutableRefObject<THREE.InstancedMesh[]>;
};

/** Every card: one draw for the backs, one for the slabs, and a front and label per project. */
export function Cards({ projects, bodies, scales, meshesRef }: AllProps) {
  const parts = useMemo((): Part[] => {
    const front = place([0, CARD_Y, 0.0028]), label = place([0, LABEL_Y, 0.0042]);
    const byProject = new Map<number, number[]>();
    projects.forEach((p, i) => byProject.set(p, [...(byProject.get(p) ?? []), i]));
    return [
      ...[...byProject].flatMap(([p, items]): Part[] => {
        const m = cardMaterials(p);
        return [{ geometry: cardGeo, material: m.front, at: front, items }, { geometry: labelGeo, material: m.label, at: label, items }];
      }),
      { geometry: cardGeo, material: cardMaterials(0).back!, at: place([0, CARD_Y, -0.0028], [0, Math.PI, 0]) },
      { geometry: slabGeo, material: slabMat, renderOrder: 2 },
    ];
  }, [projects]);
  return <ItemInstances count={projects.length} bodies={bodies} scales={scales} parts={parts} meshesRef={meshesRef} />;
}
