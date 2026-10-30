// The hero section: the camera looks across the row of machines from the front-right, the name
// stands in chunky enamel letters on the left of the frame, and each machine's landing shakes
// the camera, thuds and kicks up dust. Placement maths shared with the loader: heroName.ts.
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { FontLoader, type Font } from 'three/examples/jsm/loaders/FontLoader.js';
import { LETTER, nameLayout, type FontData } from './heroName';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { slam, thud, unlockAudio } from '../gacha/sound';
import { loading } from '../loader';
import { orangePeelNormal } from '../gacha/textures';
import { dust } from './Dust';
import { intro, onImpact } from './intro';
import { SPOT, VIEW } from './layout';
import { arcade, type MachineId } from './store';

// The coin going in turns sound on if the loader's pill was left on (it has to happen inside that
// click); the screen opening starts the drop.
loading.onEnter(() => { if (loading.sound) unlockAudio(); });
loading.onOpen(() => intro.set({ phase: 'dropping', startedAt: performance.now() / 1000 }));

const FOOTPRINT: Record<MachineId, [number, number]> = { claw: [0.84, 0.84], gacha: [0.83, 0.87], vending: [0.92, 0.8] };
const COLORS = ['#FF4F8B', '#2B3A8C', '#FFF4DC', '#FF7A2E', '#21B07A', '#FF4F8B', '#2B3A8C'];

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

/** "JACK / WEI" in thick, bevelled, clear-coated enamel letters, stamped into place one by one. */
export function HeroText() {
  const size = useThree((s) => s.size);
  const [font, setFont] = useState<Font | null>(null);
  useEffect(() => { new FontLoader().load('/fonts/hero-display.json', setFont); }, []);
  const letters = useRef<(THREE.Group | null)[]>([]);

  const kit = useMemo(() => {
    if (!font) return null;
    const peel = orangePeelNormal(); peel.repeat.set(2, 2);
    const paint = (c: string) => {
      const face = new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.06, clearcoatNormalMap: peel, clearcoatNormalScale: new THREE.Vector2(0.05, 0.05), envMapIntensity: 1.7 });
      const side = face.clone(); side.color.multiplyScalar(0.72);
      return [face, side];
    };
    return { font, paint };
  }, [font]);

  // Placed by the same numbers the loader's outline uses, so the two line up exactly.
  const layout = useMemo(() => {
    if (!kit) return null;
    const L = nameLayout(kit.font.data as unknown as FontData, size.width / size.height);
    const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(...L.X), new THREE.Vector3(...L.Y), new THREE.Vector3(...L.Z));
    const items = L.letters.map((l) => ({
      ...l,
      g: new TextGeometry(l.ch, { font: kit.font, size: 1, depth: LETTER.depth, curveSegments: 10, bevelEnabled: true, bevelThickness: LETTER.bevelThickness, bevelSize: LETTER.bevelSize, bevelSegments: 5 }),
      mats: kit.paint(COLORS[l.i % COLORS.length]),
    }));
    return { L, quat: new THREE.Quaternion().setFromRotationMatrix(basis), items };
  }, [kit, size.width, size.height]);

  // Each letter drops a short way and thunks into place once the machines are down.
  const done = useRef(new Set<number>());
  useFrame(() => {
    const st = intro.get();
    letters.current.forEach((g, i) => {
      if (!g) return;
      if (st.phase === 'loading' || st.phase === 'ready') { g.visible = false; return; }
      const t = performance.now() / 1000 - st.startedAt - 2.0 - i * 0.09;
      g.visible = t > 0;
      if (t <= 0) return;
      const fall = 0.32;
      if (t < fall) { const u = t / fall; g.position.y = (1 - u * u) * 1.4; g.rotation.z = (1 - u) * 0.25 * (i % 2 ? 1 : -1); return; }
      if (!done.current.has(i)) { done.current.add(i); thud(0.35); }
      const u = t - fall;
      g.position.y = 0.06 * Math.exp(-10 * u) * Math.abs(Math.sin(u * 22));
      g.rotation.z = 0.04 * Math.exp(-7 * u) * Math.sin(u * 18) * (i % 2 ? 1 : -1);
    });
  });

  if (!layout) return null;
  return (
    <group position={layout.L.pos} quaternion={layout.quat} scale={layout.L.k}>
      {layout.items.map((it) => (
        <group key={it.i} position={[it.x, it.y, 0]}>
          <group ref={(g) => { letters.current[it.i] = g; }}>
            <mesh geometry={it.g} material={it.mats} />
          </group>
        </group>
      ))}
    </group>
  );
}
