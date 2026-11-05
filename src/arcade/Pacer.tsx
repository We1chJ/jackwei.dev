// Every frame of the 3D scene starts here. It draws only while something can change, at 60 fps at most (a
// 120 Hz screen gets every other refresh). Once everything settles the last picture stays on screen and the
// GPU rests until the pointer, the scroll or a key wakes it: the hero has no animation of its own, and
// redrawing the same picture is what heated up laptops.
// At a machine, nothing in play, it drops to half rate instead: the cabinet's idle lights (the claw's
// marquee, the glow on its button, the vending keys' wave) would freeze at a full stop. Anything in play
// brings the full rate back: a phase in flight, the joystick held, a body moving.
// The canvas's own loop stays off (frameloop="never"): the physics asks it for frames whenever a body is
// active, and the claw's never sleep, so it would neither rest nor keep to 60 fps.
import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import { claw, pad } from '../claw/store';
import { gacha } from '../gacha/store';
import { reel } from '../resume/store';
import { vending } from '../vending/store';
import { rig } from './CameraRig';
import { intro } from './intro';
import { arcade, createStore } from './store';
import { theme } from './theme';
import { track } from './track';

const SETTLE_MS = 3500;           // draws on this long after the last change: parallax, poses and shadows ease out
const FRAME_MS = 1000 / 60 - 2;   // less a little: a 60 Hz screen's refreshes aren't exactly on time
const IDLE_MS = 1000 / 30 - 2;    // at a machine with nothing in play: its idle lights at half rate (the loops clamp a frame at 1/30 s, so their clocks keep time)
const GAP_MS = 200;               // frames further apart than this were resting, not running slow
const STIR = 0.1;                 // units/s: a body slower than this is settling, not moving (the claw's head hums on its rope at a little over half that)
const WAKERS = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'scroll', 'resize', 'visibilitychange'];
// The phases in which a machine waits for the visitor: nothing is on a timer.
const STILL = { claw: ['idle', 'prize'], gacha: ['idle', 'ready'], vending: ['idle', 'ready'] };

export const pacer = {
  held: false,                // Warmup: no frames while the shaders compile
  draw: () => {},             // one frame, even at rest: the reel's still of the arcade
  stirring: () => false,      // any body moving (Stirring, inside the physics)
};
/** Drawing at the full rate: the quality monitor judges only these stretches, or the trickle would read as a slow machine. */
export const [pace, usePace] = createStore({ full: false });

/** Something is in play at a machine: a phase on a timer, the joystick held, a body moving. */
function inPlay() {
  return !STILL.claw.includes(claw.get().phase) || !STILL.gacha.includes(gacha.get().phase) || !STILL.vending.includes(vending.get().phase)
    || pad.x !== 0 || pad.y !== 0 || pacer.stirring();
}

/** Something on screen moves without being told to. */
export function moving() {
  const { phase } = intro.get();
  if (phase === 'ready') return false;   // the loader covers the scene, waiting for the coin
  return phase !== 'done' || rig.gliding || Math.abs(track.y - scrollY) > 0.5 || (arcade.get().focus !== 'hero' && inPlay());
}

/** Inside the physics: tells the pacer whether any body is moving. */
export function Stirring() {
  const { world } = useRapier();
  useEffect(() => {
    pacer.stirring = () => {
      let any = false;
      world.forEachActiveRigidBody((b) => {
        if (any) return;
        const v = b.linvel();   // a turn on its own is left out: a body at rest can spin in the solver's hands
        any = v.x * v.x + v.y * v.y + v.z * v.z > STIR * STIR;
      });
      return any;
    };
    return () => { pacer.stirring = () => false; };
  }, [world]);
  return null;
}

export default function Pacer() {
  const get = useThree((s) => s.get);
  useEffect(() => {
    let raf = 0, last = 0, until = 0, owed = false;
    const tick = (t: number) => {
      raf = 0;
      // nothing to draw while the résumé reel covers the screen; while its loading dots dim the arcade the
      // decoder and the dots get the machine
      const { covered, dimmed } = reel.get();
      const shown = !covered && !dimmed;
      if (shown && moving()) until = t + SETTLE_MS;
      const settled = t >= until;
      pace.set({ full: shown && !settled });
      if (!owed && (!shown || (settled && arcade.get().focus === 'hero'))) return;
      raf = requestAnimationFrame(tick);
      if (pacer.held || (!owed && t - last < (settled ? IDLE_MS : FRAME_MS))) return;
      const s = get();
      if (t - last > GAP_MS) s.clock.elapsedTime = t / 1000 - 1 / 60;
      last = t;
      owed = false;
      s.advance(t / 1000);
    };
    const run = () => { raf ||= requestAnimationFrame(tick); };
    const wake = () => { until = performance.now() + SETTLE_MS; run(); };
    pacer.draw = () => { owed = true; run(); };
    const unsubscribe = [intro, arcade, theme, reel].map((store) => store.subscribe(wake));
    WAKERS.forEach((w) => addEventListener(w, wake, { passive: true }));
    wake();
    return () => {
      cancelAnimationFrame(raf);
      unsubscribe.forEach((u) => u());
      WAKERS.forEach((w) => removeEventListener(w, wake));
      pacer.draw = () => {};
      pace.set({ full: false });
    };
  }, [get]);
  return null;
}
