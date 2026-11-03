// The gashapon mechanism. Physics (Rapier): capsules pile in the hopper on a kinematic
// dispensing disc geared to the handle; one handle turn advances the disc and releases one
// capsule into a hidden chute, where it rolls under gravity into the cup and rests against a
// hinged push-flap (src/arcade/flap.ts). Push the flap in (drag it any way, or click) and the
// capsule is drawn out under it on its own physics, lifting the flap as it passes; the flap falls
// shut behind it. Choreographed (the "hybrid" part): the hand-off from the disc pocket into the
// chute, which happens out of sight inside the cabinet, and the capsule's trip up to the visitor
// once it is out. In hand, the capsule is twisted open (Held.tsx).
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import {
  CuboidCollider, CylinderCollider, RigidBody, useRevoluteJoint,
  type CollisionEnterPayload, type RapierRigidBody,
} from '@react-three/rapier';
import { RigidBodyType } from '@dimforge/rapier3d-compat';
import { CabinetColliders, CabinetVisual, FlapVisual, Knob } from './Cabinet';
import { CapsuleBody, Capsules } from './Capsule';
import {
  CAPSULE_COUNT, CAPSULE_R, CHUTE_SPAWN, DISC_RATIO, DISPENSE_POINT, EXIT, FLAP, HOPPER, FRONT_Z, INNER, SCALE as S, WINDOW,
} from './dims';
import { G } from './groups';
import { materials } from './materials';
import { clack, clunk, flapSound, ratchet } from './sound';
import { gacha, useGacha } from './store';
import { Held, OPEN, twistState, type HeldApi, type Twist } from './Held';
import { arcade } from '../arcade/store';
import { sparkle } from '../arcade/Sparkles';
import { bezier, clamp01, easeInOut, easeOut, holdPoint, landWobble, spinDown } from '../arcade/present';
import { draw, pushFlap } from '../arcade/flap';
import { onImpact } from '../arcade/intro';
import { itemOf, itemPoint } from '../arcade/instances';
import { PROJECTS } from '../data/projects';

type Mode = 'hopper' | 'lift' | 'chute' | 'cup' | 'out' | 'held' | 'return';

const TAU = Math.PI * 2;
const DETENT = TAU / 12;                       // 12 ratchet clicks per turn
// The flap swings inward only (positive about X, up to FLAP_MAX): a capsule pushing outward meets the frame.
const FLAP_MAX = 1.5;
const FLAP_OPEN = 1.25;                    // how far a push takes it in; a capsule coming out lifts it the rest of the way
const DRAW_TIME = 3;                       // a capsule that will not come out in this long is left for another try
// Capsules in the hand: the scaled-up capsule needs to hover further out to read the same size.
const HOLD = [1.5, 0.17, 0.07] as const;
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
  const scales = useRef(Array.from({ length: CAPSULE_COUNT }, () => new THREE.Vector3(1, 1, 1)));
  const capsuleMeshes = useRef<THREE.InstancedMesh[]>([]);
  const mode = useRef<Mode[]>(Array(CAPSULE_COUNT).fill('hopper'));
  const chute = useRef<RapierRigidBody>(null);
  const flap = useRef<RapierRigidBody>(null);
  const flapGroup = useRef<THREE.Group>(null);
  const disc = useRef<RapierRigidBody>(null);
  const knob = useRef<THREE.Group>(null);
  const tray = useRef<THREE.Mesh>(null);
  const heldApi = useRef<HeldApi>(null);
  const twist = useRef<Twist>(twistState());
  const heldProject = useGacha((st) => st.held);
  const joint = useRevoluteJoint(chute, flap, [[0, FLAP.hingeY * S, FLAP.z * S], [0, 0, 0], [1, 0, 0], [0, FLAP_MAX]]);

  // Handle state: angle is negative going clockwise (as seen from the front).
  const h = useRef({ angle: 0, target: 0, dragging: false, lastPointer: 0, auto: null as null | { from: number; t: number }, detent: 0, turn: 0 });
  // Per-capsule choreography.
  const anim = useRef(new Map<number, { kind: 'lift' | 'out' | 'return' | 'land'; t: number; from: THREE.Vector3; fromQ: THREE.Quaternion }>());
  const door = useMemo(() => pushFlap(FLAP_OPEN, () => flapSound(), FLAP_MAX), []);
  const restTimer = useRef(new Map<number, number>());
  const clock = useRef({ t: 0, heldAt: 0 });
  const flapDown = useRef<null | { x: number; y: number }>(null);
  // A capsule being drawn out of the cup: since when.
  const drawing = useRef(-1);

  // ---------- actions ----------
  const dispense = () => {
    const waiting = mode.current.filter((m) => m === 'chute' || m === 'cup').length;
    if (waiting >= 2) return;                   // cup is full: the wheel turns but nothing drops
    let best = -1, bestScore = Infinity;
    mode.current.forEach((m, i) => {
      const b = bodies.current[i];
      if (m !== 'hopper' || !b) return;
      const p = b.translation();
      const lowness = p.y / S - (HOPPER.discTop + CAPSULE_R);
      const score = Math.hypot(p.x / S - DISPENSE_POINT.x, p.z / S - DISPENSE_POINT.z) + Math.max(0, lowness) * 3;
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

  // The capsule in the cup nearest the flap (the one to take), or -1.
  const waiting = () => {
    let best = -1, bestZ = 0.03 * S;   // anywhere in the cup (a flap swinging in shoves it to the back)
    mode.current.forEach((m, i) => {
      const b = bodies.current[i];
      if ((m === 'cup' || m === 'chute') && b && b.translation().z > bestZ) { bestZ = b.translation().z; best = i; }
    });
    return best;
  };

  // Reaching in for the capsule in the cup: the flap is held open and the capsule drawn out under it.
  const take = () => {
    if (drawing.current >= 0 || waiting() < 0) return;
    drawing.current = clock.current.t;
    door.holdOpen(true);
    gacha.set({ phase: 'taking' });
  };

  // Out past the flap: up to the visitor it goes, and the flap is let go.
  const taken = (i: number) => {
    const b = bodies.current[i]!;
    const p = b.translation(), q = b.rotation();
    drawing.current = -1;
    door.holdOpen(false);
    b.resetForces(true);
    b.collider(0).setEnabled(false);
    b.setBodyType(RigidBodyType.KinematicPositionBased, true);
    sparkle.burst(p, 26, 0.32 * S);
    mode.current[i] = 'out';
    anim.current.set(i, { kind: 'out', t: 0, from: new THREE.Vector3(p.x, p.y, p.z), fromQ: new THREE.Quaternion(q.x, q.y, q.z, q.w) });
    gacha.set({ phase: 'taking' });
  };

  const putBack = () => {
    const i = mode.current.indexOf('held');
    const b = bodies.current[i];
    if (!b) return;
    heldApi.current?.park();
    const p = b.translation(), q = b.rotation();
    mode.current[i] = 'return';
    anim.current.set(i, { kind: 'return', t: 0, from: new THREE.Vector3(p.x, p.y, p.z), fromQ: new THREE.Quaternion(q.x, q.y, q.z, q.w) });
  };

  // Leaving the machine: the prize in hand goes back, it can't follow the visitor down the page.
  useEffect(() => arcade.subscribe(() => {
    if (arcade.get().focus === 'gacha') return;
    drawing.current = -1; door.holdOpen(false);
    if (mode.current.includes('held')) putBack();
  }), []);

  const turnOnce = () => {
    const s = h.current;
    if (s.dragging || s.auto) return;
    s.auto = { from: s.angle, t: 0 };
  };

  useEffect(() => {
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
      const targets: THREE.Object3D[] = [...capsuleMeshes.current];
      if (knob.current) targets.push(knob.current);
      if (flapGroup.current) targets.push(flapGroup.current);
      if (tray.current) targets.push(tray.current);
      if (heldApi.current?.group?.visible) targets.push(heldApi.current.group);
      // Nearest first; a capsule only counts where it can be reached for (in the cup); the one in hand
      // is drawn by Held, which is what the pointer meets there.
      for (const h of ray.intersectObjects(targets, true)) {
        const i = itemOf(h);
        if (i >= 0) {
          if (mode.current[i] === 'cup' || mode.current[i] === 'chute') return { kind: 'cup' as const };
          continue;
        }
        let o: THREE.Object3D | null = h.object;
        while (o) {
          if (o.userData.knob) return { kind: 'knob' as const };
          if (o.userData.flap || o.userData.tray) return { kind: 'flap' as const };
          if (o.userData.held) return { kind: 'held' as const };
          o = o.parent;
        }
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
      if (arcade.get().focus !== 'gacha') return;
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
      } else if (target.kind === 'flap' || target.kind === 'cup') {
        // Push it with the pointer; a plain click is a quick push (or a reach for a waiting capsule).
        door.grab(e.clientX, e.clientY);
        flapDown.current = { x: e.clientX, y: e.clientY };
        try { el.setPointerCapture(e.pointerId); } catch { /* synthetic or already-released pointer */ }
      } else if (target.kind === 'held') {
        // Whole: a drag twists the top off. Opened: a click puts it all back.
        if (twist.current.opened) putBack();
        else {
          twist.current.drag = { x0: e.clientX, y0: e.clientY, a0: twist.current.angle };
          try { el.setPointerCapture(e.pointerId); } catch { /* synthetic or already-released pointer */ }
        }
      }
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
      if (door.dragging) { door.drag(e.clientX, e.clientY); return; }
      const tw = twist.current;
      if (tw.drag && !tw.opened) {
        // The top turns with the pointer, either way round; far enough and it comes off.
        tw.angle = tw.drag.a0 + (e.clientX - tw.drag.x0) * 0.012;
        tw.v = 0;
        if (Math.abs(tw.angle) >= OPEN) { tw.drag = null; heldApi.current?.pop(); gacha.set({ opened: true }); navigator.vibrate?.(8); }
        return;
      }
      if (arcade.get().focus === 'gacha') el.style.cursor = hit(e) ? 'pointer' : 'grab';
    };
    const up = (e: PointerEvent) => {
      const s = h.current;
      if (twist.current.drag) {
        twist.current.drag = null;
        try { if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
        return;
      }
      const fd = flapDown.current;
      if (fd) {
        flapDown.current = null;
        door.release();
        try { if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
        if (Math.hypot(e.clientX - fd.x, e.clientY - fd.y) < 6) { if (waiting() >= 0) take(); else door.push(0.35); }
        return;
      }
      if (!s.dragging) return;
      s.dragging = false;
      try { if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      if (gacha.get().phase === 'turning') gacha.set({ phase: 'idle' });
    };
    const key = (e: KeyboardEvent) => {
      if (arcade.get().focus !== 'gacha') return;
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

  // Landing on the floor in the hero opening: the whole pile jumps and rattles.
  useEffect(() => onImpact(({ machine }) => {
    if (machine !== 'gacha') return;
    mode.current.forEach((m, i) => {
      const b = bodies.current[i];
      if (m !== 'hopper' || !b) return;
      const r = () => Math.random() - 0.5;
      b.setLinvel({ x: r() * 0.3 * S, y: (0.25 + Math.random() * 0.35) * S, z: r() * 0.3 * S }, true);
      b.setAngvel({ x: r() * 12, y: r() * 12, z: r() * 12 }, true);
    });
  }), []);

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
    if (speed > 0.08 * S) clack(speed / (1.2 * S));
    void p;
  };

  // ---------- simulation step ----------
  const [hTmp, oTmp, p1Tmp, p2Tmp, axisTmp] = useMemo(() => Array.from({ length: 5 }, () => new THREE.Vector3()), []);
  const [sTmp, rTmp] = useMemo(() => [new THREE.Quaternion(), new THREE.Quaternion()], []);
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
drawing: drawing.current >= 0,
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

    door.step(dt, flap.current, joint.current);
    if (door.dragging && door.angle > 0.7 && drawing.current < 0 && waiting() >= 0) take();   // pushed open: reach in
    // Drawing the capsule out: once the flap is pushed in far enough, it is pulled along the cup floor
    // and out under the flap (lifting it as it passes); taken once it is through.
    const w = waiting(), wb = w >= 0 ? bodies.current[w] : null;
    if (drawing.current >= 0) {
      if (!wb || clock.current.t - drawing.current > DRAW_TIME) { drawing.current = -1; wb?.resetForces(true); door.holdOpen(false); gacha.set({ phase: wb ? 'ready' : 'idle' }); }
      else {
        const p = wb.translation();
        // Only once the flap is up out of its way: pulling sooner pins the capsule under its edge.
        if (door.angle > 1.25) draw(wb, p.x, p.y + 0.004 * S, (FLAP.z + CAPSULE_R + 0.08) * S, 30 * S, 0.45 * S)
        else wb.resetForces(true);   // an added force stays on until it is reset
      }
    }
    if (wb && wb.translation().z > (FLAP.z + CAPSULE_R * 0.6) * S) taken(w);   // out past the flap

    // Choreographed segments.
    for (const [i, a] of anim.current) {
      const b = bodies.current[i];
      if (!b) { anim.current.delete(i); continue; }
      // Rapier won't move a sleeping kinematic body (nor sync its mesh), so keep it awake while it is choreographed.
      b.wakeUp();
      if (a.kind === 'lift') {
        a.t = Math.min(1, a.t + dt / 0.24);
        vTmp.set(DISPENSE_POINT.x, HOPPER.floor - 0.05, DISPENSE_POINT.z).multiplyScalar(S).sub(a.from).multiplyScalar(ease(a.t)).add(a.from);
        b.setNextKinematicTranslation(vTmp);
        if (a.t >= 1) {
          anim.current.delete(i);
          b.setTranslation(vTmp.set(CHUTE_SPAWN.x, CHUTE_SPAWN.y, CHUTE_SPAWN.z).multiplyScalar(S), true);
          b.collider(0).setCollisionGroups(G.capsuleChute);
          b.collider(0).setEnabled(true);
          b.setBodyType(RigidBodyType.Dynamic, true);
          b.setLinvel({ x: 0, y: -0.15 * S, z: 0.12 * S }, true);
          mode.current[i] = 'chute';
        }
      } else if (a.kind === 'out') {
        // Up to the hand in an arc that overshoots the hold point, spinning down as it comes.
        a.t += dt;
        const hold = holdPoint(camera, hTmp, ...HOLD);
        const t = clamp01(a.t / 0.85), k = easeOut(t);
        const c1 = p1Tmp.copy(a.from).add(oTmp.set(0, 0.03, 0.12).multiplyScalar(S));
        const c2 = p2Tmp.copy(hold).add(oTmp.set(0, 0.09, -0.12).multiplyScalar(S));
        b.setNextKinematicTranslation(bezier(vTmp, a.from, c1, c2, hold, k));
        qTmp.setFromEuler(eTmp.set(-0.35, 1.0, 0.15));
        const spin = spinDown(sTmp, axisTmp.set(0.25, 1, 0.1).normalize(), 2, k);
        b.setNextKinematicRotation(rTmp.copy(a.fromQ).slerp(qTmp, easeInOut(t)).premultiply(spin));
        if (t < 0.85) sparkle.trail(vTmp, 2);
        if (t >= 1) { a.kind = 'land'; a.t = 0; }
      } else if (a.kind === 'land') {
        // Settles into the hand: squash-and-stretch wobble, then the idle float takes over.
        a.t += dt;
        scales.current[i].copy(landWobble(oTmp, a.t, 0.1));
        b.setNextKinematicTranslation(holdPoint(camera, hTmp, ...HOLD));
        if (a.t > 0.6) {
          scales.current[i].setScalar(0.001);   // from here Held draws it, in two halves
          anim.current.delete(i); mode.current[i] = 'held'; gacha.set({ phase: 'held', held: i % PROJECTS.length, opened: false });
          clock.current.heldAt = clock.current.t;
        }
      } else if (a.kind === 'return') {
        // Tossed back: a quick arc up to the window, shrinking into a puff of sparkles.
        a.t = Math.min(1, a.t + dt / 0.55);
        const k = easeInOut(a.t);
        const top = p2Tmp.set(0, (WINDOW.y0 + WINDOW.y1) / 2, FRONT_Z + 0.05).multiplyScalar(S);
        b.setNextKinematicTranslation(bezier(vTmp, a.from, p1Tmp.copy(a.from).add(oTmp.set(0, 0.16 * S, 0)), oTmp.copy(top).add(hTmp.set(0, 0.12, 0.1).multiplyScalar(S)), top, k));
        b.setNextKinematicRotation(rTmp.copy(a.fromQ).premultiply(spinDown(sTmp, axisTmp.set(1, 0.3, 0).normalize(), 1, k)));
        scales.current[i].setScalar(Math.max(0.001, 1 - Math.pow(Math.max(0, (a.t - 0.55) / 0.45), 2)));
        if (a.t >= 1) {
          sparkle.burst(top, 18, 0.22 * S);
          anim.current.delete(i);
          const x = (Math.random() - 0.5) * 0.2 * S, z = (Math.random() - 0.5) * 0.18 * S;
          b.setTranslation({ x, y: (HOPPER.ceiling - 0.05) * S, z }, true);
          b.collider(0).setCollisionGroups(G.capsuleHopper);
          b.collider(0).setEnabled(true);
          b.setBodyType(RigidBodyType.Dynamic, true);
          b.setLinvel({ x: 0, y: -0.4 * S, z: 0 }, true);
          scales.current[i].setScalar(1);
          mode.current[i] = 'hopper';
          const waiting = mode.current.some((m) => m === 'cup' || m === 'chute');
          gacha.set({ phase: waiting ? 'ready' : 'idle', held: null, opened: false });
        }
      }
    }

    // Held capsule floats and slowly turns in front of the machine.
    mode.current.forEach((m, i) => {
      const b = bodies.current[i];
      if (!b) return;
      if (m === 'held' && !anim.current.has(i)) {
        b.wakeUp();
        const t = clock.current.t;
        // Ease from the landing pose into the slow presenting turn, so nothing snaps.
        const since = t - clock.current.heldAt, blend = clamp01(since / 0.8);
        b.setNextKinematicTranslation(vTmp.copy(holdPoint(camera, hTmp, ...HOLD)).add(oTmp.set(0, Math.sin(since * 1.7) * 0.004 * S * blend, 0)));
        b.setNextKinematicRotation(qTmp.setFromEuler(eTmp.set(-0.35 + Math.sin(since * 0.9) * 0.08 * blend, 1.0 + since * 0.35 * blend * blend, 0.15)));
        if (Math.random() < dt * 1.4) sparkle.twinkle(itemPoint(hTmp, b, oTmp.set((Math.random() - 0.5) * 0.04, CAPSULE_R * 0.7, CAPSULE_R * 0.5), S, sTmp));
      } else if (m === 'chute') {
        // Settled in the cup against the flap?
        const p = b.translation(), v = b.linvel();
        if (p.z > 0.12 * S && p.y < 0.16 * S && Math.hypot(v.x, v.y, v.z) < 0.04 * S) {
          const t0 = restTimer.current.get(i) ?? clock.current.t;
          restTimer.current.set(i, t0);
          if (clock.current.t - t0 > 0.35) { mode.current[i] = 'cup'; restTimer.current.delete(i); gacha.set({ phase: 'ready' }); }
        } else restTimer.current.delete(i);
      } else if (m === 'hopper') {
        // Anything that escaped the hopper (it should not) goes back in.
        const p = b.translation();
        if (p.y < (HOPPER.floor - 0.05) * S || Math.abs(p.x) > (INNER.x + 0.02) * S) {
          b.setTranslation({ x: 0, y: (HOPPER.ceiling - 0.05) * S, z: 0 }, true);
          b.setLinvel({ x: 0, y: 0, z: 0 }, true);
        }
      }
    });
  });

  // ---------- scene graph ----------
  const m = materials();
  const ribs = [0, 1, 2, 3].map((k) => (k * Math.PI) / 2 + Math.PI / 4);
  return (
    <group scale={S}>
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

      {/* Exit flap: hinged at its top edge, swings inward only, hangs shut under its own weight. */}
      <RigidBody ref={flap} colliders={false} position={[0, FLAP.hingeY, FLAP.z]} angularDamping={0.6} gravityScale={S} collisionGroups={G.chuteStatic} ccd>
        {/* The mass goes on the collider: on the body it is ignored, leaving a flap of a fraction of a gram. */}
        <CuboidCollider args={[FLAP.width / 2, FLAP.height / 2, FLAP.thickness / 2]} position={[0, -FLAP.height / 2, 0]} mass={0.03} />
        <group ref={flapGroup}><FlapVisual width={FLAP.width} height={FLAP.height} thickness={FLAP.thickness} /></group>
      </RigidBody>
      {/* The capsule in hand: two halves on a thread, the project's token inside. */}
      <Held
        ref={heldApi}
        held={() => { const i = mode.current.indexOf('held'); return i >= 0 && !anim.current.has(i) ? bodies.current[i] : null; }}
        index={Math.max(0, mode.current.indexOf('held'))}
        project={heldProject === null ? null : PROJECTS[heldProject]}
        twist={twist}
        time={() => clock.current.t}
      />
      {/* The opening behind the flap, for the pointer (the flap itself is the usual target). */}
      <mesh ref={tray} position={[0, (EXIT.y0 + EXIT.y1) / 2, FLAP.z - 0.03]} userData={{ tray: true }}><planeGeometry args={[EXIT.x1 - EXIT.x0, EXIT.y1 - EXIT.y0]} /><meshBasicMaterial visible={false} /></mesh>

      {spawn.map((s, i) => (
        <CapsuleBody key={i} index={i} position={s.p} rotation={s.q} ref={(b) => { bodies.current[i] = b; }} onHit={onHit} />
      ))}
      <Capsules count={CAPSULE_COUNT} bodies={bodies} scales={scales} meshesRef={capsuleMeshes} />
    </group>
  );
}
