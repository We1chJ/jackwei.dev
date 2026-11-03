// The capsule in the visitor's hand, drawn on its own (its instance is hidden): the two halves on
// their thread, the paper slip and the project's token inside. Twist the top (drag it round) against
// the thread and it pops off: from then on both halves are real bodies that drop to the floor and
// roll, and the token stays up in hand. Put it back and the halves vanish; the capsule is whole again.
import { forwardRef, useImperativeHandle, useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { BallCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import { CAPSULE_R, SCALE as S } from './dims';
import { capsuleBottom, capsuleTop } from './geometry';
import { capsuleColor, capsuleMaterials, materials } from './materials';
import { G } from './groups';
import { clack, clunk, ratchet } from './sound';
import { sparkle } from '../arcade/Sparkles';
import { Token } from './Token';
import type { Project } from '../data/projects';

export const OPEN = 1.1;                 // rad of twist that frees the top
const THREAD_K = 160, THREAD_C = 14;     // the top springs back if let go before then
const CREAK = 0.28;                      // a creak of the thread every this much twist
export type Twist = { angle: number; v: number; drag: null | { x0: number; y0: number; a0: number }; creaks: number; opened: boolean; openedAt: number };
export const twistState = (): Twist => ({ angle: 0, v: 0, drag: null, creaks: 0, opened: false, openedAt: 0 });

export type HeldApi = {
  /** The top comes off: both halves become bodies and fall; the token is left in hand. */
  pop(): void;
  /** Whole again (put back): the halves are parked out of sight. */
  park(): void;
  /** For the pointer: the top half, the bottom half and the token. */
  readonly group: THREE.Group | null;
};

type Props = {
  /** The held capsule's body (kinematic, kept at the hold point by the machine), or null. */
  held: () => RapierRigidBody | null;
  index: number;
  project: Project | null;
  twist: MutableRefObject<Twist>;
  time: () => number;
};

const R = CAPSULE_R;
const topGeo = capsuleTop(R), bottomGeo = capsuleBottom(R);
const rollGeo = new THREE.CylinderGeometry(R * 0.3, R * 0.3, R * 1.1, 24).rotateZ(Math.PI / 2);
const bandGeo = new THREE.CylinderGeometry(R * 0.31, R * 0.31, R * 0.26, 24).rotateZ(Math.PI / 2);
const lipGeo = new THREE.TorusGeometry(R * 1.012, R * 0.028, 8, 48).rotateX(Math.PI / 2);
const PARK: [number, number, number] = [0, -3, 0];

export const Held = forwardRef<HeldApi, Props>(function Held({ held, index, project, twist, time }, ref) {
  const group = useRef<THREE.Group>(null), top = useRef<THREE.Group>(null), token = useRef<THREE.Group>(null);
  const topBody = useRef<RapierRigidBody>(null), bottomBody = useRef<RapierRigidBody>(null);
  const bottomLook = useRef<THREE.Group>(null);
  const m = useMemo(() => capsuleMaterials(), []);
  const base = materials();
  const tint = useMemo(() => ({ top: m.top.clone(), bottom: m.bottom.clone(), band: m.band.clone(), dark: m.band.clone() }), [m]);
  useMemo(() => {
    const c = capsuleColor(index);
    tint.top.color.set(c.top); tint.bottom.color.set(c.bottom); tint.band.color.set(c.bottom); tint.dark.color.set(c.bottom).multiplyScalar(0.55);
  }, [index, tint]);
  const [pTmp, qTmp, vTmp] = useMemo(() => [new THREE.Vector3(), new THREE.Quaternion(), new THREE.Vector3()], []);
  const st = useRef({ bottomDue: -1, shown: false });

  useImperativeHandle(ref, () => ({
    get group() { return group.current; },
    pop() {
      const g = group.current, tw = twist.current;
      if (!g || tw.opened) return;
      tw.opened = true; tw.openedAt = time(); tw.drag = null;
      st.current.bottomDue = time() + 0.45;
      // The top half is let go where it is, spinning off the thread.
      g.getWorldPosition(pTmp); g.getWorldQuaternion(qTmp);
      const b = topBody.current;
      if (b) {
        b.setTranslation(pTmp, true); b.setRotation(qTmp, true);
        b.collider(0).setEnabled(true);
        vTmp.set(0, 0.9, 0.35).applyQuaternion(qTmp).multiplyScalar(S);
        b.setLinvel({ x: vTmp.x + (Math.random() - 0.5) * 0.2, y: vTmp.y, z: vTmp.z }, true);
        b.setAngvel({ x: 2, y: 9, z: 1 }, true);
        b.wakeUp();
      }
      clunk(); ratchet();
      sparkle.burst(pTmp, 30, 0.3 * S);
    },
    park() {
      const tw = twist.current;
      tw.opened = false; tw.angle = 0; tw.v = 0; tw.drag = null; tw.creaks = 0;
      st.current.bottomDue = -1;
      for (const b of [topBody.current, bottomBody.current]) {
        if (!b) continue;
        b.collider(0).setEnabled(false);
        b.setTranslation({ x: PARK[0], y: PARK[1] * S, z: PARK[2] }, true);
        b.setLinvel({ x: 0, y: 0, z: 0 }, true); b.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
    },
  }), [twist, time, pTmp, qTmp, vTmp]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30), g = group.current, tw = twist.current, body = held();
    if (!g) return;
    g.visible = !!body;
    if (!body) return;
    const p = body.translation(), q = body.rotation();
    g.position.set(p.x / S, p.y / S, p.z / S);
    g.quaternion.set(q.x, q.y, q.z, q.w);

    // The thread: the top follows the twist, lifting a little as it unscrews, creaking; let go
    // short of open, it winds back.
    if (!tw.opened) {
      if (!tw.drag) { tw.v += (-THREAD_K * tw.angle - THREAD_C * tw.v) * dt; tw.angle += tw.v * dt; }
      const k = Math.min(1, Math.abs(tw.angle) / OPEN);
      if (top.current) { top.current.rotation.y = tw.angle; top.current.position.y = k * 0.007; }
      const creaks = Math.floor(Math.abs(tw.angle) / CREAK);
      if (creaks > tw.creaks) ratchet();
      tw.creaks = creaks;
    } else {
      // Opened: the bottom half drops a beat after the top; the token rises to be looked at.
      if (top.current) top.current.visible = false;
      const since = time() - tw.openedAt;
      if (st.current.bottomDue > 0 && time() >= st.current.bottomDue) {
        st.current.bottomDue = -1;
        const b = bottomBody.current;
        if (b) {
          g.getWorldPosition(pTmp); g.getWorldQuaternion(qTmp);
          b.setTranslation(pTmp, true); b.setRotation(qTmp, true);
          b.collider(0).setEnabled(true);
          b.setLinvel({ x: 0, y: -0.2 * S, z: 0.1 * S }, true); b.setAngvel({ x: 3, y: 0.5, z: 2 }, true);
          b.wakeUp();
        }
      }
      if (bottomLook.current) bottomLook.current.visible = st.current.bottomDue > 0;
      if (token.current) {
        const k = 1 - Math.exp(-4 * since);
        token.current.position.y = -R * 0.45 + k * R * 0.5;
        token.current.rotation.y = since * 0.8;
        token.current.scale.setScalar(1 + k * 0.25);
      }
    }
    if (!tw.opened) {
      if (top.current) top.current.visible = true;
      if (bottomLook.current) bottomLook.current.visible = true;
      if (token.current) { token.current.position.y = -R * 0.45; token.current.rotation.y = 0; token.current.scale.setScalar(1); }
    }
  });

  const hit = (b: RapierRigidBody | null) => { const v = b?.linvel(); if (v && Math.hypot(v.x, v.y, v.z) > 0.2 * S) clack(0.5); };
  return (
    <>
      <group ref={group} visible={false} userData={{ held: true }}>
        {/* the bottom half, with the slip in it, and the token */}
        <group ref={bottomLook}>
          <mesh geometry={bottomGeo} material={tint.bottom} castShadow />
          <mesh geometry={lipGeo} material={tint.dark} position={[0, -R * 0.045, 0]} />
          <mesh geometry={rollGeo} material={base.paper} position={[0, -R * 0.75, -R * 0.35]} rotation={[0, 0.5, 0]} />
          <mesh geometry={bandGeo} material={tint.band} position={[0, -R * 0.75, -R * 0.35]} rotation={[0, 0.5, 0]} />
        </group>
        <group ref={token} position={[0, -R * 0.45, 0]} userData={{ token: true }}>
          {project && <Token project={project} />}
        </group>
        {/* the top half, on its thread */}
        <group ref={top} userData={{ top: true }}>
          <mesh geometry={topGeo} material={tint.top} renderOrder={2} />
        </group>
      </group>
      {/* the halves once popped: real bodies that fall and roll, parked out of sight until then */}
      <RigidBody ref={topBody} colliders={false} position={PARK} gravityScale={S} angularDamping={0.8} linearDamping={0.2} friction={0.5} restitution={0.3} collisionGroups={G.capsuleChute} ccd onCollisionEnter={() => hit(topBody.current)}>
        <BallCollider args={[R]} mass={0.015} />
        <mesh geometry={topGeo} material={tint.top} renderOrder={2} />
      </RigidBody>
      <RigidBody ref={bottomBody} colliders={false} position={PARK} gravityScale={S} angularDamping={0.8} linearDamping={0.2} friction={0.5} restitution={0.3} collisionGroups={G.capsuleChute} ccd onCollisionEnter={() => hit(bottomBody.current)}>
        <BallCollider args={[R]} mass={0.02} />
        <mesh geometry={bottomGeo} material={tint.bottom} castShadow />
        <mesh geometry={lipGeo} material={tint.dark} position={[0, -R * 0.045, 0]} />
      </RigidBody>
    </>
  );
});
