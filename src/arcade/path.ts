// The scroll journey: where the camera and the three machines are at each point down the page.
// Everything happens on one number, t, which track.ts works out from the scroll position:
//
//   t   the page             the camera                              the machines
//   0   hero                 hero framing, looking left of the row   the row, as they landed
//   1   Experience           right of the row, turned in from the    vending pulled forward, on the left of
//                            right                                   the screen; the other two out to the left
//   2   Projects             swung across to turned in from the left gacha pulled forward, on the right of the
//                                                                    screen; the others out either side
//   3   About                swung back, turned in from the right    claw pulled forward, on the left of the
//                                                                    screen; the others out to the right
//   4   Contact              the hero framing again, a little higher the row again
//
// Between two stops the camera pulls back and rises (the VIA point), so it sees one machine slide
// home as the next comes out, then pushes in. The machines keep their left-to-right order the whole
// way, so they never pass through each other: only the camera crosses the row. Only their looks
// move (Drop.tsx); their physics stays where it is at their SPOT.
import * as THREE from 'three';
import { HERO_POSE, INTERIOR_LIGHT, ORDER, SPOT, VIEW, heroEye } from './layout';
import type { MachineId } from './store';

type Scene = { machine: MachineId; side: -1 | 1; x: number; z: number };
// side: which half of the screen it takes (-1 left, the cards go on the right). x, z: where it stands.
const SCENES: (Scene | null)[] = [
  null,
  { machine: 'vending', side: -1, x: 1.75, z: 1.3 },
  { machine: 'gacha', side: 1, x: 0, z: 1.3 },
  { machine: 'claw', side: -1, x: -1.7, z: 1.3 },
  null,
];
export const LAST = SCENES.length - 1;

const TURN = 0.22;                 // the camera comes in this far (radians) from the side the machine is on
const FACE = 0.2;                  // and the machine turns this much further, toward the cards
const LIFT = 0.05;                 // the camera looks slightly down on a machine
const MACHINE_H = 1.92, MID_H = 0.96;
const FILL = 0.8, FILL_STACKED = 0.52;   // share of the screen height a machine takes
const VIA_BACK = 1.5, VIA_RISE = 0.5;    // how far the camera pulls back and rises between two stops
const END_RISE = 0.28;             // the Contact stop's extra height over the hero
const PARK_Z = 0.1;                // parked machines stand this far out
const PARK_GAP = 1.15;             // between two parked machines
const PARK_CLEAR = 0.75;           // past the edge of the frame
export const STACKED = 1.1;        // narrower than this the machine sits above its cards (same in styles.css)
const TAN = Math.tan((26 * Math.PI) / 360);     // half the camera's vertical field of view (Stage.tsx)

const ease = (t: number) => t * t * (3 - 2 * t);
const part = (u: number, from: number, to: number) => ease(Math.min(1, Math.max(0, (u - from) / (to - from))));
const row = (m: MachineId) => ({ x: SPOT[m].x + HERO_POSE[m].x, z: HERO_POSE[m].z, yaw: HERO_POSE[m].yaw });

export type Pose = { x: number; z: number; yaw: number };
type Stop = { eye: THREE.Vector3; look: THREE.Vector3; poses: Record<MachineId, Pose> };

/** Where a machine has to stand at depth PARK_Z to be just outside the frame, on side s. */
function frameEdge(eye: THREE.Vector3, look: THREE.Vector3, aspect: number, s: number) {
  const f = look.clone().sub(eye).normalize(), r = new THREE.Vector3(-f.z, 0, f.x).normalize();
  const K = TAN * aspect, dz = PARK_Z - eye.z;
  return eye.x + (dz * (s * K * f.z - r.z)) / (r.x - s * K * f.x);
}

function build(aspect: number) {
  const stacked = aspect < STACKED;
  const heroLook = new THREE.Vector3(...VIEW.hero.main.target), heroAt = new THREE.Vector3(...heroEye(aspect));
  const home = { claw: row('claw'), gacha: row('gacha'), vending: row('vending') };

  const stops: Stop[] = SCENES.map((scene, k) => {
    if (!scene) {
      const eye = heroAt.clone();
      if (k) eye.y += END_RISE;
      return { eye, look: heroLook.clone(), poses: home };
    }
    const turn = -scene.side * TURN;
    const visH = MACHINE_H / (stacked ? FILL_STACKED : FILL), d = visH / (2 * TAN), visW = visH * aspect;
    const right = new THREE.Vector3(Math.cos(turn), 0, -Math.sin(turn));
    const look = new THREE.Vector3(scene.x, MID_H, scene.z);
    if (stacked) look.y -= visH * 0.22;          // the machine in the top half
    else look.addScaledVector(right, -scene.side * visW * 0.25);
    const eye = look.clone().add(new THREE.Vector3(Math.sin(turn) * Math.cos(LIFT), Math.sin(LIFT), Math.cos(turn) * Math.cos(LIFT)).multiplyScalar(d));

    // The others go out of frame on their own side, keeping the row's order.
    const at = ORDER.indexOf(scene.machine);
    const poses = {} as Record<MachineId, Pose>;
    ORDER.forEach((m, i) => {
      if (m === scene.machine) { poses[m] = { x: scene.x, z: scene.z, yaw: turn - scene.side * FACE }; return; }
      const s = i < at ? -1 : 1;
      poses[m] = { x: frameEdge(eye, look, aspect, s) + s * (PARK_CLEAR + PARK_GAP * (Math.abs(i - at) - 1)), z: PARK_Z, yaw: 0 };
    });
    return { eye, look, poses };
  });

  // Stop, pull-back, stop, pull-back... : t lands exactly on the stops, the via points halfway.
  const eyes: THREE.Vector3[] = [], looks: THREE.Vector3[] = [];
  stops.forEach((s, k) => {
    eyes.push(s.eye); looks.push(s.look);
    const next = stops[k + 1];
    if (!next) return;
    eyes.push(s.eye.clone().lerp(next.eye, 0.5).add(new THREE.Vector3(0, VIA_RISE, VIA_BACK)));
    looks.push(s.look.clone().lerp(next.look, 0.5));
  });
  const eyeCurve = new THREE.CatmullRomCurve3(eyes), lookCurve = new THREE.CatmullRomCurve3(looks);

  return {
    /** The camera at t; `dolly` (0..1) is a slow push in while a section is read. */
    camera(t: number, dolly: number, eye: THREE.Vector3, look: THREE.Vector3) {
      const i = Math.min(LAST - 1, Math.floor(t)), s = (i + ease(t - i)) / LAST;
      eyeCurve.getPoint(s, eye); lookCurve.getPoint(s, look);
      if (dolly) eye.lerp(look, dolly * 0.05);
    },
    /** A machine at t. Coming out it steps forward first, then across; going home, the reverse. */
    pose(m: MachineId, t: number, dolly: number, out: Pose) {
      const i = Math.min(LAST - 1, Math.floor(t)), u = t - i, a = stops[i].poses[m], b = stops[i + 1].poses[m];
      const coming = SCENES[i + 1]?.machine === m, going = SCENES[i]?.machine === m;
      const across = coming ? part(u, 0.25, 1) : going ? part(u, 0, 0.75) : ease(u);
      const forward = coming ? part(u, 0, 0.7) : going ? part(u, 0.3, 1) : ease(u);
      const turning = coming ? across : going ? across : ease(u);
      out.x = a.x + (b.x - a.x) * across;
      out.z = a.z + (b.z - a.z) * forward;
      out.yaw = a.yaw + (b.yaw - a.yaw) * turning + (going && !u ? -SCENES[i]!.side * dolly * 0.07 : 0);
      return out;
    },
    /** At rest at a section, the two machines it doesn't show are out of frame and aren't drawn. */
    hidden(m: MachineId, t: number) {
      const k = Math.round(t), scene = SCENES[k];
      return !!scene && Math.abs(t - k) < 0.002 && scene.machine !== m;
    },
  };
}

const paths = new Map<number, ReturnType<typeof build>>();
/** The journey for a screen shape. */
export function pathFor(aspect: number) {
  const key = Math.round(aspect * 100) / 100;
  let p = paths.get(key);
  if (!p) { p = build(key); paths.set(key, p); }
  return p;
}

/** The shared interior light: in the machine the page is on, or the hero's spot on the row. */
export function lightAt(t: number, aspect: number) {
  const scene = SCENES[Math.round(t)];
  if (!scene) return INTERIOR_LIGHT.hero;
  const p = pathFor(aspect).pose(scene.machine, Math.round(t), 0, { x: 0, z: 0, yaw: 0 });
  return { position: [p.x, 1.5, p.z + 0.1] as [number, number, number], intensity: 0.8, distance: 1.4 };
}
