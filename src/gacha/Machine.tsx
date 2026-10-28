// The gashapon mechanism. Physics (Rapier): capsules pile in the hopper on a kinematic
// dispensing disc geared to the handle; one handle turn advances the disc and releases one
// capsule into a hidden chute, where it rolls under gravity into the cup and rests against a
// spring-hinged flap. Choreographed (the "hybrid" part): the hand-off from the disc pocket
// into the chute, which happens out of sight inside the cabinet.
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import {
  CuboidCollider, CylinderCollider, RigidBody, useRevoluteJoint,
  type CollisionEnterPayload, type RapierRigidBody,
} from '@react-three/rapier';
import { RigidBodyType } from '@dimforge/rapier3d-compat';
import { CabinetColliders, CabinetVisual, FlapVisual, Knob } from './Cabinet';
import { Capsule } from './Capsule';
import {
  CAPSULE_COUNT, CAPSULE_R, CHUTE_SPAWN, DISC_RATIO, DISPENSE_POINT, FLAP, HOPPER, INNER,
} from './dims';
import { G } from './groups';
import { materials } from './materials';
import { clack, clunk, flapSound, ratchet } from './sound';
import { gacha } from './store';

type Mode = 'hopper' | 'lift' | 'chute' | 'cup' | 'out' | 'held' | 'return';

const TAU = Math.PI * 2;
const DETENT = TAU / 12;                       // 12 ratchet clicks per turn
// The taken capsule hovers in front of the camera, slightly right of centre, whatever the view.
const HOLD = { distance: 0.62, right: 0.07, down: 0.03 };
// The door swings inward (positive about X): a capsule pushing outward meets the frame.
const FLAP_CLOSED = 0, FLAP_OPEN = 1.42;
const FLAP_K = 1500, FLAP_C = 70;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// Deterministic initial pile: four columns x five rows x three layers, jittered.
function spawnPoints(n: number) {
  const r = (i: number) => (Math.sin(i * 12.9898) * 43758.5453) % 1;
  const out: { p: [number, number, number]; q: [number, number, number] }[] = [];
  const xs = [-0.12, -0.04, 0.04, 0.12], zs = [-0.135, -0.068, 0, 0.068, 0.135];
  for (let layer = 0; out.length < n; layer++) for (const z of zs) for (const x of xs) {
    if (out.length >= n) break;
    const i = out.length;
    out.push({
      p: [x + r(i) * 0.012, 0.43 + layer * 0.075 + Math.abs(r(i + 7)) * 0.02, z + r(i + 3) * 0.01],
      q: [r(i + 11) * Math.PI, r(i + 13) * Math.PI, r(i + 17) * Math.PI],
    });
  }
  return out;
}

export default function Machine() {
  const { camera, gl, controls } = useThree();
  const spawn = useMemo(() => spawnPoints(CAPSULE_COUNT), []);
  const bodies = useRef<(RapierRigidBody | null)[]>([]);
  const visuals = useRef<(THREE.Group | null)[]>([]);
  const mode = useRef<Mode[]>(Array(CAPSULE_COUNT).fill('hopper'));
  const chute = useRef<RapierRigidBody>(null);
  const flap = useRef<RapierRigidBody>(null);
  const flapGroup = useRef<THREE.Group>(null);
  const disc = useRef<RapierRigidBody>(null);
  const knob = useRef<THREE.Group>(null);
  const joint = useRevoluteJoint(chute, flap, [[0, FLAP.hingeY, FLAP.z], [0, 0, 0], [1, 0, 0], [0, 1.5]]);

  // Handle state: angle is negative going clockwise (as seen from the front).
  const h = useRef({ angle: 0, target: 0, dragging: false, lastPointer: 0, auto: null as null | { from: number; t: number }, detent: 0, turn: 0 });
  // Per-capsule choreography.
  const anim = useRef(new Map<number, { kind: 'lift' | 'out' | 'return'; t: number; from: THREE.Vector3; fromQ: THREE.Quaternion }>());
  const restTimer = useRef(new Map<number, number>());
  const clock = useRef({ t: 0, flapCloseAt: -1 });

  // ---------- actions ----------
  // Rapier motors are acceleration-based: k and c act like a spring on angular acceleration,
  // so they are large (gravity alone gives the light flap ~180 rad/s^2). c ~ 2*sqrt(k).
  const setFlap = (target: number) => joint.current?.configureMotorPosition(target, FLAP_K, FLAP_C);

  const dispense = () => {
    const waiting = mode.current.filter((m) => m === 'chute' || m === 'cup').length;
    if (waiting >= 2) return;                   // cup is full: the wheel turns but nothing drops
    let best = -1, bestScore = Infinity;
    mode.current.forEach((m, i) => {
      const b = bodies.current[i];
      if (m !== 'hopper' || !b) return;
      const p = b.translation();
      const lowness = p.y - (HOPPER.discTop + CAPSULE_R);
      const score = Math.hypot(p.x - DISPENSE_POINT.x, p.z - DISPENSE_POINT.z) + Math.max(0, lowness) * 3;
      if (score < bestScore) { bestScore = score; best = i; }
    });
    const b = bodies.current[best];
    if (!b) return;
    const p = b.translation(), q = b.rotation();
    b.collider(0).setEnabled(false);
    b.setBodyType(RigidBodyType.KinematicPositionBased, true);
    mode.current[best] = 'lift';
    anim.current.set(best, { kind: 'lift', t: 0, from: new THREE.Vector3(p.x, p.y, p.z), fromQ: new THREE.Quaternion(q.x, q.y, q.z, q.w) });
    gacha.set({ phase: 'dispensing' });
  };

  const take = () => {
    let best = -1, bestZ = -Infinity;
    mode.current.forEach((m, i) => {
      const b = bodies.current[i];
      if (m === 'cup' && b && b.translation().z > bestZ) { bestZ = b.translation().z; best = i; }
    });
    const b = bodies.current[best];
    if (!b) return;
    setFlap(FLAP_OPEN); flapSound();
    clock.current.flapCloseAt = clock.current.t + 1.3;
    const p = b.translation(), q = b.rotation();
    b.collider(0).setEnabled(false);
    b.setBodyType(RigidBodyType.KinematicPositionBased, true);
    mode.current[best] = 'out';
    anim.current.set(best, { kind: 'out', t: -0.22, from: new THREE.Vector3(p.x, p.y, p.z), fromQ: new THREE.Quaternion(q.x, q.y, q.z, q.w) });
    gacha.set({ phase: 'taking' });
  };

  const putBack = () => {
    const i = mode.current.indexOf('held');
    const b = bodies.current[i];
    if (!b) return;
    const p = b.translation(), q = b.rotation();
    mode.current[i] = 'return';
    anim.current.set(i, { kind: 'return', t: 0, from: new THREE.Vector3(p.x, p.y, p.z), fromQ: new THREE.Quaternion(q.x, q.y, q.z, q.w) });
  };

  const turnOnce = () => {
    const s = h.current;
    if (s.dragging || s.auto) return;
    s.auto = { from: s.angle, t: 0 };
  };

  useEffect(() => {
    gacha.actions.turn = turnOnce;
    gacha.actions.putBack = putBack;
  });

  // ---------- pointer input (capture phase, so orbiting never starts on the handle) ----------
  useEffect(() => {
    const el = gl.domElement.parentElement ?? gl.domElement;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const hit = (e: PointerEvent) => {
      const r = gl.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const targets: THREE.Object3D[] = [];
      if (knob.current) targets.push(knob.current);
      if (flapGroup.current) targets.push(flapGroup.current);
      mode.current.forEach((m, i) => { const v = visuals.current[i]; if (v && (m === 'cup' || m === 'held')) targets.push(v); });
      const first = ray.intersectObjects(targets, true)[0];
      if (!first) return null;
      let o: THREE.Object3D | null = first.object;
      while (o) {
        if (o.userData.knob) return { kind: 'knob' as const };
        if (o.userData.flap) return { kind: 'cup' as const };
        if (typeof o.userData.capsule === 'number') return { kind: mode.current[o.userData.capsule] === 'held' ? 'held' as const : 'cup' as const };
        o = o.parent;
      }
      return null;
    };
    const knobScreen = () => {
      const p = knob.current!.getWorldPosition(new THREE.Vector3()).project(camera);
      const r = gl.domElement.getBoundingClientRect();
      return [r.left + (p.x + 1) / 2 * r.width, r.top + (1 - p.y) / 2 * r.height] as const;
    };
    const pointerAngle = (e: PointerEvent) => { const [cx, cy] = knobScreen(); return Math.atan2(-(e.clientY - cy), e.clientX - cx); };

    const down = (e: PointerEvent) => {
      const target = hit(e);
      if (import.meta.env.DEV) document.body.dataset.lastHit = target?.kind ?? 'none';
      if (!target) return;
      e.stopPropagation(); e.preventDefault();
      const s = h.current;
      if (target.kind === 'knob') {
        if (s.auto) return;
        s.dragging = true; s.lastPointer = pointerAngle(e);
        gacha.set({ phase: 'turning' });
        try { el.setPointerCapture(e.pointerId); } catch { /* synthetic or already-released pointer */ }
      } else if (target.kind === 'cup') take();
      else if (target.kind === 'held') putBack();
    };
    const move = (e: PointerEvent) => {
      const s = h.current;
      if (s.dragging) {
        const a = pointerAngle(e);
        let d = a - s.lastPointer;
        if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
        s.lastPointer = a;
        if (d < 0) s.target += Math.max(d, -0.6);   // the pawl only lets it go clockwise
        return;
      }
      el.style.cursor = hit(e) ? 'pointer' : 'grab';
    };
    const up = (e: PointerEvent) => {
      const s = h.current;
      if (!s.dragging) return;
      s.dragging = false;
      try { if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      if (gacha.get().phase === 'turning') gacha.set({ phase: 'idle' });
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') putBack();
      if (e.key === ' ' && e.target === document.body) { e.preventDefault(); turnOnce(); }
    };
    el.addEventListener('pointerdown', down, { capture: true });
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('keydown', key);
    return () => {
      el.removeEventListener('pointerdown', down, { capture: true });
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('keydown', key);
    };
  }, [camera, gl]);

  // Keep the orbit controls from fighting the handle.
  useEffect(() => {
    const c = controls as unknown as { enabled: boolean } | null;
    const unsub = gacha.subscribe(() => { if (c) c.enabled = gacha.get().phase !== 'turning'; });
    return unsub;
  }, [controls]);

  const onHit = (i: number, p: CollisionEnterPayload) => {
    if (gacha.get().phase === 'settling') return;
    const b = bodies.current[i];
    if (!b) return;
    const v = b.linvel();
    const speed = Math.hypot(v.x, v.y, v.z);
    if (speed > 0.08) clack(speed / 1.2);
    void p;
  };

  // ---------- simulation step ----------
  const holdTmp = useMemo(() => ({ p: new THREE.Vector3(), dir: new THREE.Vector3(), right: new THREE.Vector3() }), []);
  const holdPoint = () => {
    const { p, dir, right } = holdTmp;
    camera.getWorldDirection(dir);
    right.crossVectors(dir, camera.up).normalize();
    return p.copy(camera.position).addScaledVector(dir, HOLD.distance).addScaledVector(right, HOLD.right).addScaledVector(camera.up, -HOLD.down);
  };
  const qTmp = useMemo(() => new THREE.Quaternion(), []);
  const vTmp = useMemo(() => new THREE.Vector3(), []);
  const eTmp = useMemo(() => new THREE.Euler(), []);
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    clock.current.t += dt;
    const s = h.current;

    if (import.meta.env.DEV) {
      const counts: Record<string, number> = {};
      mode.current.forEach((m) => { counts[m] = (counts[m] ?? 0) + 1; });
      const cupIdx = mode.current.findIndex((m) => m === 'chute' || m === 'cup' || m === 'out' || m === 'held');
      const cp = cupIdx >= 0 ? bodies.current[cupIdx]?.translation() : null;
      const fq = flap.current?.rotation();
      document.body.dataset.gacha = JSON.stringify({
        phase: gacha.get().phase, angle: +s.angle.toFixed(2), turn: s.turn, counts,
        tracked: cp ? [+cp.x.toFixed(3), +cp.y.toFixed(3), +cp.z.toFixed(3)] : null,
        flap: fq ? +(2 * Math.atan2(fq.x, fq.w)).toFixed(3) : null,
        flapPos: flap.current ? Object.values(flap.current.translation()).map((v) => +(v as number).toFixed(3)) : null,
        joint: !!joint.current, jointValid: joint.current ? joint.current.isValid() : null,
      });
    }

    // Handle: follow the drag with a little weight, or play the one-turn animation.
    if (s.auto) {
      s.auto.t = Math.min(1, s.auto.t + dt / 1.15);
      s.angle = s.target = s.auto.from - TAU * ease(s.auto.t);
      if (gacha.get().phase !== 'dispensing') gacha.set({ phase: 'turning' });
      if (s.auto.t >= 1) { s.auto = null; if (gacha.get().phase === 'turning') gacha.set({ phase: 'idle' }); }
    } else {
      s.angle += (s.target - s.angle) * (1 - Math.exp(-22 * dt));
    }
    if (knob.current) knob.current.rotation.z = s.angle;
    const detent = Math.floor(-s.angle / DETENT + 1e-4);
    if (detent > s.detent) { s.detent = detent; ratchet(); if (s.dragging) navigator.vibrate?.(4); }
    const turn = Math.floor(-s.angle / TAU + 1e-4);
    if (turn > s.turn) { s.turn = turn; clunk(); gacha.set({ turns: turn }); dispense(); }

    // Dispensing disc geared to the handle (kinematic, so capsules ride and tumble on it).
    disc.current?.setNextKinematicRotation(qTmp.setFromEuler(eTmp.set(0, s.angle * DISC_RATIO, 0)));

    // Flap closes itself after the capsule has been taken.
    if (clock.current.flapCloseAt > 0 && clock.current.t > clock.current.flapCloseAt) {
      clock.current.flapCloseAt = -1; setFlap(FLAP_CLOSED);
    }

    // Choreographed segments.
    for (const [i, a] of anim.current) {
      const b = bodies.current[i];
      if (!b) { anim.current.delete(i); continue; }
      if (a.kind === 'lift') {
        a.t = Math.min(1, a.t + dt / 0.24);
        vTmp.set(DISPENSE_POINT.x, HOPPER.floor - 0.05, DISPENSE_POINT.z).sub(a.from).multiplyScalar(ease(a.t)).add(a.from);
        b.setNextKinematicTranslation(vTmp);
        if (a.t >= 1) {
          anim.current.delete(i);
          b.setTranslation(CHUTE_SPAWN, true);
          b.collider(0).setCollisionGroups(G.capsuleChute);
          b.collider(0).setEnabled(true);
          b.setBodyType(RigidBodyType.Dynamic, true);
          b.setLinvel({ x: 0, y: -0.15, z: 0.12 }, true);
          mode.current[i] = 'chute';
        }
      } else if (a.kind === 'out') {
        a.t += dt / 0.95;
        if (a.t < 0) continue;                      // wait for the flap to swing open
        const t = Math.min(1, a.t), k = ease(t);
        const p1 = new THREE.Vector3(a.from.x, a.from.y - 0.01, 0.31);
        // quadratic Bezier: cup -> just outside the flap -> held position
        const u = 1 - k;
        vTmp.copy(a.from).multiplyScalar(u * u).addScaledVector(p1, 2 * u * k).addScaledVector(holdPoint(), k * k);
        b.setNextKinematicTranslation(vTmp);
        qTmp.setFromEuler(eTmp.set(-0.35, 0.6 + k * 0.4, 0.15));
        b.setNextKinematicRotation(new THREE.Quaternion().copy(a.fromQ).slerp(qTmp, k));
        if (t >= 1) { anim.current.delete(i); mode.current[i] = 'held'; gacha.set({ phase: 'held' }); }
      } else if (a.kind === 'return') {
        a.t = Math.min(1, a.t + dt / 0.28);
        const v = visuals.current[i];
        if (v) v.scale.setScalar(Math.max(0.001, 1 - ease(a.t)));
        if (a.t >= 1) {
          anim.current.delete(i);
          const x = (Math.random() - 0.5) * 0.2, z = (Math.random() - 0.5) * 0.18;
          b.setTranslation({ x, y: HOPPER.ceiling - 0.05, z }, true);
          b.collider(0).setCollisionGroups(G.capsuleHopper);
          b.collider(0).setEnabled(true);
          b.setBodyType(RigidBodyType.Dynamic, true);
          b.setLinvel({ x: 0, y: -0.4, z: 0 }, true);
          if (v) v.scale.setScalar(1);
          mode.current[i] = 'hopper';
          const waiting = mode.current.some((m) => m === 'cup' || m === 'chute');
          gacha.set({ phase: waiting ? 'ready' : 'idle' });
        }
      }
    }

    // Held capsule floats and slowly turns in front of the machine.
    mode.current.forEach((m, i) => {
      const b = bodies.current[i];
      if (!b) return;
      if (m === 'held' && !anim.current.has(i)) {
        const t = clock.current.t;
        b.setNextKinematicTranslation(vTmp.copy(holdPoint()).add(new THREE.Vector3(0, Math.sin(t * 1.7) * 0.004, 0)));
        b.setNextKinematicRotation(qTmp.setFromEuler(eTmp.set(-0.35 + Math.sin(t * 0.9) * 0.08, 1.0 + t * 0.35, 0.15)));
      } else if (m === 'chute') {
        // Settled in the cup against the flap?
        const p = b.translation(), v = b.linvel();
        if (p.z > 0.12 && p.y < 0.16 && Math.hypot(v.x, v.y, v.z) < 0.04) {
          const t0 = restTimer.current.get(i) ?? clock.current.t;
          restTimer.current.set(i, t0);
          if (clock.current.t - t0 > 0.35) { mode.current[i] = 'cup'; restTimer.current.delete(i); gacha.set({ phase: 'ready' }); }
        } else restTimer.current.delete(i);
      } else if (m === 'hopper') {
        // Anything that escaped the hopper (it should not) goes back in.
        const p = b.translation();
        if (p.y < HOPPER.floor - 0.05 || Math.abs(p.x) > INNER.x + 0.02) {
          b.setTranslation({ x: 0, y: HOPPER.ceiling - 0.05, z: 0 }, true);
          b.setLinvel({ x: 0, y: 0, z: 0 }, true);
        }
      }
    });
  });

  // ---------- scene graph ----------
  const m = materials();
  const ribs = [0, 1, 2, 3].map((k) => (k * Math.PI) / 2 + Math.PI / 4);
  return (
    <group>
      <CabinetVisual />
      <CabinetColliders ref={chute} />
      <Knob ref={knob} />

      {/* Dispensing disc with four agitator ribs, geared to the handle. */}
      <RigidBody ref={disc} type="kinematicPosition" colliders={false} position={[0, HOPPER.discTop - HOPPER.discThickness / 2, 0]} collisionGroups={G.hopperStatic} friction={0.6}>
        <CylinderCollider args={[HOPPER.discThickness / 2, HOPPER.discRadius]} />
        <mesh material={m.disc} receiveShadow><cylinderGeometry args={[HOPPER.discRadius, HOPPER.discRadius, HOPPER.discThickness, 64]} /></mesh>
        <mesh material={m.chrome} position={[0, HOPPER.discThickness / 2 + 0.002, 0]}><cylinderGeometry args={[0.018, 0.02, 0.004, 32]} /></mesh>
        {ribs.map((a, k) => (
          <group key={k} rotation={[0, a, 0]}>
            <CuboidCollider args={[0.052, 0.005, 0.0035]} position={[0.088, HOPPER.discThickness / 2 + 0.005, 0]} />
            <mesh material={m.disc} position={[0.088, HOPPER.discThickness / 2 + 0.005, 0]} castShadow receiveShadow><boxGeometry args={[0.104, 0.01, 0.007]} /></mesh>
          </group>
        ))}
      </RigidBody>

      {/* Exit flap: hinged at its top edge, held shut by a joint motor (a spring). */}
      <RigidBody ref={flap} colliders={false} position={[0, FLAP.hingeY, FLAP.z]} mass={0.03} angularDamping={0.6} collisionGroups={G.chuteStatic} ccd>
        <CuboidCollider args={[FLAP.width / 2, FLAP.height / 2, FLAP.thickness / 2]} position={[0, -FLAP.height / 2, 0]} />
        <group ref={flapGroup}><FlapVisual width={FLAP.width} height={FLAP.height} thickness={FLAP.thickness} /></group>
      </RigidBody>
      <FlapMotor joint={joint} />

      {spawn.map((s, i) => (
        <Capsule
          key={i}
          index={i}
          position={s.p}
          rotation={s.q}
          ref={(b) => { bodies.current[i] = b; }}
          visualRef={(g) => { visuals.current[i] = g; }}
          onHit={onHit}
        />
      ))}
    </group>
  );
}

/** Arms the flap's spring once the joint exists. */
function FlapMotor({ joint }: { joint: ReturnType<typeof useRevoluteJoint> }) {
  const armed = useRef(false);
  useFrame(() => {
    if (armed.current || !joint.current) return;
    joint.current.configureMotorPosition(FLAP_CLOSED, FLAP_K, FLAP_C);
    armed.current = true;
  });
  return null;
}
