// Push-flaps: the hinged panels over each machine's prize tray. A real dynamic body on a revolute
// joint about world X that only swings inward (joint limits 0..max) and hangs shut under its own
// weight. The visitor pushes it with the pointer: a compliant motor on the hinge follows the push,
// so a prize behind it can still shove back. The prize comes out under it on its own physics (a
// pull from the tray, `draw`), lifting the flap as it passes, and the flap swings shut behind it,
// slaps the frame (clack) and bounces a little. The machine owns the joint and the body and calls
// `step` every frame.
import type { RapierRigidBody } from '@react-three/rapier';
import type { RevoluteImpulseJoint } from '@dimforge/rapier3d-compat';

const HAND_K = 4000, HAND_C = 120;   // motor while a hand moves it (acceleration-based: rad/s^2 per rad): firm, a prize behind it is shoved back
const FREE_C = 1.2;                  // hinge friction when let go
const DRAG = 0.011;                  // rad per pointer pixel dragged (any direction pushes it in)
const BOUNCE = 0.28;                 // share of the closing speed it rebounds with off the frame
const RATE = 4;                      // rad/s: a hand pushes it in at this pace, not a slam

export function pushFlap(open: number, clack: (strength: number) => void, max = open + 0.25) {
  const s = { limited: false, angle: 0, cmd: 0, drag: null as null | { x0: number; y0: number; a0: number; target: number }, holdUntil: -1, hold: false, t: 0, free: true };
  return {
    /** Current opening, radians (0 = shut). */
    get angle() { return s.angle; },
    get dragging() { return s.drag !== null; },
    /** A hand presses it at screen point (x, y) and starts pushing. */
    grab(x: number, y: number) { s.drag = { x0: x, y0: y, a0: s.angle, target: s.angle }; },
    /** Dragging, whichever way, pushes it further in. */
    drag(x: number, y: number) { if (s.drag) s.drag.target = Math.min(open, Math.max(0, s.drag.a0 + Math.hypot(x - s.drag.x0, y - s.drag.y0) * DRAG)); },
    release() { s.drag = null; },
    /** A quick push: held open for `seconds`, then let go. */
    push(seconds: number) { s.holdUntil = s.t + seconds; },
    /** Held fully open (while a prize is drawn out under it) until told otherwise. */
    holdOpen(on: boolean) { s.hold = on; },

    step(dt: number, body: RapierRigidBody | null, joint: RevoluteImpulseJoint | null | undefined) {
      s.t += dt;
      if (!body || !joint) return;
      // Rapier ignores a revolute joint's limits at creation (JS 0.14), so they are set here.
      if (!s.limited) { joint.setLimits(0, max); s.limited = true; }
      const q = body.rotation(), prev = s.angle;
      s.angle = 2 * Math.atan2(q.x, q.w);
      const w = body.angvel().x;
      // Slapping shut: a clack, and a little rebound (the joint limit alone would stop it dead).
      if (prev > 0.03 && s.angle <= 0.03 && w < -1.2) {
        clack(Math.min(1, -w / 8));
        body.setAngvel({ x: -w * BOUNCE, y: 0, z: 0 }, true);
      }
      // The motor follows the push at a hand's pace: its command slews toward where it is wanted.
      const held = s.hold || s.t < s.holdUntil;
      const target = s.hold ? max : s.drag ? s.drag.target : held ? open : null;
      if (target === null) {
        s.cmd = s.angle;
        if (!s.free) { s.free = true; joint.configureMotorPosition(0, 0, FREE_C); body.wakeUp(); }
      } else {
        s.cmd += Math.max(-RATE * dt, Math.min(RATE * dt, target - s.cmd));
        joint.configureMotorPosition(s.cmd, HAND_K, HAND_C);
        if (s.free) { s.free = false; body.wakeUp(); }
      }
    },
  };
}

const DRAW_K = 60, DRAW_C = 12;      // the pull on a prize coming out: a speed proportional to the distance left, capped

/** Pulls `body` toward (tx, ty, tz) with a limited push (m/s^2 cap `amax`): a hand drawing it out of the tray. */
export function draw(body: RapierRigidBody, tx: number, ty: number, tz: number, amax: number, vmax: number) {
  const p = body.translation(), v = body.linvel();
  let dx = (tx - p.x) * DRAW_K, dy = (ty - p.y) * DRAW_K, dz = (tz - p.z) * DRAW_K;
  const sp = Math.hypot(dx, dy, dz);
  if (sp > vmax) { dx *= vmax / sp; dy *= vmax / sp; dz *= vmax / sp; }
  let ax = (dx - v.x) * DRAW_C, ay = (dy - v.y) * DRAW_C, az = (dz - v.z) * DRAW_C;
  const a = Math.hypot(ax, ay, az);
  if (a > amax) { ax *= amax / a; ay *= amax / a; az *= amax / a; }
  const m = body.mass();
  body.resetForces(true);
  body.addForce({ x: ax * m, y: ay * m, z: az * m }, true);
}
