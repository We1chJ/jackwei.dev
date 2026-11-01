// Runs once, hidden behind the loading screen, so the first visible frame is already smooth:
// compiles every shader up front, settles the capsule pile instantly instead of on screen,
// then runs a few frames so nothing is first drawn on screen.
import { useLayoutEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import { loading } from '../loader';
import { intro } from './intro';
import { pacer } from './Pacer';
import { gacha } from '../gacha/store';

export const SHADOW_FRAMES = 40;
const SETTLE_CHUNKS = 12;  // x 0.25 s of simulated time: short enough that no frame stalls

export default function Warmup() {
  const { gl, scene, camera } = useThree();
  const { step } = useRapier();
  const w = useRef({ settleSteps: 0, frames: 0 });

  // Hold the frames while shaders compile in parallel (KHR_parallel_shader_compile where
  // available), so no frame stalls compiling them one by one.
  useLayoutEffect(() => {
    let alive = true;
    loading.coast(1000, 'settle');   // compile + settle run in heavy frames: let the bar glide
    pacer.held = true;
    gl.compileAsync(scene, camera).finally(() => {
      if (!alive) return;
      loading.report('compile', 1);
      pacer.held = false;
    });
    return () => { alive = false; pacer.held = false; };
  }, [gl, scene, camera]);

  useFrame(() => {
    const s = w.current;
    if (s.settleSteps < SETTLE_CHUNKS) {
      // A quarter second of simulation per frame (step() sub-steps at the fixed rate), so the
      // pile settles over a dozen frames without one long freeze.
      step(0.25);
      s.settleSteps++;
      loading.report('settle', s.settleSteps / SETTLE_CHUNKS);
      if (s.settleSteps === SETTLE_CHUNKS) gacha.set({ phase: 'idle' });
      return;
    }
    if (s.frames >= SHADOW_FRAMES + 4) return;
    s.frames++;
    loading.report('shadows', Math.min(1, s.frames / SHADOW_FRAMES));
    // A few frames' margin so the shadow bake is done before the machines are lifted out of sight.
    if (s.frames === SHADOW_FRAMES + 4) { loading.finish(); intro.set({ phase: 'ready' }); }
  });
  return null;
}
