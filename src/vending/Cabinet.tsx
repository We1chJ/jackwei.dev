// Card vending machine: static visuals (cabinet, glass, shelves, coils, keypad, bin) and the
// fixed colliders the dropped cards fall through. Machine frame: see dims.ts.
import { useMemo, type MutableRefObject, type Ref } from 'react';
import * as THREE from 'three';
import { RoundedBox } from '@react-three/drei';
import { CuboidCollider, RigidBody, interactionGroups } from '@react-three/rapier';
import { frame, panel, slab, uShell } from '../gacha/geometry';
import { materials } from '../gacha/materials';
import { headerSign, instructionCard, keyCap, pushPrint, shelfStrip, sideWrap } from './art';
import { BIN, BIN_FLAP, COIL, COLS, COL_X, FRONT_Z, GLASS_Z, HEADER, HOWTO, INSIDE, KEYPAD, LED, PANEL, ROWS, SHELF, SHELF_Y, SLAB, VM, WINDOW, slotZ } from './dims';
import { expand } from '../gacha/geometry';

export const VG = { static: interactionGroups(4, [5]), item: interactionGroups(5, [4, 5]) };
export const KEYS = [['A', 'B', 'C', 'D'], ['1', '2', '3', '4'], ['CLR', '★']];

let cache: ReturnType<typeof build> | null = null;
export const vendMaterials = () => (cache ??= build());
function build() {
  const m = materials();
  const body = m.paint.clone(); body.color.set('#1E2652');
  const trim = m.paint.clone(); trim.color.set('#FFC21A');
  return {
    body, trim,
    wall: new THREE.MeshStandardMaterial({ color: '#E6E9EE', roughness: 0.75, emissive: '#ffffff', emissiveIntensity: 0.04 }),
    shelf: new THREE.MeshStandardMaterial({ color: '#CFD3D8', metalness: 0.7, roughness: 0.32 }),
    coil: new THREE.MeshStandardMaterial({ color: '#DCE0E4', metalness: 1, roughness: 0.2 }),
    strip: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    sign: new THREE.MeshBasicMaterial({ map: headerSign(), toneMapped: false }),
    push: new THREE.MeshBasicMaterial({ map: pushPrint(), transparent: true, depthWrite: false }),
    side: new THREE.MeshPhysicalMaterial({ map: sideWrap(), roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.12 }),
    howto: new THREE.MeshStandardMaterial({ map: instructionCard(), roughness: 0.5 }),
    label: new THREE.MeshStandardMaterial({ color: '#F4F2EA', roughness: 0.6 }),
    // Shelf code strips light up when their row is chosen (emissive driven by the machine).
    strips: ROWS.map((r) => { const t = shelfStrip(r); return new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: '#FFE08A', emissiveIntensity: 0, roughness: 0.6 }); }),
    // Glow outlines: around the chosen card(s) and the bin when a card waits.
    select: new THREE.MeshBasicMaterial({ color: '#FFD23F', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    selectHot: new THREE.MeshBasicMaterial({ color: '#FFE9A0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    binGlow: new THREE.MeshBasicMaterial({ color: '#FFD23F', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  };
}

// Helix along +Z around the coil axis; one shared geometry for all sixteen coils.
class Helix extends THREE.Curve<THREE.Vector3> {
  constructor() { super(); }
  getPoint(t: number, out = new THREE.Vector3()) {
    const turns = (COIL.front - COIL.back) / COIL.pitch, a = t * turns * Math.PI * 2;
    return out.set(Math.cos(a) * COIL.radius, Math.sin(a) * COIL.radius, COIL.back + t * (COIL.front - COIL.back));
  }
}
const helixGeo = new THREE.TubeGeometry(new Helix(), 360, COIL.wire, 8, false);

function Shell() {
  const m = vendMaterials(), base = materials();
  const geo = useMemo(() => ({
    shell: uShell(VM.w, VM.d, VM.radius, VM.wall, 0.03, VM.h),
    lid: slab(VM.w, VM.d, VM.radius, VM.h - 0.02, 0.02, 0.004),
    plinth: slab(VM.w - 0.04, VM.d - 0.04, VM.radius, 0, 0.03, 0.004),
    front: panel({ x0: -VM.w / 2, y0: 0.03, x1: VM.w / 2, y1: VM.h - 0.02 }, VM.radius, [
      { rect: WINDOW, radius: WINDOW.radius },
      { rect: BIN, radius: BIN.radius },
    ], 0.02, 0.003),
    bezel: frame(WINDOW, WINDOW.radius, 0.014, 0.012),
    signFrame: frame({ x0: -0.43, y0: HEADER.y0, x1: 0.43, y1: HEADER.y1 }, 0.01, 0.008, 0.008),
    binBezel: frame(BIN, BIN.radius, 0.01, 0.01),
  }), []);
  return (
    <group>
      <mesh geometry={geo.shell} material={m.body} castShadow receiveShadow />
      <mesh geometry={geo.lid} material={m.body} castShadow />
      <mesh geometry={geo.plinth} material={base.rubber} castShadow receiveShadow />
      <mesh geometry={geo.front} material={m.body} position={[0, 0, FRONT_Z - 0.02]} castShadow receiveShadow />
      <mesh geometry={geo.bezel} material={base.glossBlack} position={[0, 0, FRONT_Z]} castShadow />
      <mesh geometry={geo.signFrame} material={base.chrome} position={[0, 0, FRONT_Z]} />
      <mesh geometry={geo.binBezel} material={base.glossBlack} position={[0, 0, FRONT_Z]} />
      <mesh material={m.sign} position={[0, (HEADER.y0 + HEADER.y1) / 2, FRONT_Z + 0.002]}><planeGeometry args={[0.86, HEADER.y1 - HEADER.y0]} /></mesh>
      <mesh material={base.glassReflect} position={[0, (HEADER.y0 + HEADER.y1) / 2, FRONT_Z + 0.004]} renderOrder={4}><planeGeometry args={[0.86, HEADER.y1 - HEADER.y0]} /></mesh>
      {/* yellow trim above a stainless kick plate with vent slots */}
      <mesh material={m.trim} position={[0, 0.132, FRONT_Z + 0.002]}><boxGeometry args={[VM.w - 0.06, 0.014, 0.004]} /></mesh>
      <mesh material={base.steel} position={[0, 0.08, FRONT_Z + 0.003]} castShadow><boxGeometry args={[VM.w - 0.06, 0.075, 0.006]} /></mesh>
      {Array.from({ length: 10 }, (_, i) => <mesh key={i} material={base.cavity} position={[-0.36 + i * 0.08, 0.08, FRONT_Z + 0.0062]}><boxGeometry args={[0.05, 0.007, 0.001]} /></mesh>)}
      <Hardware />
    </group>
  );
}

/** Door seam, hinges, lock, bill acceptor, coin return, feet and the side wrap. */
function Hardware() {
  const m = vendMaterials(), base = materials();
  const seam = useMemo(() => frame({ x0: -VM.w / 2 + 0.012, y0: 0.035, x1: VM.w / 2 - 0.012, y1: VM.h - 0.025 }, VM.radius * 0.6, 0.003, 0.001, 0), []);
  const coinCup = useMemo(() => frame({ x0: 0.285, y0: 0.42, x1: 0.385, y1: 0.5 }, 0.012, 0.008, 0.012), []);
  const z = FRONT_Z;
  return (
    <group>
      <mesh geometry={seam} material={base.cavity} position={[0, 0, z + 0.0006]} />
      {[0.35, 1.5].map((y) => <mesh key={y} material={base.chrome} position={[-VM.w / 2 + 0.006, y, z - 0.004]}><cylinderGeometry args={[0.007, 0.007, 0.07, 16]} /></mesh>)}
      {/* T-handle lock */}
      <mesh material={base.chrome} position={[0.395, 0.68, z + 0.008]} rotation-x={Math.PI / 2}><cylinderGeometry args={[0.016, 0.016, 0.014, 28]} /></mesh>
      <mesh material={base.cavity} position={[0.395, 0.68, z + 0.0155]}><boxGeometry args={[0.003, 0.013, 0.001]} /></mesh>
      {/* bill acceptor: black bezel, slot, green status light */}
      <RoundedBox args={[0.11, 0.06, 0.02]} radius={0.006} smoothness={3} position={[KEYPAD.x, 1.025, z + 0.012]} material={base.glossBlack} castShadow />
      <mesh material={base.cavity} position={[KEYPAD.x, 1.032, z + 0.0225]}><boxGeometry args={[0.08, 0.004, 0.001]} /></mesh>
      <mesh material={m.strip} position={[KEYPAD.x, 1.012, z + 0.0225]}><boxGeometry args={[0.03, 0.003, 0.001]} /></mesh>
      {/* coin return cup */}
      <mesh geometry={coinCup} material={base.chrome} position={[0, 0, z]} />
      <mesh material={base.cavity} position={[0.335, 0.46, z + 0.001]}><planeGeometry args={[0.1, 0.08]} /></mesh>
      {/* leveling feet */}
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
        <mesh key={i} material={base.chrome} position={[sx * (VM.w / 2 - 0.035), 0.006, sz * (VM.d / 2 - 0.035)]}><cylinderGeometry args={[0.018, 0.02, 0.012, 20]} /></mesh>
      ))}
      <mesh material={m.side} position={[VM.w / 2 + 0.0012, 0.95, 0]} rotation-y={Math.PI / 2}><planeGeometry args={[VM.d - 0.08, 1.6]} /></mesh>
    </group>
  );
}

/** Glow outlines the machine fades in and out: one per coil's front card, and one round the bin. */
export function Highlights({ slotRefs, binRef }: { slotRefs: MutableRefObject<(THREE.Mesh | null)[]>; binRef: Ref<THREE.Mesh> }) {
  const m = vendMaterials();
  const geo = useMemo(() => frame({ x0: -SLAB.w / 2 - 0.006, y0: -SLAB.h / 2 - 0.006, x1: SLAB.w / 2 + 0.006, y1: SLAB.h / 2 + 0.006 }, 0.008, 0.006, 0.001, 0), []);
  const bin = useMemo(() => frame(expand(BIN, 0.012), BIN.radius + 0.012, 0.01, 0.001, 0), []);
  return (
    <group>
      {SHELF_Y.map((y, r) => COL_X.map((x, c) => (
        <mesh key={`${r}-${c}`} ref={(o) => { slotRefs.current[r * COLS + c] = o; }} geometry={geo} material={m.select} position={[x, y + SLAB.h / 2, slotZ(0) + SLAB.t / 2 + 0.004]} renderOrder={5} />
      )))}
      <mesh ref={binRef} geometry={bin} material={m.binGlow} position={[0, 0, FRONT_Z + 0.006]} renderOrder={5} />
    </group>
  );
}

function Interior() {
  const m = vendMaterials(), base = materials();
  const w = INSIDE.x1 - INSIDE.x0, cx = (INSIDE.x0 + INSIDE.x1) / 2, depth = SHELF.front - SHELF.back;
  const strips = m.strips;
  return (
    <group>
      <mesh material={m.wall} position={[cx, (WINDOW.y0 + WINDOW.y1) / 2, INSIDE.back]}><planeGeometry args={[w + 0.03, WINDOW.y1 - WINDOW.y0 + 0.04]} /></mesh>
      <mesh material={m.wall} position={[INSIDE.x0 - 0.005, (WINDOW.y0 + WINDOW.y1) / 2, 0]} rotation-y={Math.PI / 2}><planeGeometry args={[VM.d - 0.06, WINDOW.y1 - WINDOW.y0 + 0.04]} /></mesh>
      <mesh material={m.wall} position={[INSIDE.x1 + 0.005, (WINDOW.y0 + WINDOW.y1) / 2, 0]} rotation-y={-Math.PI / 2}><planeGeometry args={[VM.d - 0.06, WINDOW.y1 - WINDOW.y0 + 0.04]} /></mesh>
      <mesh material={m.wall} position={[cx, WINDOW.y1 + 0.01, 0]} rotation-x={Math.PI / 2}><planeGeometry args={[w + 0.03, VM.d - 0.06]} /></mesh>
      {/* LED strip behind the top bezel (its light is the arcade's shared interior light) */}
      <mesh material={m.strip} position={[cx, WINDOW.y1 - 0.004, GLASS_Z - 0.03]}><boxGeometry args={[w - 0.02, 0.006, 0.01]} /></mesh>
      {SHELF_Y.map((y, r) => (
        <group key={r}>
          <mesh material={m.shelf} position={[cx, y - SHELF.thickness / 2, (SHELF.front + SHELF.back) / 2]} receiveShadow><boxGeometry args={[w, SHELF.thickness, depth]} /></mesh>
          <mesh material={strips[r]} position={[cx, y - 0.016, SHELF.front + 0.001]}><planeGeometry args={[w, 0.028]} /></mesh>
          {/* shelf side rails, and motor housings (with their labels) at the back of each coil */}
          <mesh material={base.chrome} position={[INSIDE.x0 + 0.004, y + 0.006, (SHELF.front + SHELF.back) / 2]}><boxGeometry args={[0.006, 0.012, depth]} /></mesh>
          <mesh material={base.chrome} position={[INSIDE.x1 - 0.004, y + 0.006, (SHELF.front + SHELF.back) / 2]}><boxGeometry args={[0.006, 0.012, depth]} /></mesh>
          {COL_X.map((x, c) => (
            <group key={c} position={[x, y + COIL.radius, SHELF.back + 0.02]}>
              <mesh material={base.cavity}><boxGeometry args={[0.07, 0.07, 0.04]} /></mesh>
              <mesh material={m.label} position={[0, 0.018, 0.0205]}><planeGeometry args={[0.04, 0.014]} /></mesh>
            </group>
          ))}
        </group>
      ))}
      {/* the drop well below the bottom shelf, and the bin */}
      <mesh material={base.cavity} position={[cx, (BIN.y0 + WINDOW.y0) / 2, INSIDE.back]}><planeGeometry args={[w + 0.03, WINDOW.y0 - BIN.y0 + 0.1]} /></mesh>
      <BinFloorVisual />
    </group>
  );
}

const binFloor = (() => {
  const [z0, y0] = BIN.floorBack, [z1, y1] = BIN.floorFront;
  const dz = z1 - z0, dy = y1 - y0, length = Math.hypot(dz, dy), angle = -Math.atan2(dy, dz), T = 0.006;
  return { length, angle, center: [(BIN.x0 + BIN.x1) / 2, (y0 + y1) / 2 - Math.cos(angle) * T, (z0 + z1) / 2 - Math.sin(angle) * T] as [number, number, number], T };
})();

function BinFloorVisual() {
  const base = materials();
  return (
    <mesh material={base.cavity} position={binFloor.center} rotation-x={binFloor.angle} receiveShadow>
      <boxGeometry args={[INSIDE.x1 - INSIDE.x0, binFloor.T * 2, binFloor.length]} />
    </mesh>
  );
}

/** Coils, each in its own group so the machine can turn it. */
export function Coils({ refs }: { refs: MutableRefObject<(THREE.Group | null)[]> }) {
  const m = vendMaterials();
  return (
    <>
      {SHELF_Y.map((y, r) => COL_X.map((x, c) => (
        <group key={`${r}-${c}`} ref={(g) => { refs.current[r * COLS + c] = g; }} position={[x, y + COIL.radius + 0.0015, 0]}>
          <mesh geometry={helixGeo} material={m.coil} castShadow />
        </group>
      )))}
    </>
  );
}

function Glass() {
  const base = materials();
  const cx = (WINDOW.x0 + WINDOW.x1) / 2, cy = (WINDOW.y0 + WINDOW.y1) / 2, w = WINDOW.x1 - WINDOW.x0 + 0.01, h = WINDOW.y1 - WINDOW.y0 + 0.01;
  return (
    <group>
      <mesh material={base.acrylicTint} position={[cx, cy, GLASS_Z]} renderOrder={3}><planeGeometry args={[w, h]} /></mesh>
      <mesh material={base.glassReflect} position={[cx, cy, GLASS_Z + 0.003]} renderOrder={4}><planeGeometry args={[w, h]} /></mesh>
      <mesh geometry={useMemo(() => frame(expand(WINDOW, -0.007), WINDOW.radius * 0.6, 0.007, 0.008, 0.002), [])} material={base.rubber} position={[0, 0, GLASS_Z - 0.002]} />
    </group>
  );
}

type KeyProps = { onKey: (label: string, mesh: THREE.Object3D | null) => void; ledTexture: THREE.Texture };

/** Keypad column: LED screen, the keys, coin slot and return button. */
export function KeypadPanel({ onKey, ledTexture }: KeyProps) {
  const base = materials();
  const caps = useMemo(() => new Map(KEYS.flat().map((k) => {
    const t = keyCap(k);
    return [k, new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: '#ffffff', emissiveIntensity: 0.35, roughness: 0.35 })];
  })), []);
  const ledMat = useMemo(() => new THREE.MeshBasicMaterial({ map: ledTexture, toneMapped: false }), [ledTexture]);
  const plate = useMemo(() => panel({ x0: PANEL.x0, y0: 0.86, x1: PANEL.x1, y1: 1.5 }, 0.014, [], 0.006, 0.002), []);
  const [kw, kh] = KEYPAD.key, g = KEYPAD.gap;
  const rowW = 4 * kw + 3 * g;
  return (
    <group position={[0, 0, FRONT_Z]}>
      <mesh geometry={plate} material={base.glossBlack} />
      <mesh material={ledMat} position={[LED.x, LED.y, 0.0075]}><planeGeometry args={[LED.w, LED.h]} /></mesh>
      <mesh geometry={useMemo(() => frame({ x0: LED.x - LED.w / 2, y0: LED.y - LED.h / 2, x1: LED.x + LED.w / 2, y1: LED.y + LED.h / 2 }, 0.004, 0.005, 0.009), [])} material={base.chrome} />
      <mesh material={base.glassReflect} position={[LED.x, LED.y, 0.009]} renderOrder={4}><planeGeometry args={[LED.w, LED.h]} /></mesh>
      {KEYS.map((row, r) => {
        const w = row.length === 4 ? kw : (rowW - g) / 2;
        return row.map((label, c) => {
          const x = KEYPAD.x - rowW / 2 + w / 2 + c * (w + g), y = KEYPAD.y - r * (kh + g), z = 0.011;
          return (
            <group key={label} position={[x, y, z]} userData={{ vkey: label, baseZ: z, cap: caps.get(label) }} ref={(o) => onKey(label, o)}>
              <RoundedBox args={[w, kh, 0.012]} radius={0.004} smoothness={3} material={base.glossBlack} castShadow />
              <mesh material={caps.get(label)} position={[0, 0, 0.0062]}><planeGeometry args={[w - 0.006, kh - 0.006]} /></mesh>
            </group>
          );
        });
      })}
      <mesh material={vendMaterials().howto} position={[HOWTO.x, HOWTO.y, 0.0072]}><planeGeometry args={[HOWTO.w, HOWTO.h]} /></mesh>
      {/* coin slot and return button, for looks */}
      <RoundedBox args={[0.05, 0.07, 0.012]} radius={0.006} smoothness={3} position={[KEYPAD.x - 0.04, 0.95, 0.012]} material={base.chrome} />
      <mesh material={base.cavity} position={[KEYPAD.x - 0.04, 0.95, 0.0185]}><boxGeometry args={[0.006, 0.042, 0.002]} /></mesh>
      <mesh material={base.chrome} position={[KEYPAD.x + 0.045, 0.95, 0.012]} rotation-x={Math.PI / 2}><cylinderGeometry args={[0.018, 0.018, 0.012, 32]} /></mesh>
    </group>
  );
}

export function FlapVisual() {
  const base = materials(), m = vendMaterials();
  return (
    <group userData={{ vflap: true }}>
      <RoundedBox args={[BIN_FLAP.width, BIN_FLAP.height, BIN_FLAP.thickness]} radius={0.0015} smoothness={2} position={[0, -BIN_FLAP.height / 2, 0]} material={base.smoke} renderOrder={2} />
      <mesh material={m.push} position={[0, -BIN_FLAP.height / 2, BIN_FLAP.thickness / 2 + 0.0005]} renderOrder={3}><planeGeometry args={[0.12, 0.03]} /></mesh>
    </group>
  );
}

export function VendingVisual(props: KeyProps & { coilRefs: MutableRefObject<(THREE.Group | null)[]> }) {
  return (
    <group>
      <Shell />
      <Interior />
      <Coils refs={props.coilRefs} />
      <Glass />
      <KeypadPanel onKey={props.onKey} ledTexture={props.ledTexture} />
    </group>
  );
}

/** Fixed colliders: shelves, the glass, the drop well and the sloped bin floor. */
export function VendingColliders({ x }: { x: number }) {
  const w = INSIDE.x1 - INSIDE.x0, cx = (INSIDE.x0 + INSIDE.x1) / 2, depth = SHELF.front - SHELF.back, T = 0.01;
  const glassBottom = BIN.y1 + 0.004, wellH = WINDOW.y1 - 0.1;
  return (
    <RigidBody type="fixed" colliders={false} position={[x, 0, 0]} collisionGroups={VG.static}>
      {SHELF_Y.map((y, r) => <CuboidCollider key={r} args={[w / 2, SHELF.thickness / 2, depth / 2]} position={[cx, y - SHELF.thickness / 2, (SHELF.front + SHELF.back) / 2]} />)}
      <CuboidCollider args={[w / 2 + 0.02, (WINDOW.y1 - glassBottom) / 2, 0.004]} position={[cx, (WINDOW.y1 + glassBottom) / 2, GLASS_Z]} />
      <CuboidCollider args={[w / 2 + 0.02, BIN.y0 / 2, 0.004]} position={[cx, BIN.y0 / 2, GLASS_Z]} />
      <CuboidCollider args={[T, wellH / 2, VM.d / 2]} position={[INSIDE.x0 - T, 0.1 + wellH / 2, 0]} />
      <CuboidCollider args={[T, wellH / 2, VM.d / 2]} position={[INSIDE.x1 + T, 0.1 + wellH / 2, 0]} />
      <CuboidCollider args={[w / 2, wellH / 2, T]} position={[cx, 0.1 + wellH / 2, INSIDE.back - T]} />
      <CuboidCollider args={[w / 2, binFloor.T, binFloor.length / 2]} position={binFloor.center} rotation={[binFloor.angle, 0, 0]} />
      <CuboidCollider args={[w / 2, T, VM.d / 2]} position={[cx, 0.12, 0]} />
    </RigidBody>
  );
}
