// Additive star glints for prize moments: a burst when something pops out, a trail while it
// flies, the odd twinkle on a held prize. One Points object over a fixed particle pool, so
// nothing is allocated or compiled mid-animation.
import { useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';

const N = 220;
type V = { x: number; y: number; z: number };

const life = new Float32Array(N), maxLife = new Float32Array(N), vel = new Float32Array(N * 3);
const pos = new Float32Array(N * 3), size = new Float32Array(N), alpha = new Float32Array(N), tint = new Float32Array(N);
let next = 0;

function spawn(p: V, v: V, s: number, l: number, warm: number) {
  const i = next; next = (next + 1) % N;
  pos.set([p.x, p.y, p.z], i * 3); vel.set([v.x, v.y, v.z], i * 3);
  size[i] = s; life[i] = maxLife[i] = l; tint[i] = warm;
}
const rand = (a: number) => (Math.random() * 2 - 1) * a;

export const sparkle = {
  /** Outward burst, e.g. a prize popping out of a door. */
  burst(p: V, count = 22, speed = 0.35) {
    for (let k = 0; k < count; k++) {
      const d = new THREE.Vector3(rand(1), rand(1) + 0.4, rand(1)).normalize().multiplyScalar(speed * (0.4 + Math.random()));
      spawn(p, d, 0.012 + Math.random() * 0.016, 0.5 + Math.random() * 0.5, Math.random());
    }
  },
  /** A few slow motes left behind something in flight. */
  trail(p: V, count = 2) {
    for (let k = 0; k < count; k++) spawn({ x: p.x + rand(0.02), y: p.y + rand(0.02), z: p.z + rand(0.02) }, { x: rand(0.04), y: 0.03 + rand(0.03), z: rand(0.04) }, 0.008 + Math.random() * 0.01, 0.45 + Math.random() * 0.35, Math.random());
  },
  /** One bright glint that flares and fades in place. */
  twinkle(p: V) { spawn(p, { x: 0, y: 0, z: 0 }, 0.03, 0.45, 0.2); },
};

const vertex = /* glsl */ `
  attribute float aSize; attribute float aAlpha; attribute float aTint;
  uniform float uPx;
  varying float vAlpha; varying float vTint;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPx / -mv.z;
    vAlpha = aAlpha; vTint = aTint;
  }`;
const fragment = /* glsl */ `
  varying float vAlpha; varying float vTint;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float core = exp(-d * d * 60.0);
    float rays = (exp(-abs(c.x) * 40.0) + exp(-abs(c.y) * 40.0)) * smoothstep(0.5, 0.0, d);
    float a = (core + rays * 0.55) * vAlpha;
    vec3 col = mix(vec3(1.0, 0.86, 0.5), vec3(1.0), core * (1.0 - vTint * 0.6));
    gl_FragColor = vec4(col * a, a);
  }`;

export default function Sparkles() {
  const { size: view, viewport, camera } = useThree();
  const { geometry, material } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aTint', new THREE.BufferAttribute(tint, 1).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.ShaderMaterial({
      vertexShader: vertex, fragmentShader: fragment, uniforms: { uPx: { value: 1 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    return { geometry: g, material: m };
  }, []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    const fov = (camera as THREE.PerspectiveCamera).fov ?? 26;
    material.uniforms.uPx.value = (view.height * viewport.dpr) / (2 * Math.tan((fov * Math.PI) / 360));
    let any = false;
    for (let i = 0; i < N; i++) {
      if (life[i] <= 0) { alpha[i] = 0; continue; }
      any = true;
      life[i] -= dt;
      const t = 1 - life[i] / maxLife[i];
      vel[i * 3 + 1] -= 0.25 * dt;                       // a little gravity
      for (let k = 0; k < 3; k++) { vel[i * 3 + k] *= 1 - 2.2 * dt; pos[i * 3 + k] += vel[i * 3 + k] * dt; }
      alpha[i] = Math.max(0, Math.sin(Math.PI * Math.min(1, t * 1.15)));   // flare in, fade out
    }
    if (!any && !geometry.userData.dirty) return;
    geometry.userData.dirty = any;
    for (const name of ['position', 'aSize', 'aAlpha', 'aTint']) geometry.getAttribute(name).needsUpdate = true;
  });

  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={10} />;
}
