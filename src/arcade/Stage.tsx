// The arcade: three machines side by side in a photo studio (Room.tsx): studio light-forms for
// reflections (a strip behind lifts the machines off the room), a hard key light that throws real
// shadows on the floor and wall, ambient occlusion, neutral tone mapping. It opens on the hero: the machines drop in across the right of the frame.
import { Suspense, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, OrbitControls, PerformanceMonitor } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import { EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import Machine from '../gacha/Machine';
import Vending from '../vending/Vending';
import Claw from '../claw/Claw';
import CameraRig, { rig } from './CameraRig';
import Drop from './Drop';
import Dust from './Dust';
import { HeroCamera, HeroFx } from './Hero';
import Pacer, { pacer } from './Pacer';
import Sparkles from './Sparkles';
import Room, { RoomLight } from './Room';
import Warmup from './Warmup';
import { arcadeShot } from '../resume/store';
import { intro, useIntro } from './intro';
import { arcade } from './store';
import { measure, stepTrack, track } from './track';
import { SPOT, VIEW } from './layout';

const BACKDROP = '#F2C744';
const SHADOW_LINGER = 3;   // seconds the shadows keep updating after the last move: the machines settle, poses ease
// The picture's cost, lightest first; it steps a notch at a time if frames slow down. Ambient occlusion is
// the dearest effect by far, so it goes before sharpness does. 1.5x is the top: at 2x a Retina screen holds
// the GPU at full clock.
const QUALITY = [
  { sharpness: 1, ao: false },
  { sharpness: 1.25, ao: false },
  { sharpness: 1.5, ao: false },
  { sharpness: 1.5, ao: true },
];
const TOP = QUALITY.length - 1;
// Integrated graphics and phones, by the name the browser gives. They start on the lightest picture and climb if they hold 60 fps.
const WEAK_GPU = /intel(?!.*\barc\b)|radeon(\(tm\))? (vega \d+ )?graphics|mali|adreno|powervr|swiftshader|llvmpipe|basic render/i;

function weakGPU() {
  const gl = document.createElement('canvas').getContext('webgl2');
  const info = gl?.getExtension('WEBGL_debug_renderer_info');
  const name = gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
  return WEAK_GPU.test(name);
}

/** Reads the scroll before anything uses it, and keeps the sections' positions measured. */
function ScrollTrack() {
  useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    addEventListener('resize', measure);
    return () => { ro.disconnect(); removeEventListener('resize', measure); };
  }, []);
  // The hero's words clear out of the way as the machines start across behind them.
  const fade = useRef<HTMLElement | null>(null);
  useFrame((_, dt) => {
    stepTrack(dt);
    fade.current ??= document.querySelector<HTMLElement>('.hero-fade');
    if (fade.current) fade.current.style.opacity = String(Math.max(0, 1 - track.y / (innerHeight * 0.3)));
  }, -1);
  return null;
}

/** The shadow pass redraws every caster, so it only runs while something that casts one can move. */
function ShadowGate() {
  const gl = useThree((s) => s.gl);
  const until = useRef(0);
  useFrame(({ clock }) => {
    const now = clock.elapsedTime;
    if (intro.get().phase !== 'done' || arcade.get().focus !== 'hero' || rig.gliding || Math.abs(track.y - scrollY) > 0.5) until.current = now + SHADOW_LINGER;
    gl.shadowMap.autoUpdate = now < until.current;
  });
  return null;
}

/** After the effects have drawn (they run at priority 1), so the résumé reel can take a still. */
function ArcadeShot() {
  useEffect(() => arcadeShot.attach(() => pacer.draw()), []);
  useFrame(({ gl }) => arcadeShot.take(gl.domElement), 2);
  return null;
}

export default function Stage() {
  const [level, setLevel] = useState(() => (weakGPU() ? 0 : TOP));
  const quality = QUALITY[level];
  const ceiling = useRef(TOP);   // a level that proved too slow isn't tried again this visit
  // The monitor only judges once everything has landed: the drop is the one heavy stretch, and a
  // verdict taken then would leave the machines soft for the rest of the visit.
  const landed = useIntro((s) => s.phase === 'done');
  return (
    <Canvas
      shadows
      frameloop="never"
      dpr={Math.min(window.devicePixelRatio, quality.sharpness)}
      camera={{ fov: 26, position: VIEW.hero.main.position, near: 0.05, far: 60 }}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      onCreated={(state) => { if (import.meta.env.DEV) (window as unknown as { __r3f: unknown }).__r3f = state; }}
    >
      <color attach="background" args={[BACKDROP]} />
      <Pacer />
      <ScrollTrack />
      <ShadowGate />
      {landed && <PerformanceMonitor onDecline={() => { ceiling.current = Math.max(0, level - 1); setLevel(ceiling.current); }} onIncline={() => setLevel(Math.min(ceiling.current, level + 1))} />}

      <Environment resolution={512} frames={1}>
        {/* Studio room: warm grey walls and floor, plus softboxes for highlights. */}
        <color attach="background" args={['#8f877a']} />
        <mesh position={[0, -1.2, 0]} rotation-x={-Math.PI / 2} scale={12}><planeGeometry /><meshBasicMaterial color="#c9c2b2" /></mesh>
        <Lightformer form="rect" intensity={3} position={[0, 2.6, 0.6]} rotation-x={Math.PI / 2} scale={[3, 1.6, 1]} />
        <Lightformer form="rect" intensity={4} position={[-2.2, 0.9, 0.9]} rotation-y={Math.PI / 2} scale={[0.6, 3, 1]} />
        <Lightformer form="rect" intensity={2.2} position={[2.2, 1.0, 0.2]} rotation-y={-Math.PI / 2} scale={[0.4, 3, 1]} />
        <Lightformer form="rect" intensity={1.4} color="#fff1cc" position={[0, 0.6, 3]} scale={[4, 1.4, 1]} />
        <Lightformer form="rect" intensity={1} position={[0, 1.2, -3]} scale={[4, 2, 1]} />
        <Lightformer form="ring" intensity={1.6} position={[1.2, 1.6, 2.2]} scale={0.6} />
        {/* The rim: from behind, on the far edges of the cabinets, so they stand off the room. A strip
            in the reflections rather than a light, which would cost on every pixel of every frame. */}
        <Lightformer form="rect" intensity={7} color="#fff1d6" position={[3.2, 1.6, -2.6]} rotation-y={-2.2} scale={[1, 4, 1]} />
      </Environment>

      <Room />
      <RoomLight />

      <Suspense fallback={null}>
        <Physics gravity={[0, -9.81, 0]} timeStep={1 / 120} lengthUnit={0.1} numSolverIterations={8}>
          <Drop machine="claw" x={SPOT.claw.x}><group userData={{ machine: 'claw' }}><Claw /></group></Drop>
          <Drop machine="gacha" x={SPOT.gacha.x}><group userData={{ machine: 'gacha' }}><Machine /></group></Drop>
          <Drop machine="vending" x={SPOT.vending.x}><group userData={{ machine: 'vending' }}><Vending /></group></Drop>
          <Warmup />
        </Physics>
      </Suspense>

      <Sparkles />
      <Dust />
      <CameraRig />
      <HeroCamera />
      <HeroFx />
      <ArcadeShot />
      <OrbitControls
        makeDefault target={VIEW.hero.main.target} enablePan={false} enableDamping enabled={false}
        minDistance={VIEW.hero.main.minDistance} maxDistance={VIEW.hero.main.maxDistance} minPolarAngle={0.95} maxPolarAngle={1.62}
        minAzimuthAngle={-1.15} maxAzimuthAngle={1.15}
      />

      <EffectComposer multisampling={0}>
        {quality.ao ? <N8AO aoRadius={0.05} distanceFalloff={0.6} intensity={2.4} halfRes /> : <></>}
        <SMAA />
        <Vignette offset={0.32} darkness={0.38} />
        <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      </EffectComposer>
    </Canvas>
  );
}
