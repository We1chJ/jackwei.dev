// Runs once, hidden behind the loading screen, so the first visible frame is already smooth:
// compiles every shader up front, settles the capsule pile instantly instead of on screen,
// then lets the floor shadow finish baking before the doors open.
import { useLayoutEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import { loading } from '../loader';
import { gacha } from './store';

export const SHADOW_FRAMES = 40;
const SETTLE_CHUNKS = 6;   // x 0.5 s of simulated time

export default function Warmup() {
  const { gl, scene, camera, setFrameloop } = useThree();
  const { step } = useRapier();
  const w = useRef({ settleSteps: 0, frames: 0 });

  // Pause the render loop while shaders compile in parallel (KHR_parallel_shader_compile where
  // available), so no frame stalls compiling them one by one.
  useLayoutEffect(() => {
    let alive = true;
    loading.coast(1000, 'settle');   // compile + settle run in heavy frames: let the coin glide
    setFrameloop('never');
    gl.compileAsync(scene, camera).finally(() => {
      if (!alive) return;
      loading.report('compile', 1);
      setFrameloop('always');
    });
    return () => { alive = false; setFrameloop('always'); };
  }, [gl, scene, camera, setFrameloop]);

  useFrame(() => {
    const s = w.current;
    if (s.settleSteps < SETTLE_CHUNKS) {
      // Half a second of simulation per frame (step() clamps to 0.5 s and sub-steps at the
      // fixed rate), so the pile settles in a few frames without one long freeze.
      step(0.5);
      s.settleSteps++;
      loading.report('settle', s.settleSteps / SETTLE_CHUNKS);
      if (s.settleSteps === SETTLE_CHUNKS) gacha.set({ phase: 'idle' });
      return;
    }
    if (s.frames >= SHADOW_FRAMES) return;
    s.frames++;
    loading.report('shadows', s.frames / SHADOW_FRAMES);
    if (s.frames === SHADOW_FRAMES) loading.finish();
  });
  return null;
}
