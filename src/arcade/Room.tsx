// The room the arcade stands in: a photo studio's seamless sweep, one surface that runs along the floor,
// curves up and becomes the back wall. Same yellow as ever, but now with a floor, a far wall and a pool of
// light, so the eye has something to measure the machines against.
//
// It is unlit by the studio's reflections on purpose (Lambert ignores them): what lights it is a fixed
// glow plus the key light, so the emissive level alone sets how dark a shadow falls.
// MachineGround is what each machine carries with it: a soft dark footprint that sits it on the floor
// wherever the scroll takes it, and the colour its lights spill in front.
import { forwardRef, useImperativeHandle, useMemo } from 'react';
import * as THREE from 'three';
import { canvas, finish } from '../gacha/textures';
import { FOOTPRINT } from './layout';
import type { MachineId } from './store';

const WALL_Z = -3.2, COVE = 1.9;        // where the wall stands, and how wide the curve up to it is
const FRONT_Z = 13, TOP = 13, HALF_W = 26;
const YELLOW = '#F2C744';
const SHADOW_LIFT = 0.5;                // the glow: what a shadow bottoms out at (lower is darker)
const POOL_EDGE = 0.66;                 // how far the light falls off away from the machines
const WALL_SHADE = 0.3;                 // how much deeper the wall is than the floor: that step is the horizon
const SPILL: Record<MachineId, string> = { claw: '#FF6FA8', gacha: '#FFF3C4', vending: '#FFEFC2' };

/** Floor, curve, wall: a strip of quads across X, following the profile from the front to the top. */
function sweep() {
  const profile: [number, number][] = [[FRONT_Z, 0], [WALL_Z + COVE, 0]];
  for (let i = 1; i <= 24; i++) {
    const a = (i / 24) * (Math.PI / 2);
    profile.push([WALL_Z + COVE - Math.sin(a) * COVE, COVE - Math.cos(a) * COVE]);
  }
  profile.push([WALL_Z, TOP]);
  let length = 0;
  const along = profile.map((p, i) => (i ? (length += Math.hypot(p[0] - profile[i - 1][0], p[1] - profile[i - 1][1])) : 0));
  const position: number[] = [], uv: number[] = [], index: number[] = [];
  profile.forEach(([z, y], i) => {
    position.push(-HALF_W, y, z, HALF_W, y, z);
    uv.push(0, along[i] / length, 1, along[i] / length);
    if (i) { const k = i * 2; index.push(k - 2, k - 1, k, k, k - 1, k + 1); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  const floorEnd = (FRONT_Z - WALL_Z - COVE) / length;
  return { geometry: g, machinesAt: (FRONT_Z - 0.5) / length, curve: [floorEnd, floorEnd + (COVE * 1.75) / length] as const };
}

/** The pool of light, as a map over the sweep: bright where the machines stand, falling away. */
function pool(machinesAt: number, [curveStart, curveEnd]: readonly [number, number]) {
  const [c, ctx] = canvas(1024, 512);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1024, 512);
  ctx.save();
  ctx.translate(512, (1 - machinesAt) * 512); ctx.scale(1, 0.62);
  const g = ctx.createRadialGradient(0, 0, 60, 0, 0, 620);
  const edge = Math.round(255 * POOL_EDGE);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, `rgb(${edge},${edge},${edge})`);
  ctx.fillStyle = g; ctx.fillRect(-1600, -1600, 3200, 3200);
  ctx.restore();
  const wall = ctx.createLinearGradient(0, (1 - curveStart) * 512, 0, (1 - curveEnd) * 512);
  wall.addColorStop(0, 'rgba(160,84,0,0)'); wall.addColorStop(1, `rgba(160,84,0,${WALL_SHADE})`);
  ctx.fillStyle = wall; ctx.fillRect(0, 0, 1024, (1 - curveStart) * 512);
  return finish(c);
}

export default function Room() {
  const { geometry, material } = useMemo(() => {
    const s = sweep(), map = pool(s.machinesAt, s.curve);
    return {
      geometry: s.geometry,
      material: new THREE.MeshLambertMaterial({ color: YELLOW, map, emissive: YELLOW, emissiveMap: map, emissiveIntensity: SHADOW_LIFT }),
    };
  }, []);
  return <mesh geometry={geometry} material={material} receiveShadow />;
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

const FOOT_OPACITY = 0.8, SPILL_OPACITY = 0.2;
export type Ground = { lift: (height: number) => void };

/** Lies on the floor under a machine, however high it is: it fades and spreads as the machine rises. */
export const MachineGround = forwardRef<Ground, { machine: MachineId }>(function MachineGround({ machine }, ref) {
  const [w, d] = FOOTPRINT[machine];
  const { shade, glow } = useMemo(() => ({
    shade: new THREE.MeshBasicMaterial({ map: foot(), transparent: true, depthWrite: false, opacity: FOOT_OPACITY }),
    glow: new THREE.MeshBasicMaterial({ map: spill(), color: SPILL[machine], transparent: true, depthWrite: false, opacity: SPILL_OPACITY }),
  }), [machine]);
  useImperativeHandle(ref, () => ({
    lift(height) {
      const k = Math.max(0, 1 - height / 1.4);
      shade.opacity = FOOT_OPACITY * k * k;
      glow.opacity = SPILL_OPACITY * k;
    },
  }), [shade, glow]);
  return (
    <group rotation-x={-Math.PI / 2}>
      <mesh material={shade} position={[0, 0, 0.003]} scale={[w * 1.7, d * 1.7, 1]} renderOrder={1}><planeGeometry /></mesh>
      <mesh material={glow} position={[0, -d / 2 - 0.42, 0.004]} scale={[w * 1.9, 1.1, 1]} renderOrder={1}><planeGeometry /></mesh>
    </group>
  );
});
