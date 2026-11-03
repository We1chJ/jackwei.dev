// Yellow Jack plushie: fleece blob body (sheen fabric with a fine fuzz normal map), mismatched
// googly eyes, open mouth, sprout and stub arms. Soft: each one is a small core with six satellites
// round it on springs (Rapier spring joints), so a finger pressing on it sinks in, it squashes under
// the claw head, and it drapes a little where it hangs. The looks are drawn round the core, pulled
// toward wherever the satellites have gone, so the fleece shows the give; fingers also dent it
// (vertex shader). It has no bounce and plenty of drag. One of them (SHINY) is the gold one.
// The bodies are one component each; all the looks are drawn together, instanced per part.
import { forwardRef, useRef, useMemo, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { BallCollider, RigidBody, RoundCuboidCollider, interactionGroups, useSpringJoint, type CollisionEnterPayload, type RapierRigidBody } from '@react-three/rapier';
import { orangePeelNormal } from '../gacha/textures';
import { ItemInstances, place, type Bend, type Part } from '../arcade/instances';

export const PG = {
  static: interactionGroups(6, [7, 8]),
  plush: interactionGroups(7, [6, 7, 8]),
  finger: interactionGroups(8, [6, 7]),     // the claw head and fingers
};
// The core, and the satellites round it: where they sit at rest (the plushie's frame), their size,
// and the springs that hold them there (N/m, N*s/m: a finger's newton sinks one in about a centimetre).
export const PLUSH = { hx: 0.012, hy: 0.009, hz: 0.007, r: 0.024 };   // core: half extents + rounding
export const SAT_R = 0.021, SAT_K = 110, SAT_C = 1.6;
export const SATS: [number, number, number][] = [[0.03, 0, 0], [-0.03, 0, 0], [0, 0, 0.027], [0, 0, -0.027], [0, 0.029, 0], [0, -0.027, 0]];
export const PLUSH_TOP = 0.05;
export const SHINY = 7;

export const PLUSH_COLORS = ['#F6F3EA', '#F6F3EA', '#FFB3CF', '#A9DBFF', '#B8F2D6', '#FFE58A'];
const plushColor = (i: number) => PLUSH_COLORS[i % PLUSH_COLORS.length];

// Where every plushie's satellites are, for the fabric: a row per plushie, a texel for its centre
// then, per satellite, the direction it rests in and how far from rest it has gone (all world).
// Claw.tsx fills it in every frame.
export const SOFT_W = 1 + SATS.length * 2;
export function softTexture(count: number) {
  const data = new Float32Array(SOFT_W * count * 4);
  const tex = new THREE.DataTexture(data, SOFT_W, count, THREE.RGBAFormat, THREE.FloatType);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return { tex, data, set(i: number, texel: number, x: number, y: number, z: number) { const o = (i * SOFT_W + texel) * 4; data[o] = x; data[o + 1] = y; data[o + 2] = z; } };
}
export const soft = { value: null as THREE.DataTexture | null };

// Fingers press real dents: the fabric's vertex shader pushes the surface in toward the plushie's centre
// wherever a finger has gone below it, so the finger sits in a hollow instead of showing through.
// Three fingers of two segments each, in the same space as the bodies; Claw.tsx keeps them current.
const DENT_POINTS = 9, DENT_WIDTH = 0.034, FINGER_R = 0.008;
export const dents = {
  line: { value: Array.from({ length: DENT_POINTS }, () => new THREE.Vector3(0, -9, 0)) },
  at: { value: new THREE.Vector3(0, -9, 0) },
};
const DENT_VERTEX = /* glsl */ `
  uniform vec3 uFinger[${DENT_POINTS}];
  uniform vec3 uFingerAt;
  uniform sampler2D uSoft;
  attribute float aItem;
  varying float vDent;
`;
const DENT_PROJECT = /* glsl */ `
  vec4 mvPosition = vec4(transformed, 1.0);
  mvPosition = instanceMatrix * mvPosition;
  vDent = 0.0;
  // The give: the surface follows the satellites, each pulling its side of the plushie with it.
  {
    int item = int(aItem + 0.5);
    vec3 c = texelFetch(uSoft, ivec2(0, item), 0).xyz;
    vec3 rel = mvPosition.xyz - c;
    float r = length(rel);
    vec3 dir = rel / max(r, 1e-5);
    vec3 push = vec3(0.0);
    for (int k = 0; k < ${SATS.length}; k++) {
      vec3 n = texelFetch(uSoft, ivec2(1 + 2 * k, item), 0).xyz;
      vec3 d = texelFetch(uSoft, ivec2(2 + 2 * k, item), 0).xyz;
      push += d * smoothstep(0.25, 1.0, dot(dir, n));
    }
    mvPosition.xyz += push * clamp(r / 0.035, 0.0, 1.0);
  }
  if (distance(mvPosition.xyz, uFingerAt) < 0.22) {
    vec3 c = instanceMatrix[3].xyz, out0 = mvPosition.xyz - c;
    float r = length(out0), deepest = r, give = 0.0;
    vec3 dir = out0 / r;
    for (int f = 0; f < 3; f++) for (int j = 0; j < 2; j++) {
      vec3 a = uFinger[f * 3 + j], ab = uFinger[f * 3 + j + 1] - a;
      vec3 q = a + ab * clamp(dot(c + dir * r - a, ab) / dot(ab, ab), 0.0, 1.0);    // nearest on the finger
      float depth = length(q - c);                                                  // how far out it is
      float near = smoothstep(${DENT_WIDTH.toFixed(3)}, 0.0, length(dir * depth - (q - c)));
      float reach = min(r, depth - ${FINGER_R.toFixed(3)});
      if (reach < r) { deepest = min(deepest, mix(r, reach, near)); give = max(give, near * (r - reach)); }
    }
    mvPosition.xyz = c + dir * deepest;
    vDent = clamp(give / 0.016, 0.0, 1.0);
  }
  mvPosition = modelViewMatrix * mvPosition;
  gl_Position = projectionMatrix * mvPosition;
`;
function dentable(m: THREE.MeshPhysicalMaterial) {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uFinger = dents.line;
    shader.uniforms.uFingerAt = dents.at;
    shader.uniforms.uSoft = soft;
    shader.vertexShader = DENT_VERTEX + shader.vertexShader.replace('#include <project_vertex>', DENT_PROJECT);
    shader.fragmentShader = 'varying float vDent;\n' + shader.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= 1.0 - 0.3 * vDent;');   // a hollow is darker
  };
  return m;
}

let mats: ReturnType<typeof build> | null = null;
function build() {
  const fuzz = orangePeelNormal(); fuzz.repeat.set(3, 3);
  return {
    fabric: dentable(new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.95, sheen: 1, sheenRoughness: 0.42, sheenColor: new THREE.Color('#ffffff'), normalMap: fuzz, normalScale: new THREE.Vector2(0.5, 0.5) })),
    gold: dentable(new THREE.MeshPhysicalMaterial({ color: '#F2C14A', metalness: 0.85, roughness: 0.3, clearcoat: 0.4, normalMap: fuzz, normalScale: new THREE.Vector2(0.25, 0.25) })),
    seam: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 }),
    eyeWhite: new THREE.MeshPhysicalMaterial({ color: '#FFFFFF', roughness: 0.15, clearcoat: 1 }),
    pupil: new THREE.MeshPhysicalMaterial({ color: '#0B0B0D', roughness: 0.1, clearcoat: 1 }),
    mouth: new THREE.MeshStandardMaterial({ color: '#B8325A', roughness: 0.9 }),
    teeth: new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.8 }),
    leaf: new THREE.MeshPhysicalMaterial({ color: '#57C24A', roughness: 0.9, sheen: 1, sheenColor: new THREE.Color('#B8FFAA') }),
    tag: new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.85, side: THREE.DoubleSide }),
  };
}

const seamGeo = new THREE.TorusGeometry(1, 0.035, 6, 48);
const tagGeo = new THREE.PlaneGeometry(0.012, 0.019);
const sphere = new THREE.SphereGeometry(1, 32, 24);
const smallSphere = new THREE.SphereGeometry(1, 16, 12);
const stem = new THREE.CylinderGeometry(0.0035, 0.0045, 0.024, 8);

/** One satellite: a ball on a spring to its place on the core. Its contacts with the core are off. */
function Satellite({ core, offset, at, onBody }: { core: MutableRefObject<RapierRigidBody | null>; offset: [number, number, number]; at: [number, number, number]; onBody: (b: RapierRigidBody | null) => void }) {
  const body = useRef<RapierRigidBody | null>(null);
  const joint = useSpringJoint(core, body, [offset, [0, 0, 0], 0, SAT_K, SAT_C]);
  const done = useRef(false);
  useFrame(() => { if (!done.current && joint.current) { joint.current.setContactsEnabled(false); done.current = true; } });
  return (
    <RigidBody ref={(b) => { body.current = b; onBody(b); }} colliders={false} position={[at[0] + offset[0], at[1] + offset[1], at[2] + offset[2]]} lockRotations friction={0.9} restitution={0} linearDamping={1.2} collisionGroups={PG.plush}>
      <BallCollider args={[SAT_R]} mass={0.012} />
    </RigidBody>
  );
}

type Props = {
  index: number; position: [number, number, number]; rotation: [number, number, number];
  onHit?: (index: number, p: CollisionEnterPayload) => void;
  /** Called with each satellite's body as it mounts. */
  onSatellite: (index: number, k: number, b: RapierRigidBody | null) => void;
};

/** One plushie's body: the core and its satellites. Its looks are drawn by Plushies, below. */
export const PlushBody = forwardRef<RapierRigidBody, Props>(function PlushBody({ index, position, rotation, onHit, onSatellite }, ref) {
  const core = useRef<RapierRigidBody | null>(null);
  return (
    <>
      <RigidBody
        ref={(b) => { core.current = b; if (typeof ref === 'function') ref(b); else if (ref) (ref as MutableRefObject<RapierRigidBody | null>).current = b; }}
        colliders={false} position={position} rotation={rotation}
        friction={0.8} restitution={0} linearDamping={0.5} angularDamping={1.4} ccd
        collisionGroups={PG.plush} onCollisionEnter={(p) => onHit?.(index, p)}
      >
        <RoundCuboidCollider args={[PLUSH.hx, PLUSH.hy, PLUSH.hz, PLUSH.r]} mass={0.02} />
      </RigidBody>
      {SATS.map((o, k) => <Satellite key={k} core={core} offset={o} at={position} onBody={(b) => onSatellite(index, k, b)} />)}
    </>
  );
});

type AllProps = {
  count: number;
  bodies: MutableRefObject<(RapierRigidBody | null)[]>;
  scales: MutableRefObject<THREE.Vector3[]>;
  bends: MutableRefObject<Bend[]>;
  meshesRef: MutableRefObject<THREE.InstancedMesh[]>;
};

/** Every plushie, a draw per part. */
export function Plushies({ count, bodies, scales, bends, meshesRef }: AllProps) {
  const parts = useMemo((): Part[] => {
    const m = (mats ??= build());
    const all = Array.from({ length: count }, (_, i) => i);
    const fleece = all.filter((i) => i !== SHINY), shiny = all.filter((i) => i === SHINY);
    const bodyColors = all.map(plushColor);
    const seamColors = all.map((i) => new THREE.Color(plushColor(i)).multiplyScalar(0.82));
    const faceColors = all.map((i) => new THREE.Color(plushColor(i)).lerp(new THREE.Color('#FFFDF6'), 0.55));
    const blush = all.map(() => '#FF9BB0');
    // Fleece parts come in the fabric for most and gold for the shiny one.
    const fur = (geometry: THREE.BufferGeometry, at: THREE.Matrix4, castShadow = false): Part[] => [
      { geometry, material: m.fabric, at, items: fleece, colors: bodyColors, castShadow, receiveShadow: castShadow },
      { geometry, material: m.gold, at, items: shiny, castShadow, receiveShadow: castShadow },
    ];
    return [
      ...fur(sphere, place([0, 0, 0], [0, 0, 0], [0.053, 0.049, 0.045]), true),
      // side seam where front and back panels are sewn, and the care tag sticking out of it
      { geometry: seamGeo, material: m.seam, at: place([0, 0, 0], [0, Math.PI / 2, 0], [0.045, 0.049, 0.053]), items: fleece, colors: seamColors },
      { geometry: tagGeo, material: m.tag, at: place([0.054, -0.024, -0.004], [0, Math.PI / 2, 0.35]), items: fleece },
      // stub arms, and feet poking out under the front
      ...fur(smallSphere, place([-0.049, -0.014, 0.006], [0, 0, 0], [0.012, 0.016, 0.012])),
      ...fur(smallSphere, place([0.049, -0.014, 0.006], [0, 0, 0], [0.012, 0.016, 0.012])),
      ...fur(smallSphere, place([-0.021, -0.044, 0.022], [0.3, 0, 0], [0.015, 0.009, 0.02])),
      ...fur(smallSphere, place([0.021, -0.044, 0.022], [0.3, 0, 0], [0.015, 0.009, 0.02])),
      // a lighter face panel, and blushed cheeks
      { geometry: smallSphere, material: m.fabric, at: place([0, -0.003, 0.011], [0, 0, 0], [0.04, 0.037, 0.036]), items: fleece, colors: faceColors },
      { geometry: smallSphere, material: m.seam, at: place([-0.031, -0.005, 0.036], [0, -0.6, 0], [0.007, 0.0045, 0.002]), items: fleece, colors: blush },
      { geometry: smallSphere, material: m.seam, at: place([0.032, -0.003, 0.035], [0, 0.6, 0], [0.007, 0.0045, 0.002]), items: fleece, colors: blush },
      // googly eyes: small left, big right, like the mascot
      { geometry: smallSphere, material: m.eyeWhite, at: place([-0.018, 0.012, 0.038], [0, 0, 0], [0.0135, 0.0135, 0.008]) },
      { geometry: smallSphere, material: m.pupil, at: place([-0.016, 0.011, 0.045], [0, 0, 0], [0.0058, 0.0058, 0.003]) },
      { geometry: smallSphere, material: m.eyeWhite, at: place([0.016, 0.015, 0.037], [0, 0, 0], [0.018, 0.018, 0.009]) },
      { geometry: smallSphere, material: m.pupil, at: place([0.019, 0.013, 0.045], [0, 0, 0], [0.0075, 0.0075, 0.003]) },
      // shocked open mouth
      { geometry: smallSphere, material: m.mouth, at: place([0.002, -0.017, 0.04], [0, 0, 0], [0.012, 0.011, 0.006]) },
      { geometry: smallSphere, material: m.teeth, at: place([0.002, -0.009, 0.043], [0, 0, 0], [0.008, 0.0025, 0.002]) },
      // sprout
      { geometry: stem, material: m.leaf, at: place([0.002, 0.058, 0], [0, 0, -0.12]) },
      { geometry: smallSphere, material: m.leaf, at: place([-0.008, 0.07, 0], [0, 0, 0.55], [0.012, 0.004, 0.007]) },
      { geometry: smallSphere, material: m.leaf, at: place([0.013, 0.071, 0], [0, 0, -0.5], [0.012, 0.004, 0.007]) },
    ];
  }, [count]);
  return <ItemInstances count={count} bodies={bodies} scales={scales} bends={bends} parts={parts} meshesRef={meshesRef} />;
}
