// Push-flaps: the hinged panels over each machine's prize tray. A real dynamic body on a revolute
// joint about world X that only swings inward (joint limits 0..open) and hangs shut under its own
// weight. Something always decides where it goes:
//   - a hand dragging it: a compliant motor follows the pointer, so a prize behind it can still
//     shove back;
//   - a hand holding it open (a quick push, or reaching in to take the prize);
//   - nothing: it swings shut under gravity, slaps the frame (clack) and bounces a little.
// The machine owns the joint and the body and calls `step` every frame.
import type { RapierRigidBody } from '@react-three/rapier';
import type { RevoluteImpulseJoint } from '@dimforge/rapier3d-compat';

const HAND_K = 900, HAND_C = 55;     // motor while a hand moves it (acceleration-based: rad/s^2 per rad)
const FREE_C = 1.2;                  // hinge friction when let go
const DRAG = 0.011;                  // rad per pointer pixel dragged upward
const BOUNCE = 0.28;                 // share of the closing speed it rebounds with off the frame

export function pushFlap(open: number, clack: (strength: number) => void, max = open + 0.25) {
  const s = { limited: false, angle: 0, drag: null as null | { y0: number; a0: number; target: number }, holdUntil: -1, hold: false, t: 0, mode: '' };
  return {
    /** Current opening, radians (0 = shut). */
    get angle() { return s.angle; },
    get dragging() { return s.drag !== null; },
    /** A hand presses it at screen height `y` and starts pushing. */
    grab(y: number) { s.drag = { y0: y, a0: s.angle, target: s.angle }; },
    /** Dragging up pushes it further in. */
    drag(y: number) { if (s.drag) s.drag.target = Math.min(open, Math.max(0, s.drag.a0 + (s.drag.y0 - y) * DRAG)); },
    release() { s.drag = null; },
    /** A quick push: held open for `seconds`, then let go. */
    push(seconds: number) { s.holdUntil = s.t + seconds; },
    /** Held open (by the hand reaching in for the prize) until told otherwise. */
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
      // A hand reaching in for the prize pushes it all the way, even past where it was dragged to.
      const held = s.hold || s.t < s.holdUntil;
      const target = s.drag ? (s.hold ? Math.max(s.drag.target, open) : s.drag.target) : held ? open : null;
      const mode = target === null ? 'free' : `${target.toFixed(3)}`;
      if (mode !== s.mode) {
        s.mode = mode;
        if (target === null) joint.configureMotorPosition(0, 0, FREE_C);
        else joint.configureMotorPosition(target, HAND_K, HAND_C);
        body.wakeUp();
      }
    },
  };
}
