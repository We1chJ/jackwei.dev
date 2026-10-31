// Visual model of the gashapon cabinet plus every static collider it owns.
// The dispensing disc (kinematic) and the exit flap (jointed) are created by the Machine.
import { forwardRef, useMemo } from 'react';
import * as THREE from 'three';
import { RoundedBox } from '@react-three/drei';
import { CuboidCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import {
  ACRYLIC_Z, CAB, COIN, EXIT, FLAP, FRONT_Z, HANDLE, HEADER, HOPPER, INNER, LABEL, PLATE, WINDOW,
} from './dims';
import { expand, frame, frontLathe, knobProfile, panel, slab, uShell, type Rect } from './geometry';
import { materials } from './materials';
import { flapPrint, gachaSide, headerCard, priceLabel, turnArrow } from './textures';
import { Bolts, GlassSheen, LedBar, Louvres, boltRow, smudgeRoughness } from '../arcade/surfaces';
import { G } from './groups';

const rectSize = (r: Rect) => [r.x1 - r.x0, r.y1 - r.y0] as const;
const rectCenter = (r: Rect) => [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2] as const;

export const PLATE_FRONT = FRONT_Z + PLATE.thickness;

/** Static shell: sides/back, lid, plinth, front door with window and exit cut-outs. */
function Shell() {
  const m = materials();
  const geo = useMemo(() => {
    const r = CAB.radius;
    return {
      shell: uShell(CAB.w, CAB.d, r, CAB.wall, CAB.base, CAB.top - CAB.wall),
      lid: slab(CAB.w, CAB.d, r, CAB.top - CAB.wall, CAB.wall, 0.003),
      plinth: slab(CAB.w - 0.014, CAB.d - 0.014, r * 0.8, 0, CAB.base, 0.004),
      front: panel(
        { x0: -CAB.w / 2 + r, y0: CAB.base, x1: CAB.w / 2 - r, y1: CAB.top - CAB.wall }, 0,
        [{ rect: WINDOW, radius: WINDOW.radius }, { rect: EXIT, radius: EXIT.radius }],
        CAB.wall,
      ),
    };
  }, []);
  return (
    <group>
      <mesh geometry={geo.shell} material={m.paint} castShadow receiveShadow />
      <mesh geometry={geo.lid} material={m.paint} castShadow receiveShadow />
      <mesh geometry={geo.plinth} material={m.rubber} castShadow receiveShadow />
      <mesh geometry={geo.front} material={m.paint} position={[0, 0, FRONT_Z - CAB.wall]} castShadow receiveShadow />
      <Trim />
    </group>
  );
}

let accent: { cap: THREE.MeshPhysicalMaterial; side: THREE.MeshPhysicalMaterial } | null = null;
const accents = () => {
  if (accent) return accent;
  const cap = materials().paint.clone(); cap.color.set('#FFBE12'); cap.roughness = 0.5; cap.roughnessMap = smudgeRoughness();
  const side = new THREE.MeshPhysicalMaterial({ map: gachaSide(), roughness: 0.38, clearcoat: 0.8, clearcoatRoughness: 0.12 });
  return (accent = { cap, side });
};

/** Two-tone cap and base, chrome corners, door seam and hinges, printed and bolted side panels. */
function Trim() {
  const m = materials(), a = accents();
  const W = CAB.w, D = CAB.d, T = CAB.top, sideW = D - 0.05;
  const seam = useMemo(() => frame({ x0: -W / 2 + 0.008, y0: CAB.base + 0.006, x1: W / 2 - 0.008, y1: T - 0.022 }, 0.006, 0.0012, 0.0006, 0), [W, T]);
  const corners = [[-1, 1], [1, 1], [1, -1], [-1, -1]];
  return (
    <group>
      {/* yellow cap with a chrome band under it */}
      <RoundedBox args={[W + 0.012, 0.03, D + 0.012]} radius={0.01} smoothness={4} position={[0, T + 0.004, 0]} material={a.cap} castShadow />
      <RoundedBox args={[W + 0.006, 0.006, D + 0.006]} radius={0.002} smoothness={2} position={[0, T - 0.014, 0]} material={m.chrome} />
      {/* base: yellow band, chrome above it */}
      <RoundedBox args={[W + 0.01, 0.034, D + 0.01]} radius={0.007} smoothness={3} position={[0, CAB.base + 0.012, 0]} material={a.cap} castShadow />
      <RoundedBox args={[W + 0.006, 0.005, D + 0.006]} radius={0.002} smoothness={2} position={[0, CAB.base + 0.032, 0]} material={m.chrome} />
      {corners.map(([sx, sz], i) => <RoundedBox key={i} args={[0.012, T - 0.09, 0.012]} radius={0.0042} smoothness={3} position={[sx * (W / 2 - 0.002), T / 2 + 0.005, sz * (D / 2 - 0.002)]} material={m.chrome} castShadow />)}
      <mesh geometry={seam} material={m.cavity} position={[0, 0, FRONT_Z + 0.0003]} />
      {[0.2, 0.62].map((y) => <mesh key={y} material={m.chrome} position={[-W / 2 + 0.001, y, FRONT_Z - 0.001]}><cylinderGeometry args={[0.0042, 0.0042, 0.05, 14]} /></mesh>)}
      {/* right side: printed panel in a frame, bolts, a vent */}
      <group position={[W / 2 + 0.0008, 0, 0]} rotation-y={Math.PI / 2}>
        <mesh material={a.side} position={[0, 0.43, 0]}><planeGeometry args={[sideW, 0.6]} /></mesh>
        <group position={[0, 0, 0.0012]}>
          <Bolts points={[...boltRow(-sideW / 2 + 0.006, 0.112, sideW / 2 - 0.006, 0.112, 5), ...boltRow(-sideW / 2 + 0.006, 0.742, sideW / 2 - 0.006, 0.742, 5)]} r={0.0022} />
        </group>
        <Louvres w={0.16} h={0.022} rows={4} position={[0, 0.082, 0.0008]} />
      </group>
    </group>
  );
}

/** Window bezel, acrylic pane (tint + Fresnel reflection) and the white hopper interior. */
function Hopper() {
  const m = materials();
  const bezel = useMemo(() => frame(WINDOW, WINDOW.radius, 0.012, 0.006), []);
  const rim = useMemo(() => frame(expand(WINDOW, 0.012), WINDOW.radius + 0.012, 0.0032, 0.0062, 0.0008), []);
  const [ww, wh] = rectSize(WINDOW);
  const [wx, wy] = rectCenter(WINDOW);
  const H = HOPPER.ceiling - HOPPER.floor, D = INNER.front - INNER.back, zc = (INNER.front + INNER.back) / 2;
  return (
    <group>
      <mesh geometry={bezel} material={m.glossBlack} position={[0, 0, FRONT_Z]} castShadow />
      <mesh material={m.acrylicTint} position={[wx, wy, ACRYLIC_Z]} renderOrder={3}><planeGeometry args={[ww + 0.01, wh + 0.01]} /></mesh>
      <mesh material={m.glassReflect} position={[wx, wy, ACRYLIC_Z + 0.0025]} renderOrder={4}><planeGeometry args={[ww + 0.01, wh + 0.01]} /></mesh>
      <GlassSheen w={ww + 0.01} h={wh + 0.01} position={[wx, wy, ACRYLIC_Z + 0.003]} opacity={0.14} />
      <mesh geometry={rim} material={m.chrome} position={[0, 0, FRONT_Z + 0.0012]} />
      <LedBar size={[ww - 0.02, 0.004, 0.005]} position={[wx, HOPPER.ceiling - 0.006, ACRYLIC_Z - 0.012]} spread={0.018} />
      {/* interior faces */}
      <mesh material={m.interior} position={[0, HOPPER.floor + H / 2, INNER.back + 0.001]} receiveShadow><planeGeometry args={[INNER.x * 2, H]} /></mesh>
      <mesh material={m.interior} position={[-INNER.x + 0.001, HOPPER.floor + H / 2, zc]} rotation={[0, Math.PI / 2, 0]} receiveShadow><planeGeometry args={[D, H]} /></mesh>
      <mesh material={m.interior} position={[INNER.x - 0.001, HOPPER.floor + H / 2, zc]} rotation={[0, -Math.PI / 2, 0]} receiveShadow><planeGeometry args={[D, H]} /></mesh>
      <mesh material={m.interior} position={[0, HOPPER.ceiling, zc]} rotation={[Math.PI / 2, 0, 0]}><planeGeometry args={[INNER.x * 2, D]} /></mesh>
      <mesh material={m.interior} position={[0, HOPPER.floor, zc]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[INNER.x * 2, D]} /></mesh>
    </group>
  );
}

/** Printed header card behind a glossy cover, in a black frame. */
function Header() {
  const m = materials();
  const card = useMemo(() => new THREE.MeshStandardMaterial({ map: headerCard(), roughness: 0.55 }), []);
  const bezel = useMemo(() => frame(HEADER, 0.006, 0.008, 0.006), []);
  const [w, h] = rectSize(HEADER);
  const [x, y] = rectCenter(HEADER);
  return (
    <group>
      <mesh geometry={bezel} material={m.glossBlack} position={[0, 0, FRONT_Z]} castShadow />
      <mesh material={card} position={[x, y, FRONT_Z + 0.0015]}><planeGeometry args={[w, h]} /></mesh>
      <mesh material={m.glassReflect} position={[x, y, FRONT_Z + 0.0048]} renderOrder={4}><planeGeometry args={[w, h]} /></mesh>
    </group>
  );
}

/** Brushed-steel mechanism plate with screws, coin slot, price label and handle bezel. */
function Plate() {
  const m = materials();
  const geo = useMemo(() => ({
    plate: panel(PLATE, 0.01, [{ rect: EXIT, radius: EXIT.radius }], PLATE.thickness, 0.0008),
    exitBezel: frame(EXIT, EXIT.radius, 0.008, 0.005),
    ring: frontLathe([[0.052, 0.0015], [0.0545, 0.0065], [0.059, 0.0088], [0.0635, 0.0072], [0.066, 0.0035], [0.0665, 0]]),
    screw: frontLathe([[0, 0.0022], [0.0026, 0.0019], [0.0042, 0.001], [0.0046, 0]], 24),
  }), []);
  const label = useMemo(() => new THREE.MeshStandardMaterial({ map: priceLabel(), roughness: 0.6 }), []);
  const arrow = useMemo(() => new THREE.MeshStandardMaterial({ map: turnArrow(), transparent: true, roughness: 0.6, depthWrite: false }), []);
  const inset = 0.013;
  const screws: [number, number][] = [[PLATE.x0 + inset, PLATE.y0 + inset], [PLATE.x1 - inset, PLATE.y0 + inset], [PLATE.x0 + inset, PLATE.y1 - inset], [PLATE.x1 - inset, PLATE.y1 - inset]];
  return (
    <group>
      <mesh geometry={geo.plate} material={m.steel} position={[0, 0, FRONT_Z]} castShadow receiveShadow />
      {screws.map(([x, y], i) => (
        <group key={i} position={[x, y, PLATE_FRONT]} rotation={[0, 0, i * 0.9]}>
          <mesh geometry={geo.screw} material={m.chrome} />
          <mesh material={m.glossBlack} position={[0, 0, 0.0021]}><boxGeometry args={[0.0062, 0.0011, 0.0006]} /></mesh>
        </group>
      ))}
      <mesh geometry={geo.exitBezel} material={m.glossBlack} position={[0, 0, PLATE_FRONT]} castShadow />
      <mesh material={arrow} position={[HANDLE.x, HANDLE.y, PLATE_FRONT + 0.0003]}><circleGeometry args={[0.092, 64]} /></mesh>
      <mesh geometry={geo.ring} material={m.chrome} position={[HANDLE.x, HANDLE.y, PLATE_FRONT]} castShadow />
      <mesh material={m.cavity} position={[HANDLE.x, HANDLE.y, PLATE_FRONT + 0.0004]}><circleGeometry args={[0.0525, 48]} /></mesh>
      {/* coin slot */}
      <RoundedBox args={[0.034, 0.056, 0.008]} radius={0.0035} smoothness={4} material={m.chrome} position={[COIN.x, COIN.y, PLATE_FRONT + 0.004]} castShadow />
      <mesh material={m.cavity} position={[COIN.x, COIN.y, PLATE_FRONT + 0.0081]}><boxGeometry args={[0.0044, 0.034, 0.0004]} /></mesh>
      {/* key lock, for the door behind the plate */}
      <mesh material={m.chrome} position={[-0.12, 0.112, PLATE_FRONT + 0.003]} rotation-x={Math.PI / 2}><cylinderGeometry args={[0.0085, 0.0085, 0.006, 24]} /></mesh>
      <mesh material={m.cavity} position={[-0.12, 0.112, PLATE_FRONT + 0.0062]}><boxGeometry args={[0.0018, 0.008, 0.0005]} /></mesh>
      {/* price label */}
      <mesh material={label} position={[LABEL.x, LABEL.y, PLATE_FRONT + 0.0004]}><planeGeometry args={[0.068, 0.034]} /></mesh>
    </group>
  );
}

/** The rotating handle: black dished knob with a cross grip and a chrome cap. */
export const Knob = forwardRef<THREE.Group>(function Knob(_, ref) {
  const m = materials();
  const geo = useMemo(() => ({
    body: frontLathe(knobProfile(0.05, 0.02, 0.007)),
    cap: frontLathe([[0, 0.0048], [0.006, 0.0042], [0.0105, 0.0022], [0.0118, 0]], 32),
  }), []);
  const dot = useMemo(() => new THREE.MeshBasicMaterial({ color: '#FFFFFF' }), []);
  return (
    <group ref={ref} position={[HANDLE.x, HANDLE.y, PLATE_FRONT + 0.0045]} name="knob" userData={{ knob: true }}>
      <mesh geometry={geo.body} material={m.glossBlack} castShadow />
      <RoundedBox args={[0.094, 0.025, 0.026]} radius={0.0095} smoothness={5} material={m.glossBlack} position={[0, 0, 0.026]} castShadow />
      <mesh geometry={geo.cap} material={m.chrome} position={[0, 0, 0.039]} />
      <mesh material={dot} position={[0, 0.036, 0.0201]}><circleGeometry args={[0.0042, 24]} /></mesh>
    </group>
  );
});

/** The exit flap visual (smoked clear plastic with print); physics body lives in the Machine. */
export function FlapVisual({ width, height, thickness }: { width: number; height: number; thickness: number }) {
  const m = materials();
  const print = useMemo(() => new THREE.MeshBasicMaterial({ map: flapPrint(), transparent: true, depthWrite: false }), []);
  return (
    <group userData={{ flap: true }}>
      <RoundedBox args={[width, height, thickness]} radius={0.0012} smoothness={2} material={m.smoke} position={[0, -height / 2, 0]} />
      <mesh material={print} position={[0, -height / 2, thickness / 2 + 0.0002]}><planeGeometry args={[width * 0.7, height * 0.35]} /></mesh>
    </group>
  );
}

/** Dark cup and hidden ramp behind the exit (what you see through the flap). */
function CupVisual() {
  const m = materials();
  return (
    <group>
      <mesh material={m.cavity} position={[0, 0.102, 0.145]} rotation={[0.05, 0, 0]} receiveShadow><boxGeometry args={[0.128, 0.008, 0.094]} /></mesh>
      <mesh material={m.cavity} position={[-0.069, 0.2, 0.06]} receiveShadow><boxGeometry args={[0.006, 0.22, 0.26]} /></mesh>
      <mesh material={m.cavity} position={[0.069, 0.2, 0.06]} receiveShadow><boxGeometry args={[0.006, 0.22, 0.26]} /></mesh>
      <mesh material={m.cavity} position={RAMP.center} rotation={[RAMP.angle, 0, 0]} receiveShadow><boxGeometry args={[0.128, 0.008, RAMP.length]} /></mesh>
      <mesh material={m.cavity} position={[0, 0.31, 0.06]}><boxGeometry args={[0.14, 0.006, 0.26]} /></mesh>
    </group>
  );
}

// Hidden ramp from the hand-off point down to the cup.
const RAMP = (() => {
  const a = new THREE.Vector2(-0.02, 0.215), b = new THREE.Vector2(0.105, 0.112);   // (z, y)
  const dz = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dz, dy);
  // Rotating by +t about X maps local +Z to (y = -sin t, z = cos t), so a down-slope toward +Z
  // (dy < 0) needs t = -atan2(dy, dz). The top-face normal (local +Y) becomes (y = cos t, z = sin t).
  const angle = -Math.atan2(dy, dz);
  const half = 0.004;
  const ny = Math.cos(angle), nz = Math.sin(angle);
  return { length, angle, center: [0, (a.y + b.y) / 2 - ny * half, (a.x + b.x) / 2 - nz * half] as [number, number, number] };
})();

/** All visual parts that never move. */
export function CabinetVisual() {
  return (
    <group>
      <Shell />
      <Hopper />
      <Header />
      <Plate />
      <CupVisual />
    </group>
  );
}

/** Fixed colliders: hopper box (group 0) and the hidden chute + cup (group 1). */
export const CabinetColliders = forwardRef<RapierRigidBody>(function CabinetColliders(_, chuteRef) {
  const H = HOPPER.ceiling - HOPPER.floor, D = INNER.front - INNER.back, zc = (INNER.front + INNER.back) / 2, yc = HOPPER.floor + H / 2;
  const T = 0.01;
  return (
    <>
      <RigidBody type="fixed" colliders={false} collisionGroups={G.hopperStatic}>
        <CuboidCollider args={[INNER.x, T, D / 2]} position={[0, HOPPER.floor - T, zc]} />
        <CuboidCollider args={[INNER.x, T, D / 2]} position={[0, HOPPER.ceiling + T, zc]} />
        <CuboidCollider args={[T, H / 2, D / 2]} position={[-INNER.x - T, yc, zc]} />
        <CuboidCollider args={[T, H / 2, D / 2]} position={[INNER.x + T, yc, zc]} />
        <CuboidCollider args={[INNER.x, H / 2, T]} position={[0, yc, INNER.back - T]} />
        <CuboidCollider args={[INNER.x, H / 2, 0.002]} position={[0, yc, ACRYLIC_Z]} />
      </RigidBody>
      <RigidBody ref={chuteRef} type="fixed" colliders={false} collisionGroups={G.chuteStatic}>
        <CuboidCollider args={[0.064, 0.004, RAMP.length / 2]} position={RAMP.center} rotation={[RAMP.angle, 0, 0]} />
        <CuboidCollider args={[0.064, 0.004, 0.047]} position={[0, 0.102, 0.145]} rotation={[0.05, 0, 0]} />
        <CuboidCollider args={[0.003, 0.11, 0.13]} position={[-0.069, 0.2, 0.06]} />
        <CuboidCollider args={[0.003, 0.11, 0.13]} position={[0.069, 0.2, 0.06]} />
        <CuboidCollider args={[0.07, 0.11, 0.003]} position={[0, 0.2, -0.055]} />
        <CuboidCollider args={[0.07, 0.06, 0.006]} position={[0, EXIT.y1 + 0.06, FRONT_Z - 0.006]} />
        <CuboidCollider args={[0.07, 0.003, 0.13]} position={[0, 0.31, 0.06]} />
        {/* Door frame stop just outside the flap: the capsule always ends up resting here. */}
        <CuboidCollider args={[EXIT.x1 - EXIT.x0, (EXIT.y1 - EXIT.y0) / 2, 0.002]} position={[0, (EXIT.y0 + EXIT.y1) / 2, FLAP.z + FLAP.thickness / 2 + 0.0025]} />
      </RigidBody>
      <RigidBody type="fixed" colliders={false} collisionGroups={G.catchFloor}>
        <CuboidCollider args={[3, 0.01, 3]} position={[0, -0.01, 0]} />
      </RigidBody>
    </>
  );
});
