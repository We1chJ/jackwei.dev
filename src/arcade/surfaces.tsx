// Shared finishing parts for the machines: what makes a cabinet read as a real object rather than a
// coloured box. Glass streaks, lit LED bars with a soft halo, bolt heads, louvred vents and a fine
// roughness variation for painted metal. Everything repeated is instanced; the glows cost no lights.
import { useMemo } from 'react';
import * as THREE from 'three';
import { canvas, finish, rng } from '../gacha/textures';
import { materials } from '../gacha/materials';

type V3 = [number, number, number];

let streakTex: THREE.CanvasTexture | null = null, haloTex: THREE.CanvasTexture | null = null, smudgeTex: THREE.CanvasTexture | null = null;

/** Soft diagonal bands, as a window catches a room's light. */
function streaks() {
  if (streakTex) return streakTex;
  const [c, ctx] = canvas(512, 512);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 512, 512);
  ctx.translate(256, 256); ctx.rotate(0.42); ctx.translate(-256, -256);
  for (const [x, w, a] of [[-40, 120, 0.5], [120, 34, 0.32], [300, 170, 0.24], [520, 50, 0.3]] as const) {
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(x, -300, w, 1100);
  }
  return (streakTex = finish(c));
}

function halo() {
  if (haloTex) return haloTex;
  const [c, ctx] = canvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.34)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  return (haloTex = finish(c));
}

/** Fine variation in sheen: handling marks and dust, so large panels don't look computer-flat. */
export function smudgeRoughness() {
  if (smudgeTex) return smudgeTex;
  const [c, ctx] = canvas(512, 512), r = rng(41);
  ctx.fillStyle = '#b8b8b8'; ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 260; i++) {
    const x = r() * 512, y = r() * 512, s = 14 + r() * 90, v = r() > 0.5 ? 255 : 90;
    const g = ctx.createRadialGradient(x, y, 0, x, y, s);
    g.addColorStop(0, `rgba(${v},${v},${v},.09)`); g.addColorStop(1, `rgba(${v},${v},${v},0)`);
    ctx.fillStyle = g; ctx.fillRect(x - s, y - s, s * 2, s * 2);
  }
  const t = finish(c);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return (smudgeTex = t);
}

let streakMat: THREE.MeshBasicMaterial | null = null;
/** A pane's reflection: additive, drawn over whatever is behind the glass. */
export function GlassSheen({ w, h, position, rotation, opacity = 0.2 }: { w: number; h: number; position: V3; rotation?: V3; opacity?: number }) {
  const mat = useMemo(() => {
    streakMat ??= new THREE.MeshBasicMaterial({ map: streaks(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const m = streakMat.clone(); m.opacity = opacity;
    return m;
  }, [opacity]);
  return <mesh material={mat} position={position} rotation={rotation} renderOrder={5}><planeGeometry args={[w, h]} /></mesh>;
}

const ledMats = new Map<string, THREE.MeshBasicMaterial>(), glowMats = new Map<string, THREE.MeshBasicMaterial>();
const ledMat = (c: string) => { let m = ledMats.get(c); if (!m) { m = new THREE.MeshBasicMaterial({ color: c, toneMapped: false }); ledMats.set(c, m); } return m; };
const glowMat = (c: string) => {
  let m = glowMats.get(c);
  if (!m) { m = new THREE.MeshBasicMaterial({ map: halo(), color: c, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }); glowMats.set(c, m); }
  return m;
};

/** A lit bar with its halo. `size` is the bar's box; the halo spreads over `spread` around it. */
export function LedBar({ size, position, color = '#FFF6E4', spread = 0.06, rotation }: { size: V3; position: V3; color?: string; spread?: number; rotation?: V3 }) {
  const tall = size[1] > size[0];
  return (
    <group position={position} rotation={rotation}>
      <mesh material={ledMat(color)}><boxGeometry args={size} /></mesh>
      <mesh material={glowMat(color)} renderOrder={3}><planeGeometry args={tall ? [spread * 2, size[1] + spread * 2] : [size[0] + spread * 2, spread * 2]} /></mesh>
    </group>
  );
}

/** Many copies of one small part, as a single draw. */
export function Instances({ points, geometry, material, rotation }: { points: V3[]; geometry: THREE.BufferGeometry; material: THREE.Material; rotation?: V3 }) {
  const mesh = useMemo(() => {
    const im = new THREE.InstancedMesh(geometry, material, points.length), o = new THREE.Object3D();
    points.forEach((p, i) => { o.position.set(...p); if (rotation) o.rotation.set(...rotation); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    return im;
  }, [geometry, material, points, rotation]);
  return <primitive object={mesh} />;
}

const boltGeo = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 1, 0.55);
const FACING: V3 = [0, 0, 0];
/** Dome-headed bolts facing +Z (turn the group for other faces). */
export function Bolts({ points, r = 0.004 }: { points: [number, number][]; r?: number }) {
  const geo = useMemo(() => boltGeo.clone().scale(r, r, r), [r]);
  const pts = useMemo(() => points.map(([x, y]) => [x, y, 0] as V3), [points]);
  return <Instances points={pts} geometry={geo} material={materials().chrome} rotation={FACING} />;
}

/** A row of bolts between two points. */
export const boltRow = (x0: number, y0: number, x1: number, y1: number, n: number): [number, number][] =>
  Array.from({ length: n }, (_, i) => [x0 + ((x1 - x0) * i) / (n - 1), y0 + ((y1 - y0) * i) / (n - 1)]);

let slatMat: THREE.MeshStandardMaterial | null = null;
/** Louvred vent, facing +Z: dark slot with angled slats catching the light. */
export function Louvres({ w, h, rows, position, material }: { w: number; h: number; rows: number; position: V3; material?: THREE.Material }) {
  const base = materials();
  slatMat ??= new THREE.MeshStandardMaterial({ color: '#7D838B', metalness: 0.75, roughness: 0.5 });
  const step = h / rows;
  const geo = useMemo(() => new THREE.BoxGeometry(w, step * 0.72, 0.003).rotateX(-0.6), [w, step]);
  const pts = useMemo(() => Array.from({ length: rows }, (_, i) => [0, -h / 2 + step * (i + 0.5), 0.003] as V3), [rows, h, step]);
  return (
    <group position={position}>
      <mesh material={base.cavity}><planeGeometry args={[w + 0.004, h + 0.004]} /></mesh>
      <Instances points={pts} geometry={geo} material={material ?? slatMat} />
    </group>
  );
}
