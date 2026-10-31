// The hero section: the camera looks across the row of machines from the front-right, and each
// machine's landing shakes the camera, thuds and kicks up dust. The name beside them is NameSign.tsx.
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { slam, unlockAudio } from '../gacha/sound';
import { loading } from '../loader';
import { dust } from './Dust';
import { intro, onImpact } from './intro';
import { SPOT, VIEW } from './layout';
import { arcade, type MachineId } from './store';

// The coin going in turns sound on (it has to happen inside that click); the screen opening starts the drop.
loading.onEnter(unlockAudio);
loading.onOpen(() => intro.set({ phase: 'dropping', startedAt: performance.now() / 1000 }));

const FOOTPRINT: Record<MachineId, [number, number]> = { claw: [0.84, 0.84], gacha: [0.83, 0.87], vending: [0.92, 0.8] };

/** Hero framing, a little parallax with the pointer, and a jolt on every landing. */
export function HeroCamera() {
  const { camera } = useThree();
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const s = useRef({ shake: 0, tx: 0, ty: 0, px: 0, py: 0 });
  const [target, base] = useMemo(() => [new THREE.Vector3(...VIEW.hero.main.target), new THREE.Vector3(...VIEW.hero.main.position)], []);
  useEffect(() => onImpact(({ speed }) => { s.current.shake = Math.min(1.2, s.current.shake + speed / 10); }), []);
  useEffect(() => {
    const m = (e: PointerEvent) => { s.current.tx = e.clientX / innerWidth - 0.5; s.current.ty = e.clientY / innerHeight - 0.5; };
    window.addEventListener('pointermove', m);
    return () => window.removeEventListener('pointermove', m);
  }, []);
  useFrame((state, rawDt) => {
    if (arcade.get().focus !== 'hero' || !controls) return;
    const dt = Math.min(rawDt, 1 / 30), st = s.current, t = state.clock.elapsedTime;
    controls.enabled = false;
    // No parallax until everything has landed: the loader's outlines are drawn for the still frame.
    const k = intro.get().phase === 'done' ? 1 - Math.exp(-2.5 * dt) : 0;
    st.px += (st.tx - st.px) * k; st.py += (st.ty - st.py) * k;
    st.shake *= Math.exp(-7 * dt);
    const a = 0.035 * st.shake * st.shake;
    camera.position.set(
      base.x + st.px * 0.35 + a * Math.sin(t * 71),
      base.y - st.py * 0.18 + a * Math.sin(t * 89 + 1.3),
      base.z + a * 0.5 * Math.sin(t * 53 + 2.1),
    );
    controls.target.copy(target);
    camera.lookAt(target);
  });
  return null;
}

/** Landing effects shared by all three machines. */
export function HeroFx() {
  useEffect(() => onImpact(({ machine, speed }) => {
    slam(machine, speed / 9);
    loading.landed(machine);
    const [w, d] = FOOTPRINT[machine];
    dust.puff(SPOT[machine].x, 0, w, d, 1);
  }), []);
  return null;
}
