// The capsule in the visitor's hand, drawn on its own (its instance is hidden): the two halves on
// their thread, the paper slip and the project's token inside. Click it and it opens itself: a
// shake, the top unscrewing with a creak and a lift, then the pop. From then on both halves are
// real bodies that drop to the floor and roll, and the token rises in hand on a halo in the
// project's rarity colour, turning slowly. Put it back and the halves vanish; the capsule is whole again.
import { forwardRef, useImperativeHandle, useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { BallCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import { CAPSULE_R, SCALE as S } from './dims';
import { capsuleBottom, capsuleTop } from './geometry';
import { capsuleColor, capsuleMaterials, materials } from './materials';
import { G } from './groups';
import { clack, clunk, jingle, ratchet } from './sound';
import { sparkle } from '../arcade/Sparkles';
import { Token } from './Token';
import type { Project, Rarity } from '../data/projects';

const OPEN = 1.1;                        // rad of twist that frees the top
const SHAKE = 0.3, UNSCREW = 0.75;       // seconds: the shake, then the unscrewing
const CREAK = 0.28;                      // a creak of the thread every this much twist
export type Twist = { angle: number; creaks: number; auto: number; opened: boolean; openedAt: number };
export const twistState = (): Twist => ({ angle: 0, creaks: 0, auto: -1, opened: false, openedAt: 0 });

const RARITY: Record<Rarity, string> = { COMMON: '#CFCFD6', RARE: '#5FB2FF', LEGENDARY: '#FFC53D', SHINY: '#FF6FD8' };

export type HeldApi = {
  /** Opens itself: the shake, the unscrewing, the pop. */
  open(): void;
  /** Whole again (put back): the halves are parked out of sight. */
  park(): void;
  /** For the pointer. */
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
const haloGeo = new THREE.RingGeometry(R * 0.9, R * 1.5, 48);
const flashGeo = new THREE.RingGeometry(R * 1.0, R * 1.25, 48);
const PARK: [number, number, number] = [0, -3, 0];
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export const Held = forwardRef<HeldApi, Props>(function Held({ held, index, project, twist, time }, ref) {
  const group = useRef<THREE.Group>(null), top = useRef<THREE.Group>(null), token = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Mesh>(null), flash = useRef<THREE.Mesh>(null), bottomLook = useRef<THREE.Group>(null);
  const topBody = useRef<RapierRigidBody>(null), bottomBody = useRef<RapierRigidBody>(null);
  const m = useMemo(() => capsuleMaterials(), []);
  const base = materials();
  const tint = useMemo(() => ({ top: m.top.clone(), bottom: m.bottom.clone(), band: m.band.clone(), dark: m.band.clone() }), [m]);
  useMemo(() => {
    const c = capsuleColor(index);
    tint.top.color.set(c.top); tint.bottom.color.set(c.bottom); tint.band.color.set(c.bottom); tint.dark.color.set(c.bottom).multiplyScalar(0.55);
  }, [index, tint]);
  const glow = useMemo(() => ({
    halo: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    flash: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
  }), []);
  useMemo(() => { const c = RARITY[project?.rarity ?? 'COMMON']; glow.halo.color.set(c); glow.flash.color.set(c); }, [project, glow]);
  const [pTmp, qTmp, vTmp, wTmp] = useMemo(() => [new THREE.Vector3(), new THREE.Quaternion(), new THREE.Vector3(), new THREE.Quaternion()], []);
  const zAxis = useMemo(() => new THREE.Vector3(0, 0, 1), []);
  const st = useRef({ bottomDue: -1 });

  const pop = () => {
    const g = group.current, tw = twist.current;
    if (!g || tw.opened) return;
    tw.opened = true; tw.openedAt = time(); tw.auto = -1;
    st.current.bottomDue = time() + 0.5;
    // The top half is let go where it is, spinning off the thread.
    g.getWorldPosition(pTmp); g.getWorldQuaternion(qTmp);
    const b = topBody.current;
    if (b) {
      b.setTranslation(pTmp, true); b.setRotation(qTmp, true);
      b.collider(0).setEnabled(true);
      vTmp.set(0.1, 1.1, 0.4).applyQuaternion(qTmp).multiplyScalar(S);
      b.setLinvel({ x: vTmp.x + (Math.random() - 0.5) * 0.3, y: vTmp.y, z: vTmp.z }, true);
      b.setAngvel({ x: 3, y: 12, z: 2 }, true);
      b.wakeUp();
    }
    clunk(); jingle();
    sparkle.burst(pTmp, 60, 0.45 * S);
    if (flash.current) flash.current.visible = true;
  };

  useImperativeHandle(ref, () => ({
    get group() { return group.current; },
    open() { const tw = twist.current; if (!tw.opened && tw.auto < 0) { tw.auto = time(); tw.creaks = 0; } },
    park() {
      const tw = twist.current;
      tw.opened = false; tw.angle = 0; tw.auto = -1; tw.creaks = 0;
      st.current.bottomDue = -1;
      if (flash.current) flash.current.visible = false;
      for (const b of [topBody.current, bottomBody.current]) {
        if (!b) continue;
        b.collider(0).setEnabled(false);
        b.setTranslation({ x: PARK[0], y: PARK[1] * S, z: PARK[2] }, true);
        b.setLinvel({ x: 0, y: 0, z: 0 }, true); b.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
    },
  }), [twist, time]);   // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30), g = group.current, tw = twist.current, body = held(), now = time();
    if (!g) return;
    g.visible = !!body;
    if (!body) return;
    const p = body.translation(), q = body.rotation();
    g.position.set(p.x / S, p.y / S, p.z / S);
    g.quaternion.set(q.x, q.y, q.z, q.w);

    if (!tw.opened) {
      // Opening itself: a shake, then the top unscrews, creaking and lifting, and comes off.
      if (tw.auto >= 0) {
        const t = now - tw.auto;
        if (t < SHAKE) {
          const k = 1 - t / SHAKE;
          g.quaternion.multiply(wTmp.setFromAxisAngle(zAxis, Math.sin(t * 60) * 0.12 * k));
          tw.angle = 0;
        } else {
          tw.angle = OPEN * easeInOut(Math.min(1, (t - SHAKE) / UNSCREW));
          if (t - SHAKE >= UNSCREW) pop();
        }
      }
      const k = Math.min(1, tw.angle / OPEN);
      if (top.current) { top.current.visible = true; top.current.rotation.y = tw.angle; top.current.position.y = k * 0.008; }
      const creaks = Math.floor(tw.angle / CREAK);
      if (creaks > tw.creaks) ratchet();
      tw.creaks = creaks;
      if (bottomLook.current) bottomLook.current.visible = true;
      if (token.current) { token.current.position.y = -R * 0.45; token.current.rotation.y = 0; token.current.scale.setScalar(1); }
      glow.halo.opacity = 0; glow.flash.opacity = 0;
    } else {
      // Opened: the bottom half drops a beat after the top; the token rises onto its halo to be looked at.
      if (top.current) top.current.visible = false;
      const since = now - tw.openedAt;
      if (st.current.bottomDue > 0 && now >= st.current.bottomDue) {
        st.current.bottomDue = -1;
        const b = bottomBody.current;
        if (b) {
          g.getWorldPosition(pTmp); g.getWorldQuaternion(qTmp);
          b.setTranslation(pTmp, true); b.setRotation(qTmp, true);
          b.collider(0).setEnabled(true);
          b.setLinvel({ x: 0, y: -0.2 * S, z: 0.15 * S }, true); b.setAngvel({ x: 3, y: 0.5, z: 2 }, true);
          b.wakeUp();
        }
      }
      if (bottomLook.current) bottomLook.current.visible = st.current.bottomDue > 0;
      const k = 1 - Math.exp(-3.5 * since);
      if (token.current) {
        token.current.position.y = -R * 0.45 + k * R * 0.55 + Math.sin(since * 2.2) * R * 0.04 * k;
        token.current.rotation.y = since * 1.1;
        token.current.scale.setScalar(1 + k * 0.6);
      }
      if (halo.current) { halo.current.position.y = -R * 0.35 + k * R * 0.1; halo.current.rotation.z = since * 0.6; halo.current.scale.setScalar(0.3 + 0.7 * k); }
      glow.halo.opacity = k * (0.55 + 0.25 * Math.sin(since * 3));
      if (flash.current) { const f = Math.min(1, since / 0.55); flash.current.scale.setScalar(0.4 + 3.2 * f); glow.flash.opacity = (1 - f) * 0.9; flash.current.visible = f < 1; }
      if (Math.random() < dt * 3) { g.getWorldPosition(pTmp); sparkle.twinkle({ x: pTmp.x + (Math.random() - 0.5) * 0.25, y: pTmp.y + (Math.random() - 0.3) * 0.25, z: pTmp.z + (Math.random() - 0.5) * 0.2 }); }
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
        {/* the halo the token rises onto, and the flash of the pop */}
        <mesh ref={halo} geometry={haloGeo} material={glow.halo} rotation={[-Math.PI / 2, 0, 0]} position={[0, -R * 0.35, 0]} renderOrder={5} />
        <mesh ref={flash} geometry={flashGeo} material={glow.flash} renderOrder={5} visible={false} />
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
