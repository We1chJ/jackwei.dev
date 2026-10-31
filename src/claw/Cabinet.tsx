// Claw machine: static visuals (cabinet with coin door and speaker, glass box with gaskets,
// marquee with chasing bulbs, pit, rails, control panel with the playable joystick and DROP
// button) and the fixed colliders. Machine frame: see dims.ts.
import { useMemo, type MutableRefObject, type Ref } from 'react';
import * as THREE from 'three';
import { RoundedBox } from '@react-three/drei';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { expand, frame, panel, uShell } from '../gacha/geometry';
import { materials } from '../gacha/materials';
import { Bolts, GlassSheen, Instances, LedBar, Louvres, boltRow, smudgeRoughness } from '../arcade/surfaces';
import { backdrop, bulbGlow, clawSide, coinDisplay, frontDecal, marquee, panelFront, panelPrint, prizePrint, prizeSticker, speakerGrille } from './art';
import { BODY_TOP, BOX_TOP, CM, DOOR, FLOOR_Y, FRONT_Z, GANTRY_Y, HOLE, IN, PANEL, SHAFT } from './dims';
import { PG } from './Plush';

let cache: ReturnType<typeof build> | null = null;
export const clawMaterials = () => (cache ??= build());
function build() {
  const m = materials();
  const body = m.paint.clone(); body.color.set('#F4478E'); body.roughness = 0.55; body.roughnessMap = smudgeRoughness();
  const trim = m.paint.clone(); trim.color.set('#FFC92E');
  const deep = m.paint.clone(); deep.color.set('#C22469'); deep.roughness = 0.5;
  return {
    body, trim, deep,
    felt: new THREE.MeshPhysicalMaterial({ color: '#3A1F7A', roughness: 1, sheen: 1, sheenRoughness: 0.6, sheenColor: new THREE.Color('#8E6BFF') }),
    sign: new THREE.MeshBasicMaterial({ map: marquee(), toneMapped: false }),
    backdrop: new THREE.MeshStandardMaterial({ map: backdrop(), roughness: 0.8, emissive: '#ffffff', emissiveIntensity: 0.12 }),
    decal: new THREE.MeshStandardMaterial({ map: frontDecal(), transparent: true, roughness: 0.4 }),
    side: new THREE.MeshPhysicalMaterial({ map: clawSide(), roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.12 }),
    prize: new THREE.MeshBasicMaterial({ map: prizePrint(), transparent: true, depthWrite: false }),
    sticker: new THREE.MeshStandardMaterial({ map: prizeSticker(), roughness: 0.5 }),
    print: new THREE.MeshStandardMaterial({ map: panelPrint(), roughness: 0.45 }),
    label: new THREE.MeshStandardMaterial({ map: panelFront(), transparent: true, roughness: 0.5 }),
    grille: new THREE.MeshStandardMaterial({ map: speakerGrille(), roughness: 0.7, transparent: true }),
    coinLed: new THREE.MeshBasicMaterial({ map: coinDisplay(), toneMapped: false }),
    bulbOn: new THREE.MeshStandardMaterial({ color: '#FFF2C4', emissive: '#FFE08A', emissiveIntensity: 2.4 }),
    bulbOff: new THREE.MeshStandardMaterial({ color: '#E8D9A8', emissive: '#FFE08A', emissiveIntensity: 0.25 }),
    bulbHalo: new THREE.MeshBasicMaterial({ map: bulbGlow(), color: '#FFD27A', transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    strip: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    red: new THREE.MeshPhysicalMaterial({ color: '#E8213A', roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05, emissive: '#FF2A3A', emissiveIntensity: 0 }),
    stickBall: new THREE.MeshPhysicalMaterial({ color: '#E8213A', roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.05, emissive: '#FF3344', emissiveIntensity: 0 }),
    glow: new THREE.MeshStandardMaterial({ color: '#FFE9A6', emissive: '#FFD23F', emissiveIntensity: 1.2, roughness: 0.4 }),
    aim: new THREE.MeshBasicMaterial({ color: '#FF2A3A', transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }),
    acrylic: new THREE.MeshPhysicalMaterial({ color: '#E8F6FF', roughness: 0.04, transparent: true, opacity: 0.18, clearcoat: 1, depthWrite: false }),
    proxy: new THREE.MeshBasicMaterial({ visible: false }),   // invisible, generous click targets
    doorGlow: new THREE.MeshBasicMaterial({ color: '#FFD23F', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  };
}

function LowerCabinet() {
  const m = clawMaterials(), base = materials();
  const doorRect = { x0: DOOR.x0, y0: DOOR.y0, x1: DOOR.x1, y1: DOOR.y1 };
  const geo = useMemo(() => ({
    bezel: frame(doorRect, 0.012, 0.01, 0.01),
    // Hollow shell with a real door opening, so a won prize shows through the smoked door.
    shell: uShell(CM.w, CM.d, 0.02, 0.015, 0.03, BODY_TOP - 0.035),
    front: panel({ x0: -CM.w / 2, y0: 0.03, x1: CM.w / 2, y1: BODY_TOP - 0.035 }, 0.02, [{ rect: doorRect, radius: 0.012 }], 0.015, 0.002),
  }), []);
  const z = FRONT_Z;
  const pw = DOOR.x1 - DOOR.x0 + 0.02, pcx = (DOOR.x0 + DOOR.x1) / 2, pocketBack = 0.16, pd = z - pocketBack, pTop = DOOR.y1 + 0.08;
  return (
    <group>
      <mesh geometry={geo.shell} material={m.body} castShadow receiveShadow />
      <mesh geometry={geo.front} material={m.body} position={[0, 0, z - 0.015]} castShadow receiveShadow />
      {/* dark prize pocket behind the door: walls, back and a lid */}
      <mesh material={base.cavity} position={[pcx - pw / 2, (DOOR.y0 + pTop) / 2, pocketBack + pd / 2]} rotation-y={Math.PI / 2}><planeGeometry args={[pd, pTop - DOOR.y0 + 0.04]} /></mesh>
      <mesh material={base.cavity} position={[pcx + pw / 2, (DOOR.y0 + pTop) / 2, pocketBack + pd / 2]} rotation-y={-Math.PI / 2}><planeGeometry args={[pd, pTop - DOOR.y0 + 0.04]} /></mesh>
      <mesh material={base.cavity} position={[pcx, (DOOR.y0 + pTop) / 2, pocketBack]}><planeGeometry args={[pw, pTop - DOOR.y0 + 0.04]} /></mesh>
      <mesh material={base.cavity} position={[pcx, pTop, pocketBack + pd / 2]} rotation-x={Math.PI / 2}><planeGeometry args={[pw, pd]} /></mesh>
      <mesh material={base.cavity} position={[pcx, DOOR.y0 - 0.005, pocketBack + pd / 2]} rotation-x={-Math.PI / 2}><planeGeometry args={[pw, pd]} /></mesh>
      <RoundedBox args={[CM.w - 0.04, 0.03, CM.d - 0.04]} radius={0.008} smoothness={2} position={[0, 0.015, 0]} material={base.rubber} receiveShadow />
      {/* chrome leveling feet */}
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
        <mesh key={i} material={base.chrome} position={[sx * (CM.w / 2 - 0.03), 0.006, sz * (CM.d / 2 - 0.03)]}><cylinderGeometry args={[0.016, 0.018, 0.012, 20]} /></mesh>
      ))}
      {/* upper band: decal over a chrome strip */}
      <mesh material={m.decal} position={[0, 0.78, z + 0.001]}><planeGeometry args={[0.72, 0.253]} /></mesh>
      <mesh material={base.chrome} position={[0, 0.635, z + 0.003]}><boxGeometry args={[CM.w - 0.06, 0.008, 0.006]} /></mesh>
      {/* prize door bezel */}
      <mesh geometry={geo.bezel} material={base.chrome} position={[0, 0, z]} />
      {/* speaker grille */}
      <mesh material={m.grille} position={[-0.02, 0.4, z + 0.002]}><circleGeometry args={[0.062, 40]} /></mesh>
      <mesh material={base.chrome} position={[-0.02, 0.4, z + 0.002]}><torusGeometry args={[0.064, 0.004, 8, 48]} /></mesh>
      {/* coin door: two lit coin mechs with return buttons, and the lock */}
      <RoundedBox args={[0.2, 0.3, 0.012]} radius={0.008} smoothness={3} position={[0.245, 0.4, z + 0.006]} material={base.steel} castShadow />
      {[0.195, 0.295].map((x) => (
        <group key={x} position={[x, 0.46, z + 0.012]}>
          <RoundedBox args={[0.052, 0.09, 0.012]} radius={0.005} smoothness={3} material={base.chrome} />
          <mesh material={m.coinLed} position={[0, 0.026, 0.0065]}><planeGeometry args={[0.04, 0.02]} /></mesh>
          <mesh material={base.cavity} position={[0, -0.006, 0.0065]}><boxGeometry args={[0.004, 0.026, 0.002]} /></mesh>
          <mesh material={base.glossBlack} position={[0, -0.032, 0.007]} rotation-x={Math.PI / 2}><cylinderGeometry args={[0.008, 0.008, 0.006, 20]} /></mesh>
        </group>
      ))}
      <mesh material={base.chrome} position={[0.245, 0.305, z + 0.014]} rotation-x={Math.PI / 2}><cylinderGeometry args={[0.012, 0.012, 0.008, 24]} /></mesh>
      <mesh material={base.cavity} position={[0.245, 0.305, z + 0.0185]}><boxGeometry args={[0.0025, 0.012, 0.001]} /></mesh>
      {/* stainless kick plate with vents */}
      <mesh material={base.steel} position={[0, 0.085, z + 0.003]} castShadow><boxGeometry args={[CM.w - 0.05, 0.1, 0.006]} /></mesh>
      <Louvres w={CM.w - 0.14} h={0.066} rows={5} position={[0, 0.085, z + 0.0065]} />
      <group position={[0, 0.085, z + 0.0064]}><Bolts points={[[-0.385, 0.034], [0.385, 0.034], [-0.385, -0.034], [0.385, -0.034]]} r={0.0045} /></group>
      <CabinetTrim />
      {/* side wrap */}
      <mesh material={m.side} position={[CM.w / 2 + 0.0012, 0.52, 0]} rotation-y={Math.PI / 2}><planeGeometry args={[CM.d - 0.08, 0.82]} /></mesh>
      {/* yellow trim band under the glass */}
      <mesh material={m.trim} position={[0, BODY_TOP - 0.02, 0]}><boxGeometry args={[CM.w + 0.006, 0.03, CM.d + 0.006]} /></mesh>
    </group>
  );
}

/** Mouldings and hardware that break up the painted panels. */
function CabinetTrim() {
  const m = clawMaterials(), base = materials();
  const z = FRONT_Z, top = BODY_TOP - 0.035, sideW = CM.d - 0.1;
  const sidePanel = useMemo(() => frame({ x0: -sideW / 2, y0: 0.15, x1: sideW / 2, y1: 0.9 }, 0.012, 0.008, 0.004, 0.001), [sideW]);
  const inset = useMemo(() => frame({ x0: -0.385, y0: 0.15, x1: 0.385, y1: 0.615 }, 0.012, 0.006, 0.004, 0.001), []);
  const corners = [[-1, 1], [1, 1], [1, -1], [-1, -1]];
  return (
    <group>
      {/* chrome corner mouldings, top to bottom */}
      {corners.map(([sx, sz], i) => <RoundedBox key={i} args={[0.03, top - 0.03, 0.03]} radius={0.01} smoothness={3} position={[sx * (CM.w / 2 - 0.006), (top + 0.03) / 2, sz * (CM.d / 2 - 0.006)]} material={base.chrome} castShadow />)}
      {/* rubber bumper round the base */}
      <RoundedBox args={[CM.w + 0.016, 0.03, CM.d + 0.016]} radius={0.01} smoothness={3} position={[0, 0.042, 0]} material={base.rubber} castShadow />
      {/* a raised frame round the front panel, dark seam behind it */}
      <mesh geometry={inset} material={m.deep} position={[0, 0, z]} />
      {/* right side: framed panel, bolts, a vent low down */}
      <group position={[CM.w / 2 + 0.0015, 0, 0]} rotation-y={Math.PI / 2}>
        <mesh geometry={sidePanel} material={m.deep} />
        <group position={[0, 0, 0.003]}>
          <Bolts points={[...boltRow(-sideW / 2 + 0.01, 0.135, sideW / 2 - 0.01, 0.135, 7), ...boltRow(-sideW / 2 + 0.01, 0.915, sideW / 2 - 0.01, 0.915, 7)]} r={0.0048} />
        </group>
        <Louvres w={0.36} h={0.05} rows={4} position={[0, 0.095, 0.002]} material={m.deep} />
      </group>
      {/* left side, for the glide past it */}
      <group position={[-CM.w / 2 - 0.0015, 0, 0]} rotation-y={-Math.PI / 2}><mesh geometry={sidePanel} material={m.deep} /></group>
      {/* shoulder under the glass */}
      <mesh material={base.chrome} position={[0, BODY_TOP - 0.038, 0]}><boxGeometry args={[CM.w + 0.012, 0.007, CM.d + 0.012]} /></mesh>
    </group>
  );
}

function GlassBox() {
  const m = clawMaterials(), base = materials();
  const h = BOX_TOP - BODY_TOP, cy = BODY_TOP + h / 2, e = CM.w / 2 - 0.018;
  const floor = useMemo(() => {
    // Pit floor with the prize hole, as a panel laid flat (panel Y becomes -Z).
    const g = panel({ x0: -IN, y0: -IN, x1: IN, y1: IN }, 0.01, [{ rect: { x0: HOLE.x0, y0: -HOLE.z1, x1: HOLE.x1, y1: -HOLE.z0 }, radius: 0.004 }], 0.02);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  const panes: [number, number, number, number][] = [   // x, z, rotY, width
    [0, e, 0, CM.w - 0.04], [0, -e, Math.PI, CM.w - 0.04], [e, 0, Math.PI / 2, CM.d - 0.04], [-e, 0, -Math.PI / 2, CM.d - 0.04],
  ];
  return (
    <group>
      <mesh geometry={floor} material={m.felt} position={[0, FLOOR_Y - 0.02, 0]} receiveShadow />
      <mesh material={base.cavity} position={[(HOLE.x0 + HOLE.x1) / 2, FLOOR_Y - 0.019, (HOLE.z0 + HOLE.z1) / 2]} rotation-x={-Math.PI / 2}><planeGeometry args={[HOLE.x1 - HOLE.x0, HOLE.z1 - HOLE.z0]} /></mesh>
      <mesh material={m.backdrop} position={[0, cy, -e + 0.004]}><planeGeometry args={[CM.w - 0.05, h]} /></mesh>
      <mesh material={m.backdrop} position={[-e + 0.004, cy, 0]} rotation-y={Math.PI / 2}><planeGeometry args={[CM.d - 0.05, h]} /></mesh>
      {/* chute guard: two low acrylic walls on the hole's inner sides, with a sticker */}
      <mesh material={m.acrylic} position={[HOLE.x1, FLOOR_Y + HOLE.guard / 2, (HOLE.z0 + HOLE.z1) / 2]} rotation-y={Math.PI / 2} renderOrder={2}><planeGeometry args={[HOLE.z1 - HOLE.z0, HOLE.guard]} /></mesh>
      <mesh material={m.acrylic} position={[(HOLE.x0 + HOLE.x1) / 2, FLOOR_Y + HOLE.guard / 2, HOLE.z0]} renderOrder={2}><planeGeometry args={[HOLE.x1 - HOLE.x0, HOLE.guard]} /></mesh>
      <mesh material={m.sticker} position={[HOLE.x1 + 0.002, FLOOR_Y + HOLE.guard * 0.55, (HOLE.z0 + HOLE.z1) / 2]} rotation-y={Math.PI / 2}><planeGeometry args={[0.13, 0.036]} /></mesh>
      <mesh material={base.chrome} position={[HOLE.x1, FLOOR_Y + HOLE.guard, (HOLE.z0 + HOLE.z1) / 2]}><boxGeometry args={[0.006, 0.006, HOLE.z1 - HOLE.z0]} /></mesh>
      <mesh material={base.chrome} position={[(HOLE.x0 + HOLE.x1) / 2, FLOOR_Y + HOLE.guard, HOLE.z0]}><boxGeometry args={[HOLE.x1 - HOLE.x0, 0.006, 0.006]} /></mesh>
      {/* glass panes, seated in black rubber gaskets top and bottom */}
      {panes.map(([x, z, ry, w], i) => (
        <group key={i} position={[x, cy, z]} rotation-y={ry}>
          <mesh material={base.acrylicTint} renderOrder={3}><planeGeometry args={[w, h]} /></mesh>
          <mesh material={base.glassReflect} position={[0, 0, 0.002]} renderOrder={4}><planeGeometry args={[w, h]} /></mesh>
          {i !== 1 && <GlassSheen w={w} h={h} position={[0, 0, 0.003]} opacity={i === 0 ? 0.2 : 0.13} />}
          <mesh material={base.rubber} position={[0, -h / 2 + 0.008, 0]}><boxGeometry args={[w, 0.016, 0.012]} /></mesh>
          <mesh material={base.rubber} position={[0, h / 2 - 0.008, 0]}><boxGeometry args={[w, 0.016, 0.012]} /></mesh>
        </group>
      ))}
      {/* thick chrome corner posts with their rubber glazing strips */}
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
        <group key={i} position={[sx * (CM.w / 2 - 0.018), cy, sz * (CM.d / 2 - 0.018)]}>
          <RoundedBox args={[0.042, h, 0.042]} radius={0.012} smoothness={3} material={base.chrome} castShadow />
          <mesh material={base.rubber} position={[-sx * 0.024, 0, 0]}><boxGeometry args={[0.008, h, 0.016]} /></mesh>
          <mesh material={base.rubber} position={[0, 0, -sz * 0.024]}><boxGeometry args={[0.016, h, 0.008]} /></mesh>
        </group>
      ))}
      {/* aluminium rails round the top and bottom of the case */}
      {[BODY_TOP + 0.012, BOX_TOP - 0.008].flatMap((y) => [-1, 1].flatMap((k) => [
        <mesh key={`x${y}${k}`} material={base.steel} position={[0, y, k * (CM.d / 2 - 0.008)]}><boxGeometry args={[CM.w + 0.002, 0.024, 0.018]} /></mesh>,
        <mesh key={`z${y}${k}`} material={base.steel} position={[k * (CM.w / 2 - 0.008), y, 0]}><boxGeometry args={[0.018, 0.024, CM.d + 0.002]} /></mesh>,
      ]))}
      <Interior />
      <mesh material={base.steel} position={[-IN, GANTRY_Y + 0.02, 0]}><boxGeometry args={[0.014, 0.014, 2 * IN]} /></mesh>
      <mesh material={base.steel} position={[IN, GANTRY_Y + 0.02, 0]}><boxGeometry args={[0.014, 0.014, 2 * IN]} /></mesh>
    </group>
  );
}

/** The case lights itself: LED bars along the head and in the rear corners, spots in the ceiling. */
function Interior() {
  const base = materials();
  const y = BOX_TOP - 0.03, e = IN + 0.002;
  const spot = useMemo(() => new THREE.CircleGeometry(0.009, 16).rotateX(Math.PI / 2), []);
  const spots = useMemo(() => [-0.27, -0.09, 0.09, 0.27].flatMap((x) => [-0.2, 0.05, 0.28].map((z) => [x, BOX_TOP - 0.031, z] as [number, number, number])), []);
  const lit = useMemo(() => new THREE.MeshBasicMaterial({ color: '#FFFBEA', toneMapped: false }), []);
  return (
    <group>
      <mesh material={base.cavity} position={[0, BOX_TOP - 0.03, 0]} rotation-x={Math.PI / 2}><planeGeometry args={[2 * IN + 0.04, 2 * IN + 0.04]} /></mesh>
      <Instances points={spots} geometry={spot} material={lit} />
      <LedBar size={[2 * IN - 0.04, 0.009, 0.012]} position={[0, y - 0.006, e - 0.012]} spread={0.05} />
      <LedBar size={[0.009, 0.5, 0.009]} position={[-e + 0.012, 1.34, -e + 0.016]} spread={0.016} />
      <LedBar size={[0.009, 0.5, 0.009]} position={[e - 0.012, 1.34, -e + 0.016]} spread={0.016} />
      {/* the yellow lip round the prize floor */}
      {([[0, -IN + 0.006, 2 * IN, 0.012], [IN - 0.006, 0, 0.012, 2 * IN]] as const).map(([x, z, w, d], i) => <mesh key={i} material={clawMaterials().trim} position={[x, FLOOR_Y + 0.004, z]}><boxGeometry args={[w, 0.012, d]} /></mesh>)}
    </group>
  );
}

/** Marquee box with the sign and a ring of bulbs in chrome sockets (two banks, so they can chase). */
export function Marquee({ banks }: { banks: MutableRefObject<THREE.Group[]> }) {
  const m = clawMaterials(), base = materials();
  const h = CM.h - BOX_TOP, cy = BOX_TOP + h / 2, sw = CM.w - 0.1, sh = h - 0.07;
  const bulbs = useMemo(() => {
    const out: [number, number][] = [];
    const n = 12;
    for (let i = 0; i < n; i++) { const x = -sw / 2 + (sw * i) / (n - 1); out.push([x, cy + sh / 2 + 0.018], [x, cy - sh / 2 - 0.018]); }
    return out;
  }, [cy, sh, sw]);
  const bulbGeo = useMemo(() => new THREE.SphereGeometry(0.0115, 14, 10), []);
  const socketGeo = useMemo(() => new THREE.TorusGeometry(0.0135, 0.003, 8, 20), []);
  const haloGeo = useMemo(() => new THREE.PlaneGeometry(0.06, 0.06), []);
  const haloPts = useMemo(() => bulbs.map(([x, y]) => [x, y, FRONT_Z + 0.0135] as [number, number, number]), [bulbs]);
  const signFrame = useMemo(() => frame({ x0: -sw / 2, y0: cy - sh / 2, x1: sw / 2, y1: cy + sh / 2 }, 0.008, 0.006, 0.008), [cy, sh, sw]);
  return (
    <group>
      <RoundedBox args={[CM.w + 0.014, h, CM.d + 0.014]} radius={0.024} smoothness={4} position={[0, cy, 0]} material={m.body} castShadow />
      <RoundedBox args={[CM.w + 0.03, 0.014, CM.d + 0.03]} radius={0.006} smoothness={3} position={[0, BOX_TOP + 0.005, 0]} material={base.chrome} />
      <RoundedBox args={[CM.w + 0.03, 0.014, CM.d + 0.03]} radius={0.006} smoothness={3} position={[0, CM.h - 0.005, 0]} material={base.chrome} />
      {/* the same sign on its side, lit */}
      <mesh material={m.sign} position={[CM.w / 2 + 0.0085, cy, 0]} rotation-y={Math.PI / 2}><planeGeometry args={[CM.d - 0.1, sh]} /></mesh>
      <mesh material={base.glassReflect} position={[CM.w / 2 + 0.0095, cy, 0]} rotation-y={Math.PI / 2} renderOrder={4}><planeGeometry args={[CM.d - 0.1, sh]} /></mesh>
      <mesh material={m.sign} position={[0, cy, FRONT_Z + 0.0085]}><planeGeometry args={[sw, sh]} /></mesh>
      <mesh material={base.glassReflect} position={[0, cy, FRONT_Z + 0.0095]} renderOrder={4}><planeGeometry args={[sw, sh]} /></mesh>
      <mesh geometry={signFrame} material={base.chrome} position={[0, 0, FRONT_Z + 0.007]} />
      {bulbs.map(([x, y], i) => <mesh key={i} geometry={socketGeo} material={base.chrome} position={[x, y, FRONT_Z + 0.009]} />)}
      {[0, 1].map((bank) => (
        <group key={bank} ref={(g) => { if (g) banks.current[bank] = g; }}>
          {bulbs.filter((_, i) => Math.floor(i / 2) % 2 === bank).map(([x, y], i) => <mesh key={i} geometry={bulbGeo} material={m.bulbOn} position={[x, y, FRONT_Z + 0.012]} />)}
        </group>
      ))}
      <Instances points={haloPts} geometry={haloGeo} material={m.bulbHalo} />
    </group>
  );
}

/** Control ledge: printed top, the ball-top joystick (drag it) and the DROP button (press it). */
export function ControlPanel({ stickRef, buttonRef }: { stickRef: Ref<THREE.Group>; buttonRef: Ref<THREE.Group> }) {
  const m = clawMaterials(), base = materials();
  const z = FRONT_Z + PANEL.depth / 2 - 0.01, top = PANEL.y + PANEL.h / 2;
  return (
    <group>
      <RoundedBox args={[CM.w - 0.04, PANEL.h, PANEL.depth]} radius={0.015} smoothness={3} position={[0, PANEL.y, z]} material={m.trim} castShadow receiveShadow />
      <mesh material={base.chrome} position={[0, PANEL.y - PANEL.h / 2 + 0.004, z + PANEL.depth / 2 - 0.002]}><boxGeometry args={[CM.w - 0.07, 0.006, 0.006]} /></mesh>
      <mesh material={m.print} position={[0, top + 0.0008, z]} rotation-x={-Math.PI / 2}><planeGeometry args={[0.76, 0.1]} /></mesh>
      <group position={[0, top + 0.001, z]} rotation-x={-Math.PI / 2}><Bolts points={[[-0.385, 0.05], [0.385, 0.05], [-0.385, -0.05], [0.385, -0.05]]} r={0.0042} /></group>
      <mesh material={m.label} position={[0, PANEL.y, z + PANEL.depth / 2 + 0.0008]}><planeGeometry args={[0.76, 0.068]} /></mesh>
      <group position={[-0.12, top, z]} userData={{ cstick: true }}>
        <mesh material={base.chrome} position={[0, 0.003, 0]}><cylinderGeometry args={[0.03, 0.032, 0.006, 32]} /></mesh>
        <mesh material={base.rubber} position={[0, 0.012, 0]}><cylinderGeometry args={[0.008, 0.02, 0.014, 20]} /></mesh>
        <group ref={stickRef}>
          <mesh material={base.chrome} position={[0, 0.038, 0]}><cylinderGeometry args={[0.005, 0.006, 0.07, 12]} /></mesh>
          <mesh material={m.stickBall} position={[0, 0.077, 0]} castShadow><sphereGeometry args={[0.022, 28, 18]} /></mesh>
        </group>
        <mesh material={m.proxy} position={[0, 0.06, 0]}><sphereGeometry args={[0.05, 12, 8]} /></mesh>
      </group>
      <group position={[0.12, top, z]} userData={{ cbutton: true }}>
        <mesh material={base.chrome} position={[0, 0.004, 0]}><cylinderGeometry args={[0.036, 0.038, 0.008, 36]} /></mesh>
        <mesh material={m.glow} position={[0, 0.009, 0]} rotation-x={Math.PI / 2}><torusGeometry args={[0.031, 0.0035, 10, 40]} /></mesh>
        <group ref={buttonRef}>
          <mesh material={m.red} position={[0, 0.01, 0]} scale={[1, 0.5, 1]} castShadow><sphereGeometry args={[0.027, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
        </group>
        <mesh material={m.proxy} position={[0, 0.015, 0]}><cylinderGeometry args={[0.05, 0.05, 0.04, 16]} /></mesh>
      </group>
    </group>
  );
}

/** Pulsing outline round the prize door (the claw shows it while a prize waits). */
export function DoorGlow({ glowRef }: { glowRef: Ref<THREE.Mesh> }) {
  const geo = useMemo(() => frame(expand({ x0: DOOR.x0, y0: DOOR.y0, x1: DOOR.x1, y1: DOOR.y1 }, 0.014), 0.026, 0.01, 0.001, 0), []);
  return <mesh ref={glowRef} geometry={geo} material={clawMaterials().doorGlow} position={[0, 0, FRONT_Z + 0.012]} renderOrder={5} visible={false} />;
}

export function DoorVisual() {
  const base = materials(), m = clawMaterials();
  const w = DOOR.x1 - DOOR.x0 - 0.008, h = DOOR.y1 - DOOR.y0 - 0.008;
  return (
    <group userData={{ cdoor: true }}>
      <RoundedBox args={[w, h, DOOR.thickness]} radius={0.0015} smoothness={2} position={[0, -h / 2, 0]} material={base.smoke} renderOrder={2} />
      <mesh material={m.prize} position={[0, -h / 2, DOOR.thickness / 2 + 0.0005]} renderOrder={3}><planeGeometry args={[0.12, 0.06]} /></mesh>
    </group>
  );
}

export function ClawVisual(props: { stickRef: Ref<THREE.Group>; buttonRef: Ref<THREE.Group>; bulbsRef: MutableRefObject<THREE.Group[]> }) {
  return (
    <group>
      <LowerCabinet />
      <GlassBox />
      <Marquee banks={props.bulbsRef} />
      <ControlPanel stickRef={props.stickRef} buttonRef={props.buttonRef} />
    </group>
  );
}

const shaftFloor = (() => {
  const [z0, y0] = SHAFT.bottomBack, [z1, y1] = SHAFT.bottomFront;
  const dz = z1 - z0, dy = y1 - y0, length = Math.hypot(dz, dy), angle = -Math.atan2(dy, dz), T = 0.006;
  return { length, angle, center: [(HOLE.x0 + HOLE.x1) / 2, (y0 + y1) / 2 - Math.cos(angle) * T, (z0 + z1) / 2 - Math.sin(angle) * T] as [number, number, number], T };
})();

/** Fixed colliders: pit floor around the hole, glass, chute guard, the shaft and its slope. */
export function ClawColliders({ x }: { x: number }) {
  const T = 0.01, h = BOX_TOP - FLOOR_Y, hx = (HOLE.x1 - HOLE.x0) / 2, hz = (HOLE.z1 - HOLE.z0) / 2, hcx = (HOLE.x0 + HOLE.x1) / 2, hcz = (HOLE.z0 + HOLE.z1) / 2;
  const shaftTop = FLOOR_Y, shaftBot = 0.2, sh = (shaftTop - shaftBot) / 2, scy = (shaftTop + shaftBot) / 2;
  return (
    <RigidBody type="fixed" colliders={false} position={[x, 0, 0]} collisionGroups={PG.static}>
      {/* floor: everything except the hole (an L of two slabs) */}
      <CuboidCollider args={[IN, T, (HOLE.z0 + IN) / 2]} position={[0, FLOOR_Y - T, (HOLE.z0 - IN) / 2]} />
      <CuboidCollider args={[(IN - HOLE.x1) / 2, T, hz]} position={[(HOLE.x1 + IN) / 2, FLOOR_Y - T, hcz]} />
      {/* glass */}
      <CuboidCollider args={[IN, h / 2, T]} position={[0, FLOOR_Y + h / 2, IN + T]} />
      <CuboidCollider args={[IN, h / 2, T]} position={[0, FLOOR_Y + h / 2, -IN - T]} />
      <CuboidCollider args={[T, h / 2, IN]} position={[IN + T, FLOOR_Y + h / 2, 0]} />
      <CuboidCollider args={[T, h / 2, IN]} position={[-IN - T, FLOOR_Y + h / 2, 0]} />
      <CuboidCollider args={[IN, T, IN]} position={[0, GANTRY_Y - 0.02, 0]} />
      {/* chute guard */}
      <CuboidCollider args={[0.003, HOLE.guard / 2, hz]} position={[HOLE.x1, FLOOR_Y + HOLE.guard / 2, hcz]} />
      <CuboidCollider args={[hx, HOLE.guard / 2, 0.003]} position={[hcx, FLOOR_Y + HOLE.guard / 2, HOLE.z0]} />
      {/* shaft walls, sloped floor and the wall above the door */}
      <CuboidCollider args={[T, sh, hz]} position={[HOLE.x0 - T, scy, hcz]} />
      <CuboidCollider args={[T, sh, hz]} position={[HOLE.x1 + T, scy, hcz]} />
      <CuboidCollider args={[hx, sh, T]} position={[hcx, scy, HOLE.z0 - T]} />
      <CuboidCollider args={[hx, (shaftTop - DOOR.y1) / 2, T]} position={[hcx, (shaftTop + DOOR.y1) / 2, FRONT_Z - 0.005]} />
      <CuboidCollider args={[hx, shaftFloor.T, shaftFloor.length / 2]} position={shaftFloor.center} rotation={[shaftFloor.angle, 0, 0]} />
    </RigidBody>
  );
}
