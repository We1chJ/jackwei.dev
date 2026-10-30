// Drops a machine onto the floor for the hero opening. The physics bodies stay where they are
// (Rapier keeps simulating the contents in place); only the machine's visuals ride this group,
// because @react-three/rapier records each body's parent transform once, when it is created,
// and draws the body relative to the parent from then on. So the group must be at rest while
// the machine mounts, and is lifted only once the scene is ready.
import { useEffect, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { DROP_DELAY, impact, intro } from './intro';
import type { MachineId } from './store';

const HEIGHT = 3.4;              // starts this far above its spot: out of the top of the frame
const G = 9.81 * 1.25;           // a touch more than real gravity reads better on screen
const T_FALL = Math.sqrt((2 * HEIGHT) / G);

export default function Drop({ machine, x, children }: { machine: MachineId; x: number; children: ReactNode }) {
  const pivot = useRef<THREE.Group>(null);
  const s = useRef({ landedAt: -1, settled: false, tilt: new THREE.Vector2((Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.06) });

  // Out of sight above the frame while the loader waits for the coin.
  useEffect(() => intro.subscribe(() => {
    if (intro.get().phase === 'ready' && pivot.current) pivot.current.position.y = HEIGHT;
  }), []);

  useFrame(() => {
    const g = pivot.current, st = intro.get();
    if (!g || st.phase === 'loading' || st.phase === 'ready' || s.current.settled) return;
    const t = performance.now() / 1000 - st.startedAt - DROP_DELAY[machine];
    if (t < 0) { g.position.y = HEIGHT; return; }
    const s0 = s.current;
    if (t < T_FALL) {
      // Free fall, tipped a little as it was let go, straightening as it comes down.
      g.position.y = HEIGHT - 0.5 * G * t * t;
      const k = 1 - t / T_FALL;
      g.rotation.set(s0.tilt.x * k, 0, s0.tilt.y * k);
      return;
    }
    if (s0.landedAt < 0) {
      s0.landedAt = t;
      impact({ machine, speed: G * T_FALL });
      const landed = st.landed + 1;
      intro.set({ landed, ...(landed === 3 ? { phase: 'done' as const } : {}) });
    }
    // A heavy cabinet: a small bounce off its feet, then it rocks on its base and settles.
    const u = t - T_FALL;
    g.position.y = 0.028 * Math.exp(-9 * u) * Math.abs(Math.sin(u * 16));
    const rock = Math.exp(-4.5 * u) * Math.sin(u * 13);
    g.rotation.set(0.018 * rock, 0, (s0.tilt.y > 0 ? 1 : -1) * 0.026 * rock);
    if (u > 2) { g.position.y = 0; g.rotation.set(0, 0, 0); s0.settled = true; }
  });

  // Rotations pivot about the middle of the machine's base, not the world origin.
  return (
    <group ref={pivot} position={[x, 0, 0]}>
      <group position={[-x, 0, 0]}>{children}</group>
    </group>
  );
}
