// Every frame of the 3D scene starts here. It draws only while something can change, at 60 fps at most (a
// 120 Hz screen gets every other refresh). Once everything settles the last picture stays on screen and the
// GPU rests until the pointer, the scroll or a key wakes it: the hero has no animation of its own, and
// redrawing the same picture is what heated up laptops.
// The canvas's own loop stays off (frameloop="never"): the physics asks it for frames whenever a body is
// active, and the claw's never sleep, so it would neither rest nor keep to 60 fps.
import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { reel } from '../resume/store';
import { rig } from './CameraRig';
import { intro } from './intro';
import { arcade } from './store';
import { theme } from './theme';
import { track } from './track';

const SETTLE_MS = 3500;           // draws on this long after the last change: parallax, poses and shadows ease out
const FRAME_MS = 1000 / 60 - 2;   // less a little: a 60 Hz screen's refreshes aren't exactly on time
const GAP_MS = 200;               // frames further apart than this were resting, not running slow
const WAKERS = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'scroll', 'resize', 'visibilitychange'];

export const pacer = {
  held: false,      // Warmup: no frames while the shaders compile
  draw: () => {},   // one frame, even at rest: the reel's still of the arcade
};

/** Something on screen moves without being told to. */
function moving() {
  const { phase } = intro.get();
  if (phase === 'ready') return false;   // the loader covers the scene, waiting for the coin
  return phase !== 'done' || arcade.get().focus !== 'hero' || rig.gliding || Math.abs(track.y - scrollY) > 0.5;
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
      if (!covered && !dimmed && moving()) until = t + SETTLE_MS;
      if (!owed && (covered || dimmed || t >= until)) return;
      raf = requestAnimationFrame(tick);
      if (pacer.held || (!owed && t - last < FRAME_MS)) return;
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
    };
  }, [get]);
  return null;
}
