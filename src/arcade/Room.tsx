// The room the arcade stands in, one of two looks on the same floor and wall.
// Light: the ticket's sunburst over cream and yellow tiles, an inked line where the wall meets the floor.
// Dark: after hours, a purple tiled floor with pink joints, and neon tubes along the wall that stutter on
// one at a time after the lights go out.
//
// Both are unlit by the studio's reflections on purpose (Lambert ignores them): what lights them is a fixed
// glow plus the key light, so the emissive level alone sets how dark a shadow falls.
// RoomLight is the key light and how bright the reflections are, which go with the look.
// MachineGround is what each machine carries with it: a soft dark footprint that sits it on the floor
// wherever the scroll takes it, and the colour its lights spill in front.
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { canvas, finish } from '../gacha/textures';
import { neonHum } from '../gacha/sound';
import { intro } from './intro';
import { FOOTPRINT } from './layout';
import type { MachineId } from './store';
import { theme, useTheme } from './theme';

// The floor runs past the camera: on a narrow window it backs off a long way (heroEye in layout.ts).
const WALL_Z = -3.2, FRONT_Z = 34, HALF_W = 26, WALL_H = 13;
const TILE = 2;                         // the checker's repeat, m
const SHADOW_LIFT = { light: 0.5, dark: 0.9 };   // the glow: what a shadow bottoms out at (lower is darker)
const KEY = { light: { intensity: 2.4, color: '#fffaf2', reflections: 1 }, dark: { intensity: 1.15, color: '#C9B8FF', reflections: 0.62 } };
const FLASH = 0.7, FLASH_DECAY = 3.5;   // the light coming back on overshoots, then settles
const SPILL: Record<MachineId, string> = { claw: '#FF6FA8', gacha: '#FFF3C4', vending: '#FFEFC2' };
const SPILL_DARK: Record<MachineId, string> = { claw: '#FF4F8B', gacha: '#FFC800', vending: '#7AF5FF' };
const TUBES = [{ y: 2.5, color: '#FF6FA8' }, { y: 2.3, color: '#FFC800' }, { y: 2.1, color: '#7AF5FF' }];
const TUBE_DELAY = 0.45, TUBE_STAGGER = 0.24;    // s after the lights go out
const STUTTER = [1, 0, 0.7, 0, 0, 1, 0.25, 1, 0, 1];   // a tube striking, one step per STUTTER_S
const STUTTER_S = 0.05;

function checker(a: string, b: string, line: string) {
  const [c, g] = canvas(256, 256);
  g.fillStyle = a; g.fillRect(0, 0, 256, 256);
  g.fillStyle = b; g.fillRect(0, 0, 128, 128); g.fillRect(128, 128, 128, 128);
  g.strokeStyle = line; g.lineWidth = 3;
  [[0, 0], [128, 128], [128, 0], [0, 128]].forEach(([x, y]) => g.strokeRect(x, y, 128, 128));
  const t = finish(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set((HALF_W * 2) / TILE, (FRONT_Z - WALL_Z) / TILE); t.anisotropy = 16;
  return t;
}

/** The ticket's rays, 26 m wide and 13 m high, with a halftone rising from the floor. */
function sunburstWall() {
  const [c, g] = canvas(2048, 1024);
  g.fillStyle = '#F6C034'; g.fillRect(0, 0, 2048, 1024);
  const cx = 1054, cy = 1002;
  g.fillStyle = '#FFD65A';
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2, b = a + Math.PI / 40;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * 2400, cy + Math.sin(a) * 2400); g.lineTo(cx + Math.cos(b) * 2400, cy + Math.sin(b) * 2400); g.fill();
  }
  g.fillStyle = '#EDA52F';
  for (let y = 1024; y > 880; y -= 7) for (let x = y % 14 ? 0 : 3.5; x < 2048; x += 7) {
    const r = 2.6 * (y - 880) / 144;
    if (r > 0.3) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
  }
  g.fillStyle = '#141414'; g.fillRect(0, 1024 - 3.5, 2048, 3.5);
  const t = finish(c); t.anisotropy = 16;
  return t;
}

/** Dark panels and a skirting board, at the same scale. The light on it comes from the tubes. */
function nightWall() {
  const [c, g] = canvas(2048, 1024);
  g.fillStyle = '#1D1638'; g.fillRect(0, 0, 2048, 1024);
  g.fillStyle = '#211A40';
  for (let x = 0; x < 2048; x += 94) g.fillRect(x, 0, 47, 1024);
  g.fillStyle = '#0F0B20'; g.fillRect(0, 1024 - 11, 2048, 11);
  const t = finish(c); t.anisotropy = 16;
  return t;
}

/** A soft vertical bar, brightest along its middle: a tube and the glow round it. */
function tubeGlow() {
  const [c, g] = canvas(4, 256);
  const fade = g.createLinearGradient(0, 0, 0, 256);
  [[0, 0], [0.4, 0.07], [0.47, 0.3], [0.495, 1], [0.505, 1], [0.53, 0.3], [0.6, 0.07], [1, 0]].forEach(([at, a]) => fade.addColorStop(at, `rgba(255,255,255,${a})`));
  g.fillStyle = fade; g.fillRect(0, 0, 4, 256);
  return finish(c);
}

/** The tubes' light lying on the floor, fading away from the wall. */
function floorGlow() {
  const [c, g] = canvas(4, 256);
  const fade = g.createLinearGradient(0, 0, 0, 256);
  fade.addColorStop(0, 'rgba(255,255,255,.32)'); fade.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = fade; g.fillRect(0, 0, 4, 256);
  return finish(c);
}

const glowing = (map: THREE.Texture, color: string) => new THREE.MeshBasicMaterial({ map, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });

export default function Room() {
  const mode = useTheme((s) => s.mode);
  const gl = useThree((s) => s.gl);
  const look = useMemo(() => {
    const surface = () => new THREE.MeshLambertMaterial({ color: '#fff', emissive: '#fff' });
    const tube = tubeGlow(), spill = floorGlow();
    return {
      floor: surface(), wall: surface(),
      maps: {
        light: { floor: checker('#F2C744', '#FFEDB3', 'rgba(150,90,0,.28)'), wall: sunburstWall() },
        dark: { floor: checker('#2A2150', '#352A63', 'rgba(255,111,168,.35)'), wall: nightWall() },
      },
      tubes: TUBES.map((t) => glowing(tube, t.color)),
      spill: glowing(spill, '#FF9FD0'),
    };
  }, []);

  // Sent to the card up front, so the first switch has nothing to upload.
  useEffect(() => { Object.values(look.maps).forEach((m) => { gl.initTexture(m.floor); gl.initTexture(m.wall); }); }, [gl, look]);

  useLayoutEffect(() => {
    const m = look.maps[mode];
    look.floor.map = look.floor.emissiveMap = m.floor;
    look.wall.map = look.wall.emissiveMap = m.wall;
    look.floor.emissiveIntensity = look.wall.emissiveIntensity = SHADOW_LIFT[mode];
  }, [look, mode]);

  // Each tube strikes on its own: dark from the switch (or the loader opening), then the stutter, then on.
  const struck = useRef<number | null>(null);
  useEffect(() => {
    const strike = () => { struck.current = performance.now() / 1000; neonHum(); };
    if (mode !== 'dark') { struck.current = null; return undefined; }
    if (intro.get().phase === 'dropping' || intro.get().phase === 'done') { strike(); return undefined; }
    return intro.subscribe(() => { if (struck.current === null && intro.get().phase === 'dropping') strike(); });
  }, [mode]);
  useFrame(() => {
    if (struck.current === null) return;
    const t = performance.now() / 1000 - struck.current;
    let lit = 0;
    look.tubes.forEach((m, i) => {
      const step = Math.floor((t - TUBE_DELAY - i * TUBE_STAGGER) / STUTTER_S);
      m.opacity = step < 0 ? 0 : step < STUTTER.length ? STUTTER[step] : 1;
      lit += m.opacity;
    });
    look.spill.opacity = lit / TUBES.length;
  });

  return (
    <group>
      <mesh material={look.floor} rotation-x={-Math.PI / 2} position={[0, 0, (FRONT_Z + WALL_Z) / 2]} receiveShadow><planeGeometry args={[HALF_W * 2, FRONT_Z - WALL_Z]} /></mesh>
      <mesh material={look.wall} position={[0, WALL_H / 2, WALL_Z]} receiveShadow><planeGeometry args={[HALF_W * 2, WALL_H]} /></mesh>
      <group visible={mode === 'dark'}>
        {TUBES.map((t, i) => <mesh key={t.y} material={look.tubes[i]} position={[0, t.y, WALL_Z + 0.01 * (i + 1)]} scale={[HALF_W * 2, 1, 1]} renderOrder={1}><planeGeometry /></mesh>)}
        <mesh material={look.spill} rotation-x={-Math.PI / 2} position={[0, 0.002, WALL_Z + 2]} scale={[HALF_W * 2, 4, 1]} renderOrder={1}><planeGeometry /></mesh>
      </group>
    </group>
  );
}

/** The key light, from high on the left and in front: shadows fall short and back, and stay on the floor. */
export function RoomLight() {
  const mode = useTheme((s) => s.mode);
  const scene = useThree((s) => s.scene);
  const key = useRef<THREE.DirectionalLight>(null);
  const on = useRef(-1e9);
  useEffect(() => theme.subscribe(() => { if (theme.get().mode === 'light') on.current = performance.now() / 1000; }), []);
  useFrame(() => {
    const k = KEY[mode];
    scene.environmentIntensity = k.reflections;
    if (!key.current) return;
    key.current.color.set(k.color);
    const since = performance.now() / 1000 - on.current;
    key.current.intensity = k.intensity * (mode === 'light' ? 1 + FLASH * Math.exp(-since * FLASH_DECAY) : 1);
  });
  return (
    <directionalLight
      ref={key} position={[-1.6, 7.5, 3.6]} castShadow
      shadow-mapSize={[2048, 2048]} shadow-bias={-0.0002} shadow-normalBias={0.012}
      shadow-camera-left={-5} shadow-camera-right={5} shadow-camera-top={4.2} shadow-camera-bottom={-4.2} shadow-camera-far={16}
    />
  );
}

let footTex: THREE.CanvasTexture | null = null, spillTex: THREE.CanvasTexture | null = null;

/** A soft-edged dark rectangle: the machine's footprint. */
function foot() {
  if (footTex) return footTex;
  const [c, ctx] = canvas(256, 256);
  // Drawn off the canvas, so only its blurred shadow lands on it.
  ctx.shadowColor = '#2a1a00'; ctx.shadowBlur = 42; ctx.shadowOffsetX = 512;
  ctx.fillStyle = '#000'; ctx.beginPath(); ctx.roundRect(52 - 512, 52, 152, 152, 18); ctx.fill();
  return (footTex = finish(c));
}

function spill() {
  if (spillTex) return spillTex;
  const [c, ctx] = canvas(256, 256);
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,.4)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  return (spillTex = finish(c));
}

const FOOT_OPACITY = 0.8, SPILL_OPACITY = { light: 0.2, dark: 0.34 };
export type Ground = { lift: (height: number) => void };

/** Lies on the floor under a machine, however high it is: it fades and spreads as the machine rises. */
export const MachineGround = forwardRef<Ground, { machine: MachineId }>(function MachineGround({ machine }, ref) {
  const [w, d] = FOOTPRINT[machine];
  const mode = useTheme((s) => s.mode);
  const height = useRef(0);
  const { shade, glow } = useMemo(() => ({
    shade: new THREE.MeshBasicMaterial({ map: foot(), transparent: true, depthWrite: false, opacity: FOOT_OPACITY }),
    glow: new THREE.MeshBasicMaterial({ map: spill(), color: SPILL[machine], transparent: true, depthWrite: false }),
  }), [machine]);
  const place = useRef(() => {});
  place.current = () => {
    const k = Math.max(0, 1 - height.current / 1.4);
    shade.opacity = FOOT_OPACITY * k * k;
    glow.opacity = SPILL_OPACITY[mode] * k;
    glow.color.set(mode === 'dark' ? SPILL_DARK[machine] : SPILL[machine]);
  };
  useImperativeHandle(ref, () => ({ lift(h) { height.current = h; place.current(); } }), []);
  useEffect(() => place.current(), [mode]);
  return (
    <group rotation-x={-Math.PI / 2}>
      <mesh material={shade} position={[0, 0, 0.003]} scale={[w * 1.7, d * 1.7, 1]} renderOrder={1}><planeGeometry /></mesh>
      <mesh material={glow} position={[0, -d / 2 - 0.42, 0.004]} scale={[w * 1.9, 1.1, 1]} renderOrder={1}><planeGeometry /></mesh>
    </group>
  );
});
