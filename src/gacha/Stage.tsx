// Product-photography stage: studio light-forms for reflections, one soft key light,
// accumulated soft floor shadows, ambient occlusion and ACES tone mapping.
import { Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { AccumulativeShadows, Environment, Lightformer, OrbitControls, PerformanceMonitor, RandomizedLight } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import { EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import Machine from './Machine';
import Warmup, { SHADOW_FRAMES } from './Warmup';

const BACKDROP = '#F2C744';
// Pixel density: sharp on retina without paying for full 2x; drops to 1x if frames slow down.
const DPR_HIGH = Math.min(window.devicePixelRatio, 1.5);

export default function Stage() {
  const [dpr, setDpr] = useState(DPR_HIGH);
  return (
    <Canvas
      shadows
      dpr={dpr}
      camera={{ fov: 26, position: [1.0, 0.8, 2.08], near: 0.05, far: 20 }}
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
        shadow-camera-left={-0.6} shadow-camera-right={0.6} shadow-camera-top={1} shadow-camera-bottom={-0.3}
      />

      <Suspense fallback={null}>
        <Physics gravity={[0, -9.81, 0]} timeStep={1 / 120} lengthUnit={0.1} numSolverIterations={8}>
          <Machine />
          <Warmup />
        </Physics>
      </Suspense>

      {/* Shadow-only catcher (no ambient term), so the floor is the backdrop colour everywhere else. */}
      <AccumulativeShadows temporal frames={SHADOW_FRAMES} alphaTest={0.85} opacity={0.9} scale={4} resolution={2048} position={[0, 0.0004, 0]} color="#7a5600">
        <RandomizedLight amount={4} radius={0.5} ambient={0} intensity={1.3} position={[-1.1, 2.5, 1.7]} bias={0.001} />
      </AccumulativeShadows>

      <OrbitControls
        makeDefault target={[0, 0.37, 0]} enablePan={false} enableDamping
        minDistance={1.0} maxDistance={3.4} minPolarAngle={0.95} maxPolarAngle={1.62}
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
