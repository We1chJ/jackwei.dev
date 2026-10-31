// The arcade: three machines side by side on a product-photography stage (studio light-forms
// for reflections, one soft key light, live floor and contact shadows, ambient occlusion,
// neutral tone mapping). It opens on the hero: the machines drop in across the right of the frame.
import { Suspense, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, OrbitControls, PerformanceMonitor } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import { EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import Machine from '../gacha/Machine';
import Vending from '../vending/Vending';
import Claw from '../claw/Claw';
import CameraRig from './CameraRig';
import Drop from './Drop';
import Dust from './Dust';
import { HeroCamera, HeroFx } from './Hero';
import Sparkles from './Sparkles';
import Warmup from './Warmup';
import { arcadeShot, useReel } from '../resume/store';
import { useIntro } from './intro';
import { SPOT, VIEW } from './layout';

const BACKDROP = '#F2C744';
// Pixel density: sharp on retina without paying for full 2x; drops to 1x if frames slow down.
const DPR_HIGH = Math.min(window.devicePixelRatio, 1.5);

// Floor shadows that work while things fall: a transparent floor that only shows the key light's
// real-time shadows, and soft contact shadows under the machines, rendered live during the drop and
// frozen once everything has landed (so they cost nothing afterwards).
function FloorShadows() {
  const landed = useIntro((s) => s.phase === 'done');
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.0004, 0]} receiveShadow>
        <planeGeometry args={[30, 30]} />
        <shadowMaterial transparent opacity={0.2} color="#5c3f00" />
      </mesh>
      <ContactShadows position={[0.05, 0.0008, 0]} scale={[5.6, 2.6]} resolution={1024} blur={2.4} far={1.2} opacity={0.8} color="#6b4a00" frames={landed ? 2 : Infinity} />
    </>
  );
}

/** After the effects have drawn (they run at priority 1), so the résumé reel can take a still. */
function ArcadeShot() {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => arcadeShot.attach(invalidate), [invalidate]);
  useFrame(({ gl }) => arcadeShot.take(gl.domElement), 2);
  return null;
}

export default function Stage() {
  const [dpr, setDpr] = useState(DPR_HIGH);
  // nothing to draw while the résumé reel covers the screen; while its loading dots dim the
  // arcade it only redraws on demand, so the decoder and the dots get the machine
  const covered = useReel((s) => s.covered);
  const dimmed = useReel((s) => s.dimmed);
  return (
    <Canvas
      shadows
      frameloop={covered ? 'never' : dimmed ? 'demand' : 'always'}
      dpr={dpr}
      camera={{ fov: 26, position: VIEW.hero.main.position, near: 0.05, far: 30 }}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      onCreated={(state) => { if (import.meta.env.DEV) (window as unknown as { __r3f: unknown }).__r3f = state; }}
    >
      <color attach="background" args={[BACKDROP]} />
      <PerformanceMonitor flipflops={3} onDecline={() => setDpr(1)} onIncline={() => setDpr(DPR_HIGH)} onFallback={() => setDpr(1)} />

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
      </Environment>

      <directionalLight
        position={[-1.1, 2.5, 1.7]} intensity={2.2} color="#fffaf2" castShadow
        shadow-mapSize={[2048, 2048]} shadow-bias={-0.0002} shadow-normalBias={0.01}
        shadow-camera-left={-1.9} shadow-camera-right={2} shadow-camera-top={2.3} shadow-camera-bottom={-0.4}
      />

      <Suspense fallback={null}>
        <Physics gravity={[0, -9.81, 0]} timeStep={1 / 120} lengthUnit={0.1} numSolverIterations={8}>
          <Drop machine="claw" x={SPOT.claw.x}><group userData={{ machine: 'claw' }}><Claw /></group></Drop>
          <Drop machine="gacha" x={SPOT.gacha.x}><group userData={{ machine: 'gacha' }}><Machine /></group></Drop>
          <Drop machine="vending" x={SPOT.vending.x}><group userData={{ machine: 'vending' }}><Vending /></group></Drop>
          <Warmup />
        </Physics>
      </Suspense>

      <FloorShadows />

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
        <N8AO aoRadius={0.05} distanceFalloff={0.6} intensity={2.4} halfRes />
        <SMAA />
        <Vignette offset={0.32} darkness={0.38} />
        <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      </EffectComposer>
    </Canvas>
  );
}
