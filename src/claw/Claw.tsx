// The claw machine's mechanism, played with the machine's own controls: grab the joystick on the
// control panel and drag it any way (it springs back to centre when let go), press the big
// DROP button. Fully physical (Rapier):
//   - the gantry carriage (kinematic) follows the stick with limited acceleration, through a belt
//     with a little slop in it;
//   - the claw head hangs from it on a rope whose length is the winch: it swings when the gantry
//     starts and stops, a heavier load swings differently, and it is lowered until the rope goes
//     slack (it has landed on the pile), which is how the machine knows to stop;
//   - three fingers on one plunger are pulled shut by a solenoid: a torque that grows as the plunger
//     seats and stalls against whatever is in the way, strong for the pickup and weaker for the
//     carry, as real machines are set up; the plushies are soft (Plush.tsx), so the fingers sink in.
// Nothing holds a plushie but the fingers: the claw comes down gently with them spread, so the tips pass
// either side of it, and as they close they swing down and in, under its middle. Force and friction do
// the rest, so aim, how it lies and the swing decide whether it makes it to the chute. The fleece dents
// where the fingers press (Plush.tsx). The prize door is a push-flap (src/arcade/flap.ts): push it in (drag it
// any way, or click) and a won plushie is drawn out under it on its own physics, lifting the door as it
// passes. Its trip up to the visitor from there is choreographed.
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBox } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import {
  CapsuleCollider, CuboidCollider, CylinderCollider, RigidBody, useRevoluteJoint, useRopeJoint,
  type CollisionEnterPayload, type RapierRigidBody,
} from '@react-three/rapier';
import { MotorModel, RigidBodyType, type ImpulseJoint } from '@dimforge/rapier3d-compat';
import { flapSound, jingle, keyBeep, motor, ratchet, thud } from '../gacha/sound';
import { materials } from '../gacha/materials';
import { SPOT } from '../arcade/layout';
import { sparkle } from '../arcade/Sparkles';
import { arcade, wantShot } from '../arcade/store';
import { draw, pushFlap } from '../arcade/flap';
import { onImpact } from '../arcade/intro';
import { bezier, clamp01, easeInOut, easeOut, holdPoint, landWobble, spinDown } from '../arcade/present';
import { ClawColliders, ClawVisual, DoorGlow, clawMaterials } from './Cabinet';
import { BOX_TOP, CABLE, DOOR, FINGER, FLOOR_Y, GANTRY_Y, HOLE, HOME, HUB, IN, SHAFT, STICK, TRAVEL } from './dims';
import { PG, PLUSH_TOP, PlushBody, Plushies, SATS, SHINY, dents, soft, softTexture } from './Plush';
import { claw, pad } from './store';
import { itemOf, itemPoint, type Bend } from '../arcade/instances';

const OX = SPOT.claw.x;
const N_PLUSH = 20;
const VMAX = 0.26, ACCEL = 1.3;          // gantry speed (m/s) and acceleration (m/s^2)
const STICK_K = 320, STICK_C = 11;       // joystick return spring
const SPOOL_R = 0.011;
const ATTACH = HUB.h / 2 + 0.058;        // where the cable meets the head, above its centre
const SPOOL_Y = -0.03;                   // the cable leaves the carriage here
// The fingers. Opening and resting: a position motor (force-based: N*m per rad, N*m*s per rad), never
// asked for more than REACH ahead of where a finger is. Squeezing: the solenoid, a torque at each hinge
// (N*m) that rises as the plunger seats (a coil pulls hardest nearly closed) and simply stalls against
// whatever is in the way: it grips, it can't crush through a plushie. Strong to grab, weaker to carry
// (the weight can pry the fingers open); the carry strength varies a little from play to play, as an
// operator's settings do.
const OPEN_K = 0.5, FINGER_C = 0.032, IDLE_K = 0.1, REACH = 0.1;
const GRAB_T = 0.28, CARRY_T = 0.12;     // the solenoid's pull at the hinge (N*m), fully seated: a few newtons at the tips, enough to sink into the fleece
const SQUEEZE_C = 0.12;                  // hinge damping while it pulls: the close takes a moment, it is not a snap
const LINK_PLAY = 0.16;                  // how far (rad) one finger can close ahead of the others on the plunger
const DESCENT = 0.22;                    // m/s the winch pays out
const SQUEEZE = FINGER.closed - 0.05;    // where the solenoid pulls toward: past shut, never reached
const SLOP = 0.004;                      // m of play in the belt: the head moves only once the carriage has taken it up
// How plushies give when something hits them: a damped spring on the squash.
const GIVE_K = 130, GIVE_C = 10, GIVE_HIT = 4.5, GIVE_MIN = 0.16, GIVE_FLAT = -0.24, GIVE_LONG = 0.14;
const DOOR_OPEN = 1.3;                   // how far a push takes it in; a plushie coming out lifts it the rest of the way
const DOOR_MAX = 1.55;
const DRAW_TIME = 3;                     // a plushie that will not come out in this long is left for another try
const DOOR_X = (DOOR.x0 + DOOR.x1) / 2;
const PLUSH_R = 0.05;
type Mode = 'pit' | 'chute' | 'prize' | 'out' | 'land' | 'held' | 'return';

// Finger shape in its hinge plane (x out from the hub, y down), and matching colliders: the shaft,
// and the curled tip that hooks under a prize.
const fingerCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.022, -0.035, 0), new THREE.Vector3(0.034, -0.075, 0), new THREE.Vector3(0.02, -0.112, 0),
]);
const fingerGeo = new THREE.TubeGeometry(fingerCurve, 40, 0.0045, 10, false);
const FINGER_LINE = [[0.008, -0.02], [0.033, -0.07], [0.02, -0.112]] as const;   // the same curve, roughly, for the dents
const SHAFT_COLLIDER = { pos: [0.018, -0.045, 0] as [number, number, number], rotZ: 0.4, half: 0.036, r: 0.007 };
const TIP_COLLIDER = { pos: [0.027, -0.097, 0] as [number, number, number], rotZ: -0.46, half: 0.011, r: 0.008 };
class Spring extends THREE.Curve<THREE.Vector3> {
  constructor() { super(); }
  getPoint(t: number, out = new THREE.Vector3()) { const a = t * Math.PI * 2 * 7; return out.set(Math.cos(a) * 0.009, t * 0.034, Math.sin(a) * 0.009); }
}
const springGeo = new THREE.TubeGeometry(new Spring(), 200, 0.0013, 6, false);

// Each finger's hinge on the head, and its axis (both in the head's frame).
const YAW = [0, 1, 2].map((k) => (k * Math.PI * 2) / 3);
const HINGE = YAW.map((a) => [FINGER.root * Math.cos(a), -HUB.h / 2, -FINGER.root * Math.sin(a)] as [number, number, number]);
const HINGE_AXIS = YAW.map((a) => [Math.sin(a), 0, Math.cos(a)] as [number, number, number]);

// The rope joint's length is a limit on its distance axis; Rapier's JS API only exposes it
// through the raw joint set.
type RawJoints = { rawSet: { jointSetLimits(handle: number, axis: number, min: number, max: number): void } };
const setRopeLength = (j: ImpulseJoint, length: number) => (j as unknown as RawJoints).rawSet.jointSetLimits(j.handle, 0, 0, length);

/** The prize door: smoked plastic with the PRIZE print, hung from its top edge. */
function PrizeDoor() {
  const base = materials(), m = clawMaterials();
  const w = DOOR.x1 - DOOR.x0 - 0.008, h = DOOR.height;
  return (
    <group userData={{ cdoor: true }}>
      <RoundedBox args={[w, h, DOOR.thickness]} radius={0.0015} smoothness={2} position={[0, -h / 2, 0]} material={base.smoke} renderOrder={2} />
      <mesh material={m.prize} position={[0, -h / 2, DOOR.thickness / 2 + 0.0005]} renderOrder={3}><planeGeometry args={[0.12, 0.06]} /></mesh>
    </group>
  );
}

function spawnPile(n: number) {
  let s = 11;
  const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 - 0.5; };
  const out: { p: [number, number, number]; q: [number, number, number] }[] = [];
  const xs = [-0.31, -0.155, 0, 0.155, 0.31], zs = [-0.31, -0.155, 0, 0.155, 0.31];   // gaps a finger fits down
  for (let layer = 0; out.length < n; layer++) for (const z of zs) for (const x of xs) {
    if (out.length >= n) break;
    if (x < HOLE.x1 + 0.06 && z > HOLE.z0 - 0.06) continue;             // keep the chute clear
    out.push({ p: [OX + x + r() * 0.03, FLOOR_Y + 0.06 + layer * 0.1 + Math.abs(r()) * 0.03, z + r() * 0.03], q: [r() * 0.6, r() * 6, r() * 0.6] });
  }
  return out;
}

export default function Claw() {
  const { camera, gl } = useThree();
  const pile = useMemo(() => spawnPile(N_PLUSH), []);
  const bodies = useRef<(RapierRigidBody | null)[]>([]);
  const scales = useRef(pile.map(() => new THREE.Vector3(1, 1, 1)));
  const plushMeshes = useRef<THREE.InstancedMesh[]>([]);
  const bends = useRef<Bend[]>(pile.map(() => ({ n: new THREE.Vector3(0, 1, 0), amount: 0 })));
  const give = useRef(pile.map(() => ({ v: 0, was: new THREE.Vector3() })));
  const sats = useRef<(RapierRigidBody | null)[][]>(pile.map(() => []));
  const softTex = useMemo(() => softTexture(N_PLUSH), []);
  useEffect(() => { soft.value = softTex.tex; }, [softTex]);
  const mode = useRef<Mode[]>(pile.map(() => 'pit'));
  const bridge = useRef<THREE.Group>(null), carriage = useRef<THREE.Group>(null), cable = useRef<THREE.Mesh>(null);
  const spool = useRef<THREE.Group>(null), plunger = useRef<THREE.Mesh>(null), pulleys = useRef<(THREE.Mesh | null)[]>([]), aim = useRef<THREE.Group>(null);
  const stick = useRef<THREE.Group>(null), button = useRef<THREE.Group>(null), banks = useRef<THREE.Group[]>([]);
  const door = useRef<RapierRigidBody>(null), doorAnchor = useRef<RapierRigidBody>(null), doorGroup = useRef<THREE.Group>(null), doorGlow = useRef<THREE.Mesh>(null);
  const pocket = useRef<THREE.Mesh>(null);
  const doorDown = useRef<null | { x: number; y: number }>(null);
  // A plushie being drawn out of the pocket: since when.
  const drawing = useRef(-1);

  // The rig: carriage -> rope -> head -> three hinged fingers; the prize door on its hinge.
  const trolley = useRef<RapierRigidBody>(null), head = useRef<RapierRigidBody>(null);
  const f0 = useRef<RapierRigidBody>(null), f1 = useRef<RapierRigidBody>(null), f2 = useRef<RapierRigidBody>(null);
  const fingerBodies = [f0, f1, f2];
  const rope = useRopeJoint(trolley, head, [[0, SPOOL_Y, 0], [0, ATTACH, 0], CABLE.min + SPOOL_Y - ATTACH]);
  const j0 = useRevoluteJoint(head, f0, [HINGE[0], HINGE[0], HINGE_AXIS[0], [FINGER.closed, FINGER.open + 0.08]]);
  const j1 = useRevoluteJoint(head, f1, [HINGE[1], HINGE[1], HINGE_AXIS[1], [FINGER.closed, FINGER.open + 0.08]]);
  const j2 = useRevoluteJoint(head, f2, [HINGE[2], HINGE[2], HINGE_AXIS[2], [FINGER.closed, FINGER.open + 0.08]]);
  const hingeJoints = [j0, j1, j2];
  const doorJoint = useRevoluteJoint(doorAnchor, door, [[0, 0, 0], [0, 0, 0], [1, 0, 0], [0, DOOR_MAX]]);
  const flap = useMemo(() => pushFlap(DOOR_OPEN, () => flapSound(), DOOR_MAX), []);

  const c = useRef({
    t: 0, step: 0, cx: HOME.x, cz: HOME.z, vx: 0, vz: 0,
    L: CABLE.min, bx: HOME.x, bz: HOME.z, carry: -1, carryT: CARRY_T, slack: 0, armed: false, pressedAt: -9, celebrateUntil: 0,
    sx: 0, sz: 0, svx: 0, svz: 0, dragging: false, hover: '' as '' | 'stick' | 'button',
    auto: null as null | { x: number; z: number }, heldAt: 0,
  });
  const anim = useRef(new Map<number, { kind: 'out' | 'land' | 'return'; t: number; from: THREE.Vector3; fromQ: THREE.Quaternion }>());
  const wobble = useRef(new Map<number, { at: number; amount: number }>());
  const rest = useRef(new Map<number, number>());
  const [vTmp, oTmp, c1, c2, axis, H, top] = useMemo(() => Array.from({ length: 7 }, () => new THREE.Vector3()), []);
  const [qTmp, sTmp, rTmp, hq] = useMemo(() => Array.from({ length: 4 }, () => new THREE.Quaternion()), []);
  const eTmp = useMemo(() => new THREE.Euler(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const m = clawMaterials(), base = materials();

  const canPlay = () => claw.get().phase === 'idle' || claw.get().phase === 'prize';
  // Highest prize top under the claw (or the floor): where it will touch down.
  const topUnder = (x: number, z: number) => {
    let t = FLOOR_Y;
    mode.current.forEach((md, i) => {
      if (md !== 'pit') return;
      const p = bodies.current[i]?.translation();
      if (p && Math.hypot(p.x - x, p.z - z) < 0.065) t = Math.max(t, p.y + PLUSH_TOP * 0.7);
    });
    return t;
  };
  // The plushie riding in the claw, if any: up off the floor, between the fingers.
  const inClaw = () => {
    let best = -1, bestD = 0.075;
    mode.current.forEach((md, i) => {
      const p = md === 'pit' ? bodies.current[i]?.translation() : null;
      if (!p || p.y < FLOOR_Y + 0.08 || p.y > H.y || p.y < H.y - 0.2) return;
      const d = Math.hypot(p.x - H.x, p.z - H.z);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  };
  // A finger's hinge angle, from the head's and the finger's orientations.
  const fingerAngle = (k: number) => {
    const f = fingerBodies[k].current, hb = head.current;
    if (!f || !hb) return FINGER.idle;
    const a = hb.rotation(), b = f.rotation();
    rTmp.set(a.x, a.y, a.z, a.w).invert().multiply(qTmp.set(b.x, b.y, b.z, b.w));
    const [ax, , az] = HINGE_AXIS[k];
    return 2 * Math.atan2(rTmp.x * ax + rTmp.z * az, rTmp.w);
  };

  // ---------- actions ----------
  const drop = () => {
    c.current.pressedAt = c.current.t;
    keyBeep();
    if (!canPlay()) return;
    c.current.step = 0; c.current.auto = null;
    c.current.carryT = CARRY_T * (0.8 + Math.random() * 0.4);
    claw.set({ phase: 'dropping', lastGrab: null });
    motor(1.2, 70, 0.05);
  };

  // Reaching in for the won plushie: the door is held open and the plushie drawn out under it.
  const take = () => {
    if (drawing.current >= 0 || !mode.current.includes('prize')) return;
    drawing.current = c.current.t;
    flap.holdOpen(true);
    claw.set({ phase: 'taking' });
  };

  // Out past the door: up to the visitor it goes, and the door is let go.
  const taken = (i: number) => {
    const b = bodies.current[i]!;
    const p = b.translation(), q = b.rotation();
    drawing.current = -1;
    flap.holdOpen(false);
    b.resetForces(true);
    b.collider(0).setEnabled(false);
    b.setBodyType(RigidBodyType.KinematicPositionBased, true);
    softOff(i, true);
    sparkle.burst(p, 30, 0.38);
    mode.current[i] = 'out';
    anim.current.set(i, { kind: 'out', t: 0, from: new THREE.Vector3(p.x, p.y, p.z), fromQ: new THREE.Quaternion(q.x, q.y, q.z, q.w) });
    claw.set({ phase: 'taking' });
  };

  const putBack = () => {
    const i = mode.current.indexOf('held');
    const b = bodies.current[i];
    if (!b) return;
    const p = b.translation(), q = b.rotation();
    mode.current[i] = 'return';
    anim.current.set(i, { kind: 'return', t: 0, from: new THREE.Vector3(p.x, p.y, p.z), fromQ: new THREE.Quaternion(q.x, q.y, q.z, q.w) });
    claw.set({ phase: mode.current.includes('prize') ? 'prize' : 'idle' });
  };

  // Out of play (in hand, or on the way), a plushie's satellites ride along on their springs without
  // touching anything; back in the pit they are solid again.
  const softOff = (i: number, off: boolean) => {
    for (const sb of sats.current[i]) {
      if (!sb) continue;
      sb.collider(0).setEnabled(!off);
      sb.setGravityScale(off ? 0 : 1, true);
      if (off) { const p = bodies.current[i]!.translation(); sb.setTranslation(p, true); sb.setLinvel({ x: 0, y: 0, z: 0 }, true); }
      sb.wakeUp();
    }
  };

  // Leaving the machine: the prize in hand goes back, it can't follow the visitor down the page.
  useEffect(() => arcade.subscribe(() => {
    if (arcade.get().focus === 'claw') return;
    drawing.current = -1; flap.holdOpen(false);
    if (mode.current.includes('held')) putBack();
  }), []);

  const onHit = (i: number, p: CollisionEnterPayload) => {
    const md = mode.current[i];
    if (md !== 'pit' && md !== 'chute') return;
    const v = bodies.current[i]?.linvel();
    const speed = v ? Math.hypot(v.x, v.y, v.z) : 0;
    if (speed > 0.35) { wobble.current.set(i, { at: c.current.t, amount: Math.min(0.16, speed * 0.08) }); if (md === 'chute') thud(speed / 2); }
    void p;
  };

  if (import.meta.env.DEV) {
    // Test hook: drive the gantry to a spot (machine frame) as a player would, and press DROP.
    (window as unknown as { __claw: unknown }).__claw = {
      goto: (x: number, z: number) => { c.current.auto = { x, z }; },
      drop,
      plush: () => mode.current.map((md, i) => { const p = bodies.current[i]?.translation(); return p ? { i, md, x: p.x - OX, y: p.y, z: p.z } : null; }),
      sats: (i: number) => sats.current[i].map((sb) => { const p = sb?.translation(); return p ? [+(p.x - OX).toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3), sb!.collider(0).isEnabled()] : null; }),
      head: () => [+(H.x - OX).toFixed(3), +H.y.toFixed(3), +H.z.toFixed(3), +hq.x.toFixed(2), +hq.y.toFixed(2), +hq.z.toFixed(2), +hq.w.toFixed(2), +fingerAngle(0).toFixed(2), +fingerAngle(1).toFixed(2), +fingerAngle(2).toFixed(2)],
      tips: () => fingerBodies.map((f) => { const b = f.current; if (!b) return null; const p = b.translation(), r = b.rotation(); const q = new THREE.Quaternion(r.x, r.y, r.z, r.w); return [0, 1, 2].map((n) => { const v = new THREE.Vector3(FINGER.root + 0.02, -HUB.h / 2 - 0.112, 0).applyAxisAngle(up, YAW[n]).applyQuaternion(q).add(p as THREE.Vector3); return [+(v.x - OX).toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)]; })[fingerBodies.indexOf(f)]; }),
      win: () => { const i = mode.current.indexOf('pit'); bodies.current[i]?.setTranslation({ x: OX + (HOLE.x0 + HOLE.x1) / 2, y: FLOOR_Y + 0.12, z: (HOLE.z0 + HOLE.z1) / 2 }, true); },
    };
  }

  // ---------- input: the cabinet's joystick and DROP button, the prize door, a held plushie ----------
  useEffect(() => {
    const el = gl.domElement.parentElement ?? gl.domElement;
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(), hitP = new THREE.Vector3(), pivot = new THREE.Vector3();
    const aimRay = (e: PointerEvent) => {
      const r = gl.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
    };
    const hit = (e: PointerEvent) => {
      aimRay(e);
      const targets: THREE.Object3D[] = [...plushMeshes.current];
      if (stick.current?.parent) targets.push(stick.current.parent);
      if (button.current?.parent) targets.push(button.current.parent);
      if (doorGroup.current) targets.push(doorGroup.current);
      if (pocket.current) targets.push(pocket.current);
      // Nearest first; a plushie only counts where it can be reached for (behind the door) or put back (held).
      for (const h of ray.intersectObjects(targets, true)) {
        const i = itemOf(h);
        if (i >= 0) {
          if (mode.current[i] === 'held') return 'held';
          if (mode.current[i] === 'prize') return 'door';
          continue;
        }
        let o: THREE.Object3D | null = h.object;
        while (o) {
          if (o.userData.cstick) return 'stick';
          if (o.userData.cbutton) return 'button';
          if (o.userData.cdoor) return 'door';
          o = o.parent;
        }
      }
      return null;
    };
    // Stick deflection: where the pointer meets the horizontal plane through the ball top.
    const steer = (e: PointerEvent) => {
      const g = stick.current?.parent;
      if (!g) return;
      aimRay(e);
      g.getWorldPosition(pivot);
      plane.set(up, -(pivot.y + STICK.ball));
      if (!ray.ray.intersectPlane(plane, hitP)) return;
      let dx = (hitP.x - pivot.x) / STICK.travel, dz = (hitP.z - pivot.z) / STICK.travel;
      const d = Math.hypot(dx, dz);
      if (d > 1) { dx /= d; dz /= d; }
      pad.x = Math.abs(dx) < 0.1 ? 0 : dx;
      pad.y = Math.abs(dz) < 0.1 ? 0 : -dz;
    };
    const down = (e: PointerEvent) => {
      if (arcade.get().focus !== 'claw') return;
      const h = hit(e);
      if (!h) return;
      e.stopPropagation(); e.preventDefault();
      if (h === 'stick') {
        c.current.dragging = true; c.current.auto = null; steer(e);
        el.style.cursor = 'grabbing';
        try { el.setPointerCapture(e.pointerId); } catch { /* synthetic or already-released pointer */ }
      } else if (h === 'button') drop();
      else if (h === 'door') {
        // Push it with the pointer; a plain click is a quick push (or a reach for a waiting prize).
        flap.grab(e.clientX, e.clientY);
        doorDown.current = { x: e.clientX, y: e.clientY };
        try { el.setPointerCapture(e.pointerId); } catch { /* synthetic or already-released pointer */ }
      } else putBack();
    };
    const move = (e: PointerEvent) => {
      if (c.current.dragging) { steer(e); return; }
      if (flap.dragging) { flap.drag(e.clientX, e.clientY); return; }
      if (arcade.get().focus !== 'claw' || e.buttons) return;
      const h = hit(e);
      c.current.hover = h === 'stick' || h === 'button' ? h : '';
      el.style.cursor = h ? 'pointer' : 'grab';
    };
    const end = (e: PointerEvent) => {
      const dd = doorDown.current;
      if (dd) {
        doorDown.current = null;
        flap.release();
        try { if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
        if (Math.hypot(e.clientX - dd.x, e.clientY - dd.y) < 6) { if (mode.current.includes('prize')) take(); else flap.push(0.35); }
        return;
      }
      if (!c.current.dragging) return;
      c.current.dragging = false; pad.x = pad.y = 0;
      el.style.cursor = 'grab';
      try { if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    };
    const key = (e: KeyboardEvent) => { if (arcade.get().focus === 'claw' && e.key === 'Escape') putBack(); };
    el.addEventListener('pointerdown', down, { capture: true });
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    window.addEventListener('keydown', key);
    return () => {
      el.removeEventListener('pointerdown', down, { capture: true });
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('keydown', key);
    };
  }, [camera, gl, up]);

  // Landing on the floor in the hero opening: plushies hop, the claw swings on its rope.
  useEffect(() => onImpact(({ machine }) => {
    if (machine !== 'claw') return;
    const r = () => Math.random() - 0.5;
    mode.current.forEach((md, i) => {
      const b = bodies.current[i];
      if (md !== 'pit' || !b) return;
      b.setLinvel({ x: r() * 0.25, y: 0.45 + Math.random() * 0.5, z: r() * 0.25 }, true);
      b.setAngvel({ x: r() * 6, y: r() * 4, z: r() * 6 }, true);
      wobble.current.set(i, { at: c.current.t, amount: 0.14 });
    });
    head.current?.applyImpulse({ x: r() * 0.12, y: 0, z: r() * 0.12 }, true);
  }), []);

  // Orbiting would fight the stick drag.
  const controls = useThree((s) => s.controls) as unknown as { enabled: boolean } | null;
  const wasDragging = useRef(false);

  // ---------- simulation step ----------
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30), s = c.current, phase = claw.get().phase;
    s.t += dt; s.step += dt;
    const focused = arcade.get().focus === 'claw';
    if (focused) wantShot('claw', phase === 'prize' || phase === 'taking' ? 'pickup' : 'main');
    if (controls && s.dragging !== wasDragging.current) { controls.enabled = !s.dragging; wasDragging.current = s.dragging; }
    const hb = head.current;
    if (!hb || !rope.current || !hingeJoints.every((j) => j.current)) return;
    if (!s.armed) {
      // Rapier ignores a revolute joint's limits at creation (JS 0.14), so they are set here.
      hingeJoints.forEach((j) => { j.current!.configureMotorModel(MotorModel.ForceBased); j.current!.setLimits(FINGER.closed, FINGER.open + 0.08); });
      s.armed = true;
    }
    const hp = hb.translation(), hr = hb.rotation();
    H.set(hp.x, hp.y, hp.z); hq.set(hr.x, hr.y, hr.z, hr.w);

    // Gantry: the stick (or the return trip) sets a target velocity, reached with limited acceleration.
    let tvx = 0, tvz = 0;
    if (canPlay() && focused) { tvx = pad.x * VMAX; tvz = -pad.y * VMAX; }
    const goal = phase === 'returning' ? HOME : canPlay() ? s.auto : null;
    if (goal) {
      const dx = goal.x - s.cx, dz = goal.z - s.cz, d = Math.hypot(dx, dz), v = Math.min(VMAX, d * 2.5);
      if (d > 1e-4) { tvx = (dx / d) * v; tvz = (dz / d) * v; }
    }
    const maxDv = (s.carry >= 0 ? ACCEL * 0.6 : ACCEL) * dt;   // eases off with a load, or it swings it out of the fingers
    s.vx += THREE.MathUtils.clamp(tvx - s.vx, -maxDv, maxDv);
    s.vz += THREE.MathUtils.clamp(tvz - s.vz, -maxDv, maxDv);
    const pcx = s.cx, pL = s.L;
    s.cx = THREE.MathUtils.clamp(s.cx + s.vx * dt, -TRAVEL.x, TRAVEL.x);
    s.cz = THREE.MathUtils.clamp(s.cz + s.vz * dt, -TRAVEL.z, TRAVEL.z);
    if (Math.abs(s.cx) >= TRAVEL.x) s.vx = 0;
    if (Math.abs(s.cz) >= TRAVEL.z) s.vz = 0;
    // The belt's slop: the head's carriage only moves once the drive has taken the play up.
    s.bx = THREE.MathUtils.clamp(s.bx, s.cx - SLOP, s.cx + SLOP);
    s.bz = THREE.MathUtils.clamp(s.bz, s.cz - SLOP, s.cz + SLOP);
    trolley.current?.setNextKinematicTranslation({ x: OX + s.bx, y: GANTRY_Y, z: s.bz });

    // How slack the rope is: the head resting on something instead of hanging from it.
    top.set(0, ATTACH, 0).applyQuaternion(hq).add(H);
    s.slack = s.L + SPOOL_Y - ATTACH - top.distanceTo(c2.set(OX + s.bx, GANTRY_Y + SPOOL_Y, s.bz));

    // Claw cycle: the winch sets the rope length; the fingers are either placed (a position motor,
    // opening and resting) or squeezed by the solenoid (a torque, `pull`).
    let fingerTarget = FINGER.idle, k = IDLE_K, pull = 0;
    if (phase === 'dropping') {
      fingerTarget = FINGER.open; k = OPEN_K;
      // Lowered until the rope goes slack: it has landed on the pile (or the floor at the end of the rope).
      s.L = Math.min(CABLE.max, s.L + DESCENT * dt);
      if ((s.slack > 0.008 && s.step > 0.3) || s.L >= CABLE.max - 1e-4) {
        s.L -= Math.max(0, s.slack - 0.004);
        s.step = 0; claw.set({ phase: 'grabbing' }); ratchet();
      }
    } else if (phase === 'grabbing') {
      if (s.step < 0.1) { fingerTarget = FINGER.open; k = OPEN_K; } else pull = GRAB_T;
      if (s.step > 1.05) { s.step = 0; claw.set({ phase: 'lifting' }); motor(1.4, 60, 0.05); }
    } else if (phase === 'lifting') {
      pull = s.step < 0.9 ? GRAB_T : s.carryT;   // the pickup strength drops once it is off the floor
      if (s.step > 0.25) s.L = Math.max(CABLE.min, s.L - 0.2 * dt);
      const lifted = inClaw();                                         // up off the floor with it, or lost it on the way
      if (lifted >= 0) s.carry = lifted;
      else if (s.carry >= 0) { s.carry = -1; claw.set({ lastGrab: 'slipped' }); }
      if (s.L <= CABLE.min + 1e-4 && s.step > 0.6) {
        s.step = 0;
        claw.set({ phase: 'returning' }); motor(Math.hypot(HOME.x - s.cx, HOME.z - s.cz) / VMAX + 0.6, 85, 0.05);
      }
    } else if (phase === 'returning') {
      pull = s.carryT;
      if (s.carry >= 0 && inClaw() !== s.carry) { s.carry = -1; claw.set({ lastGrab: 'slipped' }); }
      if (Math.hypot(HOME.x - s.cx, HOME.z - s.cz) < 0.003 && Math.hypot(s.vx, s.vz) < 0.02 && s.step > 0.4) { s.step = 0; claw.set({ phase: 'releasing' }); }
    } else if (phase === 'releasing') {
      if (s.carry >= 0) { wobble.current.set(s.carry, { at: s.t, amount: 0.12 }); s.carry = -1; }
      fingerTarget = s.step < 0.9 ? FINGER.open : FINGER.idle; k = OPEN_K;
      if (s.step > 1.4) claw.set({ phase: mode.current.includes('prize') ? 'prize' : 'idle', lastGrab: claw.get().lastGrab ?? 'missed' });
    }
    if (s.L !== pL || phase === 'dropping') { setRopeLength(rope.current, s.L + SPOOL_Y - ATTACH); hb.wakeUp(); }
    // One plunger drives all three: a finger that meets something holds the others back with it, so they
    // close as a set and centre what is between them, instead of one running past and pinching it out.
    const a0 = fingerAngle(0), a1 = fingerAngle(1), a2 = fingerAngle(2), lead = Math.max(a0, a1, a2);
    const seated = THREE.MathUtils.clamp((FINGER.open - (a0 + a1 + a2) / 3) / (FINGER.open - FINGER.closed), 0, 1);
    hingeJoints.forEach((j, n) => {
      const at = n === 0 ? a0 : n === 1 ? a1 : a2;
      if (pull > 0) {
        // The solenoid: the coil's torque pulls the finger shut, harder the further the plunger has seated,
        // and stalls against whatever is in the way; a finger ahead of the others on the plunger waits. It
        // is put through the hinge motor (a stiffness that gives exactly that torque from where the finger
        // is, toward a target it never reaches), so the solver handles it: a torque kicked in per frame
        // throws a finger this light through its stops.
        const want = at > lead - LINK_PLAY && at > FINGER.closed + 0.02 ? pull * (0.55 + 0.9 * seated) : 0;
        j.current!.configureMotorPosition(SQUEEZE, want / Math.max(at - SQUEEZE, 0.2), SQUEEZE_C);   // never so stiff it drives through the stop
      } else j.current!.configureMotorPosition(THREE.MathUtils.clamp(Math.max(fingerTarget, lead - LINK_PLAY), at - REACH, at + REACH), k, FINGER_C);
    });
    // A real head barely spins on its cable: damp any twist about the vertical.
    const w = hb.angvel();
    if (Math.abs(w.y) > 0.01) hb.setAngvel({ x: w.x, y: w.y * (1 - Math.min(1, 6 * dt)), z: w.z }, true);

    if (import.meta.env.DEV) {
      const counts: Record<string, number> = {};
      mode.current.forEach((md) => { counts[md] = (counts[md] ?? 0) + 1; });
      document.body.dataset.claw = JSON.stringify({
        phase, counts, cx: +s.cx.toFixed(3), cz: +s.cz.toFixed(3), L: +s.L.toFixed(3), slack: +s.slack.toFixed(4),
        sway: +Math.hypot(H.x - OX - s.cx, H.z - s.cz).toFixed(4), carry: s.carry, lastGrab: claw.get().lastGrab,
        pad: [+pad.x.toFixed(2), +pad.y.toFixed(2)], finger: +fingerAngle(0).toFixed(3), door: +flap.angle.toFixed(3),
        prize: (() => { const i = mode.current.indexOf('prize'); const p = i >= 0 ? bodies.current[i]?.translation() : null; return p ? [+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)] : null; })(),
        drawing: drawing.current >= 0,
      });
    }

    // Visuals: gantry (bridge, belt pulleys, carriage, winch spool), cable, plunger.
    if (bridge.current) bridge.current.position.z = s.cz;
    if (carriage.current) carriage.current.position.set(s.cx, GANTRY_Y, s.cz);
    pulleys.current.forEach((p) => { if (p) p.rotation.y += (s.cx - pcx) / 0.012; });
    if (spool.current) spool.current.rotation.x += (s.L - pL) / SPOOL_R;
    if (plunger.current) plunger.current.position.y = -HUB.h / 2 - 0.006 - 0.012 * clamp01((FINGER.open - fingerAngle(0)) / (FINGER.open - FINGER.closed));
    if (cable.current) {
      const a = c2.set(s.cx, GANTRY_Y + SPOOL_Y, s.cz), d = oTmp.set(top.x - OX, top.y, top.z).sub(a), len = d.length();
      cable.current.position.copy(a).addScaledVector(d, 0.5);
      cable.current.scale.set(1, Math.max(1e-3, len), 1);
      cable.current.quaternion.setFromUnitVectors(up, d.normalize());
    }

    // Aim marker: a red ring on whatever the claw would land on.
    if (aim.current) {
      const show = focused && canPlay();
      aim.current.visible = show;
      if (show) {
        aim.current.position.set(H.x - OX, topUnder(H.x, H.z) + 0.003, H.z);
        aim.current.scale.setScalar(1 + 0.12 * Math.sin(s.t * 6));
      }
    }

    // Soft bodies: a knock shows as a squash along it, springing back. Sleeping ones are left alone.
    mode.current.forEach((md, i) => {
      const b = bodies.current[i], g = give.current[i], bend = bends.current[i];
      if (!b || (md !== 'pit' && md !== 'chute')) { bend.amount = g.v = 0; return; }
      if (b.isSleeping() && !bend.amount) return;
      const v = b.linvel();
      oTmp.set(v.x, v.y, v.z).sub(g.was);
      g.was.set(v.x, v.y, v.z);
      const hit = oTmp.length();
      if (hit > GIVE_MIN) { bend.n.copy(oTmp).divideScalar(hit); g.v -= Math.min(hit, 1.5) * GIVE_HIT; }
      g.v += (-GIVE_K * bend.amount - GIVE_C * g.v) * dt;
      bend.amount = THREE.MathUtils.clamp(bend.amount + g.v * dt, GIVE_FLAT, GIVE_LONG);
      if (Math.abs(bend.amount) < 0.002 && Math.abs(g.v) < 0.02) bend.amount = g.v = 0;
    });

    // Where the fingers are, for the fleece to dent round (Plush.tsx).
    // Where each plushie's satellites have gone, for the fabric to follow (Plush.tsx).
    mode.current.forEach((md, i) => {
      const b = bodies.current[i];
      if (!b) return;
      const p = b.translation(), r = b.rotation();
      qTmp.set(r.x, r.y, r.z, r.w);
      softTex.set(i, 0, p.x, p.y, p.z);
      sats.current[i].forEach((sb, kk) => {
        c1.set(...SATS[kk]).applyQuaternion(qTmp);                         // rest offset, world
        const n = c2.copy(c1).normalize();
        const sp = sb && md === 'pit' ? sb.translation() : null;
        oTmp.set(sp ? sp.x - p.x - c1.x : 0, sp ? sp.y - p.y - c1.y : 0, sp ? sp.z - p.z - c1.z : 0);   // gone from rest
        softTex.set(i, 1 + 2 * kk, n.x, n.y, n.z);
        softTex.set(i, 2 + 2 * kk, oTmp.x, oTmp.y, oTmp.z);
      });
    });
    softTex.tex.needsUpdate = true;
    dents.at.value.set(H.x, H.y - 0.07, H.z);
    fingerBodies.forEach((f, n) => {
      const b = f.current;
      if (!b) return;
      const p = b.translation(), r = b.rotation();
      qTmp.set(r.x, r.y, r.z, r.w);
      FINGER_LINE.forEach(([x, y], j) => dents.line.value[n * FINGER_LINE.length + j]
        .set(FINGER.root + x, -HUB.h / 2 + y, 0).applyAxisAngle(up, YAW[n]).applyQuaternion(qTmp).add(p as THREE.Vector3));
    });

    // Door: a push-flap on its top hinge. Drawing the prize out: once the door is pushed in far enough,
    // the plushie is pulled along the pocket floor and out under the door (lifting it as it passes).
    flap.step(dt, door.current, doorJoint.current);
    if (flap.dragging && flap.angle > 0.7 && drawing.current < 0 && mode.current.includes('prize')) take();   // pushed open: reach in
    const pi = mode.current.indexOf('prize'), pb = pi >= 0 ? bodies.current[pi] : null;
    if (drawing.current >= 0) {
      if (!pb || s.t - drawing.current > DRAW_TIME) { drawing.current = -1; pb?.resetForces(true); flap.holdOpen(false); claw.set({ phase: pb ? 'prize' : 'idle' }); }
      else {
        const p = pb.translation();
        // Only once the door is up out of its way: pulling sooner pins the plushie under its edge.
        if (flap.angle > 1.3) draw(pb, OX + DOOR_X, p.y + 0.01, DOOR.z + PLUSH_R + 0.1, 25, 0.45)
        else pb.resetForces(true);   // an added force stays on until it is reset
      }
    }
    if (pb && pb.translation().z > DOOR.z + PLUSH_R + 0.012) taken(pi);   // out past the door
    const waiting = mode.current.includes('prize');
    if (doorGlow.current) doorGlow.current.visible = waiting;
    m.doorGlow.opacity = 0.45 + 0.4 * Math.sin(s.t * 5);

    // Squash-and-stretch jiggles after a squeeze or a landing.
    for (const [i, wb] of wobble.current) {
      const md = mode.current[i];
      if (md === 'out' || md === 'land' || md === 'held' || md === 'return' || i === s.carry) { wobble.current.delete(i); continue; }
      const since = s.t - wb.at;
      scales.current[i].copy(landWobble(c1, since, wb.amount));
      if (since > 0.7) { scales.current[i].setScalar(1); wobble.current.delete(i); }
    }

    // Prizes: falling down the chute, landing behind the door, escaping the pit.
    mode.current.forEach((md, i) => {
      const b = bodies.current[i];
      if (!b) return;
      const p = b.translation();
      if (md === 'pit') {
        if (p.x < OX + HOLE.x1 && p.z > HOLE.z0 && p.y < FLOOR_Y - 0.03) { mode.current[i] = 'chute'; if (s.carry === i) s.carry = -1; }
        else if (p.y < 0.05 || Math.abs(p.x - OX) > IN + 0.05 || Math.abs(p.z) > IN + 0.05 || p.y > BOX_TOP + 0.2) {
          b.setTranslation({ x: OX + 0.1, y: GANTRY_Y - 0.15, z: -0.1 }, true); b.setLinvel({ x: 0, y: 0, z: 0 }, true);
        }
      } else if (md === 'chute') {
        const v = b.linvel();
        if (p.y < DOOR.y1 && Math.hypot(v.x, v.y, v.z) < 0.05) {
          const t0 = rest.current.get(i) ?? s.t; rest.current.set(i, t0);
          if (s.t - t0 > 0.3) {
            rest.current.delete(i); mode.current[i] = 'prize';
            jingle(); s.celebrateUntil = s.t + 2.2;
            sparkle.burst({ x: OX + (DOOR.x0 + DOOR.x1) / 2, y: (DOOR.y0 + DOOR.y1) / 2, z: DOOR.z + 0.03 }, 34, 0.4);
            claw.set({ lastGrab: 'won', ...(canPlay() ? { phase: 'prize' as const } : {}) });
          }
        } else rest.current.delete(i);
      } else if (md === 'held' && !anim.current.has(i)) {
        b.wakeUp();
        const since = s.t - s.heldAt, blend = clamp01(since / 0.8);
        b.setNextKinematicTranslation(vTmp.copy(holdPoint(camera, oTmp, 0.72, 0.07, 0.03)).add(c1.set(0, Math.sin(since * 1.6) * 0.005 * blend, 0)));
        b.setNextKinematicRotation(rTmp.copy(camera.quaternion).multiply(qTmp.setFromEuler(eTmp.set(Math.sin(since * 0.8) * 0.12 * blend, Math.sin(since * 0.7) * 0.6 * blend, Math.sin(since * 1.1) * 0.08 * blend))));
        if (i === SHINY && Math.random() < dt * 2) sparkle.twinkle(itemPoint(c1, b, c2.set((Math.random() - 0.5) * 0.08, Math.random() * 0.06, 0.04), 1, sTmp));
      }
    });

    // Hand-off: reach in past the door, draw the prize out under it, up to the visitor.
    for (const [i, a] of anim.current) {
      const b = bodies.current[i], sc = scales.current[i];
      if (!b) { anim.current.delete(i); continue; }
      // Rapier won't move a sleeping kinematic body, so keep it awake while it is choreographed.
      b.wakeUp();
      if (a.kind === 'out') {
        a.t += dt;
        const hold = holdPoint(camera, oTmp, 0.72, 0.07, 0.03);
        const t = clamp01(a.t / 0.9), kk = easeOut(t);
        c1.copy(a.from).add(axis.set(0, 0.06, 0.14));
        c2.copy(hold).add(axis.set(0, 0.11, -0.16));
        b.setNextKinematicTranslation(bezier(vTmp, a.from, c1, c2, hold, kk));
        b.setNextKinematicRotation(rTmp.copy(a.fromQ).slerp(camera.quaternion, easeInOut(t)).multiply(spinDown(sTmp, axis.set(0, 1, 0), 1, kk)));
        if (t < 0.85) sparkle.trail(vTmp, 2);
        if (t >= 1) { a.kind = 'land'; a.t = 0; }
      } else if (a.kind === 'land') {
        a.t += dt;
        sc.copy(landWobble(c1, a.t, 0.14));    // plush: extra squishy
        b.setNextKinematicTranslation(holdPoint(camera, oTmp, 0.72, 0.07, 0.03));
        b.setNextKinematicRotation(camera.quaternion);
        if (a.t > 0.7) { sc.setScalar(1); anim.current.delete(i); mode.current[i] = 'held'; s.heldAt = s.t; claw.set({ phase: 'held' }); }
      } else if (a.kind === 'return') {
        // Tossed back over the top into the pit.
        a.t = Math.min(1, a.t + dt / 0.65);
        const kk = easeInOut(a.t);
        const over = c2.set(OX + 0.05, BOX_TOP + 0.1, 0.05);
        b.setNextKinematicTranslation(bezier(vTmp, a.from, c1.copy(a.from).add(axis.set(0, 0.25, 0)), oTmp.copy(over).add(axis.set(0, 0.2, 0.3)), over, kk));
        b.setNextKinematicRotation(rTmp.copy(a.fromQ).multiply(spinDown(sTmp, axis.set(1, 0, 0), 1, kk)));
        sc.setScalar(Math.max(0.001, 1 - Math.pow(Math.max(0, (a.t - 0.55) / 0.45), 2)));
        if (a.t >= 1) {
          sparkle.burst(over, 20, 0.24);
          anim.current.delete(i);
          sc.setScalar(1);
          b.setTranslation({ x: OX + (Math.random() - 0.2) * 0.3, y: GANTRY_Y - 0.12, z: (Math.random() - 0.6) * 0.3 }, true);
          b.collider(0).setEnabled(true);
          b.setBodyType(RigidBodyType.Dynamic, true);
          b.setLinvel({ x: 0, y: -0.3, z: 0 }, true);
          softOff(i, false);
          mode.current[i] = 'pit';
        }
      }
    }

    // Joystick: follows your drag, springs back (with a little overshoot) when let go.
    const tx = canPlay() || s.dragging ? pad.x : 0, tz = canPlay() || s.dragging ? -pad.y : 0;
    s.svx += (STICK_K * (tx - s.sx) - STICK_C * s.svx) * dt; s.sx += s.svx * dt;
    s.svz += (STICK_K * (tz - s.sz) - STICK_C * s.svz) * dt; s.sz += s.svz * dt;
    if (stick.current) stick.current.rotation.set(STICK.tilt * s.sz, 0, -STICK.tilt * s.sx);
    m.stickBall.emissiveIntensity = s.dragging ? 0.55 : s.hover === 'stick' ? 0.35 : 0;
    if (button.current) { const d = s.t - s.pressedAt; button.current.position.y = d < 0.25 ? -0.006 * Math.sin((d / 0.25) * Math.PI) : 0; }
    m.glow.emissiveIntensity = canPlay() ? 1.2 + 1.0 * Math.sin(s.t * 4) + (s.hover === 'button' ? 1.2 : 0) : 0.15;
    m.red.emissiveIntensity = s.hover === 'button' && canPlay() ? 0.35 : 0;
    const tick = Math.floor(s.t / (s.t < s.celebrateUntil ? 0.08 : 0.28));
    banks.current.forEach((g, bank) => g.children.forEach((o) => { (o as THREE.Mesh).material = (tick + bank) % 2 ? m.bulbOn : m.bulbOff; }));
  });

  const start: [number, number, number] = [OX + HOME.x, GANTRY_Y - CABLE.min, HOME.z];
  return (
    <group>
      <group position={[OX, 0, 0]}>
        <ClawVisual stickRef={stick} buttonRef={button} bulbsRef={banks} />
        <DoorGlow glowRef={doorGlow} />
        {/* gantry: a bridge riding the side rails on two carriages, a belt with end pulleys */}
        <group ref={bridge}>
          <mesh material={base.steel} position={[0, GANTRY_Y + 0.02, 0]}><boxGeometry args={[2 * IN, 0.016, 0.03]} /></mesh>
          <mesh material={base.rubber} position={[0, GANTRY_Y + 0.031, 0.009]}><boxGeometry args={[2 * IN - 0.05, 0.004, 0.008]} /></mesh>
          {[-1, 1].map((sx) => (
            <group key={sx} position={[sx * IN, GANTRY_Y + 0.02, 0]}>
              <mesh material={base.glossBlack} castShadow><boxGeometry args={[0.034, 0.03, 0.06]} /></mesh>
              <mesh ref={(p) => { pulleys.current[sx < 0 ? 0 : 1] = p; }} material={base.chrome} position={[-sx * 0.03, 0.012, 0.009]}><cylinderGeometry args={[0.011, 0.011, 0.012, 20]} /></mesh>
            </group>
          ))}
        </group>
        {/* carriage: motor block and the winch spool the cable winds onto */}
        <group ref={carriage}>
          <mesh material={base.glossBlack} castShadow><boxGeometry args={[0.07, 0.035, 0.06]} /></mesh>
          <mesh material={base.steel} position={[0.044, 0.002, 0]} rotation-z={Math.PI / 2}><cylinderGeometry args={[0.014, 0.014, 0.022, 20]} /></mesh>
          <group ref={spool} position={[0, SPOOL_Y, 0]}>
            <mesh material={base.rubber} rotation-z={Math.PI / 2}><cylinderGeometry args={[SPOOL_R, SPOOL_R, 0.03, 16]} /></mesh>
            <mesh material={base.chrome} position={[0.016, 0, 0]} rotation-z={Math.PI / 2}><cylinderGeometry args={[0.016, 0.016, 0.004, 20]} /></mesh>
            <mesh material={base.chrome} position={[-0.016, 0, 0]} rotation-z={Math.PI / 2}><cylinderGeometry args={[0.016, 0.016, 0.004, 20]} /></mesh>
            <mesh material={base.chrome} position={[0.006, SPOOL_R, 0]}><boxGeometry args={[0.004, 0.003, 0.004]} /></mesh>
          </group>
        </group>
        <mesh ref={cable} material={base.rubber}><cylinderGeometry args={[0.0021, 0.0021, 1, 6]} /></mesh>
        <group ref={aim} rotation-x={-Math.PI / 2}>
          <mesh material={m.aim}><ringGeometry args={[0.028, 0.034, 40]} /></mesh>
          <mesh material={m.aim}><circleGeometry args={[0.006, 20]} /></mesh>
        </group>
        {/* The pocket opening behind the door, for the pointer (the door itself is the usual target). */}
        <mesh ref={pocket} position={[DOOR_X, (DOOR.y0 + DOOR.y1) / 2, DOOR.z - 0.03]} userData={{ cdoor: true }}><planeGeometry args={[DOOR.x1 - DOOR.x0, DOOR.y1 - DOOR.y0]} /><meshBasicMaterial visible={false} /></mesh>
      </group>
      <ClawColliders x={OX} />

      {/* the rig: carriage (kinematic), the head on its rope, three motorised fingers */}
      <RigidBody ref={trolley} type="kinematicPosition" canSleep={false} colliders={false} position={[OX + HOME.x, GANTRY_Y, HOME.z]} />
      <RigidBody ref={head} canSleep={false} colliders={false} position={start} linearDamping={0.12} angularDamping={1.5} ccd>
        <CylinderCollider args={[HUB.h / 2, HUB.r]} mass={0.25} collisionGroups={PG.finger} friction={0.6} />
        {/* claw head: spring, solenoid, chrome body, plunger, finger brackets */}
        <mesh geometry={springGeo} material={base.chrome} position={[0, HUB.h / 2 + 0.024, 0]} />
        <mesh material={base.glossBlack} position={[0, HUB.h / 2 + 0.012, 0]} castShadow><cylinderGeometry args={[0.016, 0.018, 0.024, 20]} /></mesh>
        <mesh material={base.chrome} castShadow><cylinderGeometry args={[HUB.r, HUB.r * 0.85, HUB.h, 28]} /></mesh>
        <mesh material={m.trim} position={[0, HUB.h / 2 + 0.002, 0]}><cylinderGeometry args={[HUB.r * 1.02, HUB.r * 1.02, 0.006, 28]} /></mesh>
        <mesh ref={plunger} material={base.steel}><cylinderGeometry args={[0.006, 0.006, 0.022, 12]} /></mesh>
        {YAW.map((a, k) => (
          <group key={k} rotation-y={a}><mesh material={base.glossBlack} position={[FINGER.root, -HUB.h / 2 + 0.004, 0]}><boxGeometry args={[0.012, 0.012, 0.014]} /></mesh></group>
        ))}
      </RigidBody>
      {YAW.map((a, k) => (
        <RigidBody key={k} ref={fingerBodies[k]} canSleep={false} colliders={false} position={start} angularDamping={0.5} ccd>
          <group rotation-y={a}>
            <group position={[FINGER.root, -HUB.h / 2, 0]}>
              <CapsuleCollider args={[SHAFT_COLLIDER.half, SHAFT_COLLIDER.r]} position={SHAFT_COLLIDER.pos} rotation={[0, 0, SHAFT_COLLIDER.rotZ]} mass={0.035} collisionGroups={PG.finger} friction={1.2} />
              <CapsuleCollider args={[TIP_COLLIDER.half, TIP_COLLIDER.r]} position={TIP_COLLIDER.pos} rotation={[0, 0, TIP_COLLIDER.rotZ]} mass={0.015} collisionGroups={PG.finger} friction={2} />
              <mesh geometry={fingerGeo} material={base.chrome} castShadow />
              <mesh material={base.steel} position={[-0.008, -0.012, 0]} rotation-z={0.9}><cylinderGeometry args={[0.0022, 0.0022, 0.026, 8]} /></mesh>
              <mesh material={base.rubber} position={[0.02, -0.112, 0]}><sphereGeometry args={[0.0075, 12, 8]} /></mesh>
            </group>
          </group>
        </RigidBody>
      ))}

      {/* Prize door: hinged at its top edge, swings inward only, hangs shut under its own weight. */}
      <RigidBody ref={doorAnchor} type="fixed" colliders={false} position={[OX + (DOOR.x0 + DOOR.x1) / 2, DOOR.hingeY, DOOR.z]} />
      <RigidBody ref={door} canSleep={false} colliders={false} position={[OX + (DOOR.x0 + DOOR.x1) / 2, DOOR.hingeY, DOOR.z]} angularDamping={0.4} ccd>
        <CuboidCollider args={[(DOOR.x1 - DOOR.x0) / 2, DOOR.height / 2, DOOR.thickness / 2]} position={[0, -DOOR.height / 2, 0]} mass={0.05} collisionGroups={PG.static} />
        <group ref={doorGroup}><PrizeDoor /></group>
      </RigidBody>
      {/* The flat front of the pocket floor, behind the door. */}
      <RigidBody type="fixed" colliders={false} collisionGroups={PG.static}>
        <CuboidCollider args={[(HOLE.x1 - HOLE.x0) / 2, 0.006, (SHAFT.floorFront - SHAFT.bottomFront[0]) / 2 + 0.01]} position={[OX + DOOR_X, SHAFT.bottomFront[1] - 0.006, (SHAFT.floorFront + SHAFT.bottomFront[0]) / 2]} />
      </RigidBody>
      {pile.map((p, i) => (
        <PlushBody key={i} index={i} position={p.p} rotation={p.q} ref={(b) => { bodies.current[i] = b; }} onHit={onHit} onSatellite={(pi, kk, sb) => { sats.current[pi][kk] = sb; }} />
      ))}
      <Plushies count={N_PLUSH} bodies={bodies} scales={scales} bends={bends} meshesRef={plushMeshes} />
    </group>
  );
}
