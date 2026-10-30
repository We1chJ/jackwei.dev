// Dust kicked up when something heavy lands: soft grey puffs that billow out along the floor from
// under a machine's footprint, swell, rise a little and fade. One Points object over a fixed pool,
// like the sparkles.
import { useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';

const N = 260;
const life = new Float32Array(N), maxLife = new Float32Array(N), vel = new Float32Array(N * 3);
const pos = new Float32Array(N * 3), size = new Float32Array(N), alpha = new Float32Array(N), grow = new Float32Array(N);
let next = 0;

export const dust = {
  /** A ring of puffs out from under a w x d footprint centred on (x, z), scaled by `strength` (0..1). */
  puff(x: number, z: number, w: number, d: number, strength = 1) {
    const n = Math.round(70 * strength);
    for (let k = 0; k < n; k++) {
      // A point on the footprint's edge, pushed outward from the centre.
      const a = Math.random() * Math.PI * 2, ex = Math.cos(a), ez = Math.sin(a);
      const r = 1 / Math.max(Math.abs(ex) / (w / 2), Math.abs(ez) / (d / 2));
      const i = next; next = (next + 1) % N;
      const sp = (0.5 + Math.random() * 0.9) * strength;
      pos.set([x + ex * r, 0.01 + Math.random() * 0.03, z + ez * r], i * 3);
      vel.set([ex * sp, 0.05 + Math.random() * 0.18, ez * sp], i * 3);
      size[i] = 0.12 + Math.random() * 0.12; grow[i] = 1.2 + Math.random() * 1.2;
      life[i] = maxLife[i] = 0.8 + Math.random() * 0.7;
    }
  },
};

const vertex = /* glsl */ `
  attribute float aSize; attribute float aAlpha;
  uniform float uPx;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPx / -mv.z;
    vAlpha = aAlpha;
  }`;
const fragment = /* glsl */ `
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = pow(smoothstep(0.5, 0.0, d), 1.6) * vAlpha;
    gl_FragColor = vec4(vec3(0.86, 0.8, 0.68), a);
  }`;

export default function Dust() {
  const { size: view, viewport, camera } = useThree();
  const { geometry, material } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, uniforms: { uPx: { value: 1 } }, transparent: true, depthWrite: false });
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
      // Air drag stops the billow quickly; the puff keeps swelling as it thins out.
      for (let k = 0; k < 3; k++) { vel[i * 3 + k] *= 1 - 4.5 * dt; pos[i * 3 + k] += vel[i * 3 + k] * dt; }
      size[i] *= 1 + grow[i] * dt;
      alpha[i] = 0.2 * Math.min(1, t * 6) * (1 - t) * (1 - t);
    }
    if (!any && !geometry.userData.dirty) return;
    geometry.userData.dirty = any;
    for (const name of ['position', 'aSize', 'aAlpha']) geometry.getAttribute(name).needsUpdate = true;
  });

  return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={9} />;
}
