// The hero: generated machine + hand look-dev, Rapier physics for the capsules, a
// draggable crank with inertia, and the capsule-drop sequence into the tray.
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, ContactShadows } from '@react-three/drei';
import {
  Physics, RigidBody, BallCollider, CuboidCollider, CylinderCollider, TrimeshCollider,
  interactionGroups, type RapierRigidBody,
} from '@react-three/rapier';
import { RigidBodyType } from '@dimforge/rapier3d-compat';
import {
  createJackGachaCapsuleMachineModel,
  createJackGachaCapsuleMachineEnvironment,
} from '../models/gacha/createGachaMachineModel';
import { refineGachaMachine } from '../models/gacha/refineGachaMachine';
import { materialize, createCapsuleMesh, getRuntime } from '../models/gacha/materialize';
import {
  CAPSULES, CAPSULE_RADIUS, DOME_CENTER, DOME_RADIUS, FLOOR_Y, FLOOR_RADIUS, TRAY_MOUTH, capsuleWorld,
} from '../models/gacha/layout';

export type GachaController = { spin: () => void };

// Test hooks (dev builds, or ?debug=1): per-frame state on <body data-gacha>, ?autocrank=1 spins once.
const PARAMS = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const DEBUG = import.meta.env.DEV || PARAMS.get('debug') === '1';
const AUTOCRANK = PARAMS.get('autocrank') === '1';

// Collision groups: 0 = machine, 1 = tray ledge, 2 = capsules.
const G_MACHINE = interactionGroups(0, [2]);
const G_LEDGE = interactionGroups(1, [2]);
const G_CAPSULE = interactionGroups(2, [0, 2]);
const G_DROPPING = interactionGroups(2, [1]);

type CrankState = {
  node: THREE.Object3D | null; angle: number; vel: number; dragging: boolean;
  grabOffset: number; lastPointerAngle: number; lastT: number; cumulative: number;
};
type DropState = { idx: number; phase: 'idle' | 'path' | 'landed'; t0: number; t: number; curve: THREE.CatmullRomCurve3 | null };

function Environment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const env = createJackGachaCapsuleMachineEnvironment(gl);
    scene.environment = env;
    return () => { scene.environment = null; env.dispose(); };
  }, [gl, scene]);
  return null;
}

function Machine({ crank, onPointerDown }: { crank: MutableRefObject<CrankState>; onPointerDown: (e: ThreeEvent<PointerEvent>) => void }) {
  const root = useMemo(() => {
    const model = createJackGachaCapsuleMachineModel({ castShadow: true, receiveShadow: true });
    refineGachaMachine(model);
    materialize(model);
    return model;
  }, []);
  useEffect(() => { crank.current.node = getRuntime(root).nodes['crank-disc'] ?? null; }, [root, crank]);
  const dome = useMemo(() => {
    const geo = new THREE.SphereGeometry(DOME_RADIUS - 0.002, 24, 16);
    return { v: geo.attributes.position.array as Float32Array, i: geo.index!.array as Uint32Array };
  }, []);
  return (
    <>
      <primitive object={root} onPointerDown={onPointerDown} />
      <RigidBody type="fixed" colliders={false} collisionGroups={G_MACHINE}>
        <TrimeshCollider args={[dome.v, dome.i]} position={DOME_CENTER} />
        <CylinderCollider args={[0.02, FLOOR_RADIUS]} position={[0, FLOOR_Y - 0.02, 0]} />
        <CuboidCollider args={[0.55, 0.36, 0.375]} position={[0, 0, 0]} />
      </RigidBody>
      {/* Catch floor for anything that escapes, in both the machine and ledge groups. */}
      <RigidBody type="fixed" colliders={false} collisionGroups={interactionGroups([0, 1], [2])}>
        <CuboidCollider args={[5, 0.1, 5]} position={[0, -2, 0]} />
      </RigidBody>
      <RigidBody type="fixed" colliders={false} collisionGroups={G_LEDGE}>
        {/* Invisible ledge at the tray mouth where the delivered capsule comes to rest. */}
        <CuboidCollider args={[0.11, 0.01, 0.09]} position={[TRAY_MOUTH[0], TRAY_MOUTH[1] - 0.085, TRAY_MOUTH[2] + 0.07]} />
        <CuboidCollider args={[0.01, 0.1, 0.09]} position={[TRAY_MOUTH[0] - 0.12, TRAY_MOUTH[1], TRAY_MOUTH[2] + 0.07]} />
        <CuboidCollider args={[0.01, 0.1, 0.09]} position={[TRAY_MOUTH[0] + 0.12, TRAY_MOUTH[1], TRAY_MOUTH[2] + 0.07]} />
        <CuboidCollider args={[0.11, 0.1, 0.01]} position={[TRAY_MOUTH[0], TRAY_MOUTH[1], TRAY_MOUTH[2] + 0.17]} />
      </RigidBody>
    </>
  );
}

function Capsule({ index, bodies }: { index: number; bodies: MutableRefObject<(RapierRigidBody | null)[]> }) {
  const mesh = useMemo(() => createCapsuleMesh(CAPSULES[index].colour), [index]);
  return (
    <RigidBody
      ref={(b) => { bodies.current[index] = b; }}
      colliders={false}
      position={capsuleWorld(index)}
      linearDamping={0.6}
      angularDamping={0.8}
      restitution={0.35}
      friction={0.7}
      collisionGroups={G_CAPSULE}
    >
      <BallCollider args={[CAPSULE_RADIUS]} />
      <primitive object={mesh} />
    </RigidBody>
  );
}

function Simulation({ controller, onRoll }: { controller: MutableRefObject<GachaController | null>; onRoll: (capsuleIndex: number) => void }) {
  const bodies = useRef<(RapierRigidBody | null)[]>([]);
  const crank = useRef<CrankState>({ node: null, angle: 0, vel: 0, dragging: false, grabOffset: 0, lastPointerAngle: 0, lastT: 0, cumulative: 0 });
  const drop = useRef<DropState>({ idx: -1, phase: 'idle', t0: 0, t: 0, curve: null });
  const outOfDome = useRef<Set<number>>(new Set());
  const { camera, gl, size } = useThree();

  useEffect(() => {
    if (DEBUG) document.body.dataset.sim = 'mounted';
    // 16 rad/s with the 2.2/s decay gives ~1.15 turns: one capsule per press.
    controller.current = { spin: () => { crank.current.vel = Math.max(crank.current.vel, 16); } };
    return () => { controller.current = null; };
  }, [controller]);

  const pointerAngle = (clientX: number, clientY: number): number => {
    const node = crank.current.node!;
    const p = node.getWorldPosition(new THREE.Vector3()).project(camera);
    const rect = gl.domElement.getBoundingClientRect();
    const ax = (p.x + 1) / 2 * size.width, ay = (1 - p.y) / 2 * size.height;
    return Math.atan2(-((clientY - rect.top) - ay), (clientX - rect.left) - ax);
  };

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    let o: THREE.Object3D | null = e.object;
    while (o && !o.userData.crank) o = o.parent;
    if (!o || !crank.current.node) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const s = crank.current;
    s.dragging = true;
    s.lastPointerAngle = pointerAngle(e.nativeEvent.clientX, e.nativeEvent.clientY);
    s.lastT = performance.now();
    s.vel = 0;
  };
  useEffect(() => {
    const move = (ev: PointerEvent) => {
      const s = crank.current;
      if (!s.dragging || !s.node) return;
      const a = pointerAngle(ev.clientX, ev.clientY);
      let d = a - s.lastPointerAngle;
      if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2;
      const now = performance.now(), dt = Math.max(1, now - s.lastT) / 1000;
      s.angle += d; s.cumulative += Math.abs(d); s.vel = d / dt; s.lastPointerAngle = a; s.lastT = now;
    };
    const up = () => { crank.current.dragging = false; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
  });

  const startDrop = () => {
    const candidates = CAPSULES.map((_, i) => i).filter((i) => !outOfDome.current.has(i) && bodies.current[i]);
    if (!candidates.length) return;
    const idx = candidates[Math.floor(Math.random() * candidates.length)];
    const body = bodies.current[idx]!;
    outOfDome.current.add(idx);
    body.setBodyType(RigidBodyType.KinematicPositionBased, true);
    body.collider(0).setCollisionGroups(G_DROPPING);
    const p = body.translation();
    const start = new THREE.Vector3(p.x, p.y, p.z);
    const curve = new THREE.CatmullRomCurve3([
      start,
      new THREE.Vector3(-0.1, FLOOR_Y - 0.15, 0.05),               // into the housing
      new THREE.Vector3(TRAY_MOUTH[0], TRAY_MOUTH[1] + 0.02, 0.2),   // behind the tray mouth
      new THREE.Vector3(TRAY_MOUTH[0], TRAY_MOUTH[1] + 0.03, TRAY_MOUTH[2] + 0.08),
    ]);
    drop.current = { idx, phase: 'path', t0: performance.now(), t: 0, curve };
  };

  const resetCapsule = (idx: number) => {
    const body = bodies.current[idx];
    if (!body) return;
    body.setBodyType(RigidBodyType.Dynamic, true);
    body.collider(0).setCollisionGroups(G_CAPSULE);
    body.setTranslation({ x: DOME_CENTER[0] + (Math.random() - 0.5) * 0.3, y: DOME_CENTER[1] + 0.25, z: DOME_CENTER[2] + (Math.random() - 0.5) * 0.2 }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    outOfDome.current.delete(idx);
  };

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);   // slow frames must not teleport the crank or skip the drop path
    const s = crank.current;
    if (DEBUG) {
      const body = drop.current.idx >= 0 ? bodies.current[drop.current.idx] : null;
      const b = body?.translation();
      document.body.dataset.gacha = JSON.stringify({ node: !!s.node, angle: +s.angle.toFixed(2), vel: +s.vel.toFixed(2), cum: +s.cumulative.toFixed(2), phase: drop.current.phase, idx: drop.current.idx, bodies: bodies.current.filter(Boolean).length, dropped: b ? [+b.x.toFixed(3), +b.y.toFixed(3), +b.z.toFixed(3)] : null, bodyType: body?.bodyType(), pathT: drop.current.phase === 'path' ? +drop.current.t.toFixed(2) : null });
      if (AUTOCRANK && !s.dragging && s.vel === 0 && s.cumulative === 0 && drop.current.phase === 'idle' && performance.now() > 1500) s.vel = 16;
    }
    if (s.node) {
      if (!s.dragging) {
        if (Math.abs(s.vel) > 0.01) {
          const d = s.vel * dt;
          s.angle += d; s.cumulative += Math.abs(d);
          s.vel *= Math.exp(-2.2 * dt);
        } else s.vel = 0;
      }
      s.node.rotation.z = s.angle;
      // A full turn delivers one capsule.
      if (s.cumulative >= Math.PI * 2) {
        s.cumulative = 0;
        if (drop.current.phase === 'idle') startDrop();
      }
      // The crank's agitator jostles the capsules.
      const agitation = Math.min(1, Math.abs(s.vel) / 8);
      if (agitation > 0.05) {
        bodies.current.forEach((b, i) => {
          if (!b || outOfDome.current.has(i)) return;
          b.applyImpulse({ x: (Math.random() - 0.5) * 0.004 * agitation, y: Math.random() * 0.006 * agitation, z: (Math.random() - 0.5) * 0.004 * agitation }, true);
        });
      }
    }
    const d = drop.current;
    if (d.phase === 'path' && d.curve) {
      const body = bodies.current[d.idx]!;
      d.t = Math.min(1, d.t + dt / 1.1);
      const t = d.t;
      const p = d.curve.getPoint(t * t * (3 - 2 * t));
      body.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z });
      if (t >= 1) {
        body.setTranslation({ x: p.x, y: p.y, z: p.z }, true);   // snap to the mouth before going dynamic
        body.setBodyType(RigidBodyType.Dynamic, true);
        body.setLinvel({ x: 0, y: 0, z: 0.4 }, true);
        d.phase = 'landed'; d.t0 = performance.now();
        onRoll(d.idx);
      }
    } else if (d.phase === 'landed' && performance.now() - d.t0 > 5000) {
      resetCapsule(d.idx);
      d.phase = 'idle'; d.idx = -1;
    }
  });

  return (
    <>
      <Machine crank={crank} onPointerDown={onPointerDown} />
      {CAPSULES.map((_, i) => <Capsule key={i} index={i} bodies={bodies} />)}
    </>
  );
}

export default function GachaScene({ controller, onRoll }: { controller: MutableRefObject<GachaController | null>; onRoll: (capsuleIndex: number) => void }) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: 24, position: [0.4, 1.05, 5.4], near: 0.1, far: 50 }}
      gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}
      onCreated={({ gl }) => { gl.setClearColor('#FFC800', 0); }}  // transmission pass samples page yellow, not black
    >
      <Environment />
      <hemisphereLight args={['#fff6dd', '#6b5a30', 0.55]} />
      <directionalLight position={[-3.2, 5.5, 4.2]} intensity={2.0} color="#fff4e4" castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0002} shadow-normalBias={0.02}>
        <orthographicCamera attach="shadow-camera" args={[-2, 2, 2, -2, 0.5, 20]} />
      </directionalLight>
      <directionalLight position={[3.5, 2.5, 3]} intensity={0.45} color="#cfe3ff" />
      <directionalLight position={[0.5, 4, -5]} intensity={0.7} color="#fff1c4" />
      <Physics gravity={[0, -6, 0]} timeStep={1 / 90}>
        <Simulation controller={controller} onRoll={onRoll} />
      </Physics>
      <ContactShadows position={[0, -0.36, 0]} opacity={0.45} scale={3.2} blur={2.4} far={1.2} resolution={1024} color="#3a2a00" />
      <OrbitControls target={[0, 0.55, 0]} enablePan={false} enableDamping minDistance={3.5} maxDistance={8} minPolarAngle={0.95} maxPolarAngle={1.65} minAzimuthAngle={-0.8} maxAzimuthAngle={0.8} />
    </Canvas>
  );
}
