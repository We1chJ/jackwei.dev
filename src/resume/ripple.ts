// The ripple from the dots into the clip, built on React Bits' RippleDistortion (its wave and
// displacement shaders, on ogl). That component reacts to the cursor and shows one image; here the two
// flying dots lay the ripples, bending a still of the arcade behind them, and when they land two big
// ripples fan out from the orbs and carry the clip's first frame in behind their fronts.
//
// The canvas stays transparent wherever the water is calm, so the live page shows through. Everything
// settles to perfectly flat by the end: it finishes as exactly the first frame, drawn with the same
// cover fit as the reel's own canvas, so swapping to that canvas is invisible.
// createRipple returns null when WebGL is unavailable (the caller crossfades instead).
import { Geometry, Mesh, Program, Renderer, RenderTarget, Texture, Triangle } from 'ogl';

const MAX_WAVES = 100;
const FIELD_SCALE = 0.4;       // displacement buffer size, as a share of the screen
const START_SCALE = 1.5;
const SPREAD = 5;              // how many times its size a ripple grows to
const FADE = 1.6;              // seconds a ripple lives
const SPACING = 15;            // px of dot travel between ripples
const LIFE = Math.log(500);
const HOLD = 0.05;             // share of the fan-out the orbs rest on their landing spot
const BURSTS = [0, 0.1, 0.22]; // when each orb throws a ripple, as shares of the fan-out
const SETTLE_FROM = 0.68;      // from here on the water calms down to perfectly flat

const WAVE_VERT = `
precision highp float;
attribute vec2 position;
attribute vec2 uv;
attribute vec2 iOffset;
attribute vec2 iScale;
attribute float iOpacity;
varying vec2 vUv;
varying float vOpacity;
void main() {
  vUv = uv;
  vOpacity = iOpacity;
  gl_Position = vec4(iOffset + position * iScale, 0.0, 1.0);
}`;

const WAVE_FRAG = `
precision highp float;
varying vec2 vUv;
varying float vOpacity;
const float PI = 3.141592653589793;
const float EDGE = 0.006737947;
const float RINGS = 3.0;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = dot(p, p);
  if (r > 1.0) discard;
  float brush = (exp(-r * 5.0) - EDGE) / (1.0 - EDGE);
  brush *= 0.55 + 0.45 * cos(sqrt(r) * PI * 2.0 * RINGS);
  gl_FragColor = vec4(vec3(brush * vOpacity * vOpacity), 1.0);
}`;

const SCREEN_VERT = `
precision highp float;
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const COMPOSITE_FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uArcade, uFrame, uDisplacement;
uniform vec2 uRes, uImg, uTexel;     // css px, frame px, one displacement texel
uniform vec2 uC0, uC1, uR;           // orb centres and front radii, css px from the top left
uniform float uFan;                  // 0 while the dots fly, 1 once the fronts run
uniform float uCalm;                 // 1 until the water settles, then down to exactly 0
uniform float uShot;                 // 1 once there is a still of the arcade to bend
const float TAU = 6.283185307179586;
const float STRENGTH = 0.15, SWIRL = 1.0, DISPERSION = 0.35, GLINT = 0.4, DIM = 0.62;
const vec3 SCRIM = vec3(12.0, 11.0, 14.0) / 255.0;   // .reel-scrim

float smin(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }

vec3 bent(sampler2D t, vec2 uv, vec2 push) {
  float split = DISPERSION * 0.25;
  return vec3(texture2D(t, uv + push * (1.0 + split)).r, texture2D(t, uv + push).g, texture2D(t, uv + push * (1.0 - split)).b);
}

void main() {
  vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uRes;
  float amount = texture2D(uDisplacement, vUv).r;

  // the fronts: signed distance to the two rings in screen heights, negative behind them, with a
  // swell on the front and smaller ones following it in
  float reveal = 0.0, crest = 0.0;
  if (uFan > 0.5) {
    float f = smin(length(px - uC0) - uR.x, length(px - uC1) - uR.y, 0.08 * uRes.y) / uRes.y;
    float w = 0.05 + 0.05 * clamp(max(uR.x, uR.y) / uRes.y, 0.0, 1.0);
    crest = exp(-f * f / (w * w));
    float behind = f < 0.0 ? exp(f / 0.3) * (0.5 + 0.5 * cos(f * 42.0)) : 0.0;
    amount += crest * 0.62 + behind * 0.34;
    reveal = smoothstep(0.012, -0.012, f - crest * 0.008);
  }
  amount *= uCalm;

  float theta = amount * SWIRL * TAU;
  vec2 push = vec2(sin(theta) * uRes.y / uRes.x, cos(theta)) * amount * STRENGTH;

  vec2 here = px / uRes;
  float sc = max(uRes.x / uImg.x, uRes.y / uImg.y);
  vec2 cover = (px - (uRes - uImg * sc) * 0.5) / (uImg * sc);
  vec3 color = mix(mix(bent(uArcade, here, push), SCRIM, DIM), bent(uFrame, cover, push), reveal);

  // sheen on the shoulders of the ripples
  float ex = texture2D(uDisplacement, vUv + vec2(uTexel.x, 0.0)).r - texture2D(uDisplacement, vUv - vec2(uTexel.x, 0.0)).r;
  float ey = texture2D(uDisplacement, vUv + vec2(0.0, uTexel.y)).r - texture2D(uDisplacement, vUv - vec2(0.0, uTexel.y)).r;
  vec3 light = normalize(vec3(-0.35, 0.55, 1.0));
  float flatSpec = pow(light.z, 22.0);
  float raw = pow(max(dot(normalize(vec3(-ex * 26.0, -ey * 26.0, 1.0)), light), 0.0), 22.0);
  color += vec3(clamp((raw - flatSpec) / (1.0 - flatSpec), 0.0, 1.0) * GLINT * smoothstep(0.04, 0.3, amount) + crest * 0.1) * uCalm;

  float alpha = max(reveal, smoothstep(0.0, 0.07, amount) * uShot);
  gl_FragColor = vec4(color * alpha, alpha);
}`;

interface Wave { x: number; y: number; scale: number; target: number; size: number; opacity: number }
export interface Orb { x: number; y: number; r: number } // css px

export interface Ripple {
  /** The still of the arcade the dots bend. */
  arcade(shot: HTMLCanvasElement): void;
  /** Dot `i` is at x, y (css px from the top left) with radius r: lays a ripple once it has moved enough. */
  trail(i: number, x: number, y: number, r: number): void;
  /** The fronts run out from both orbs and the frame comes in behind them. */
  fan(orbs: [Orb, Orb], ms: number, onFirstFrame: () => void): Promise<void>;
  dispose(): void;
}

export function createRipple(canvas: HTMLCanvasElement, frame: ImageBitmap, dpr: number): Ripple | null {
  let renderer: Renderer;
  try {
    renderer = new Renderer({ canvas, alpha: true, premultipliedAlpha: true, antialias: false, dpr, depth: false });
  } catch { return null; }
  const gl = renderer.gl;
  if (!gl) return null;
  gl.clearColor(0, 0, 0, 0);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE); // the frame exactly as the 2D canvas gets it

  const still = { generateMipmaps: false, flipY: false, minFilter: gl.LINEAR, magFilter: gl.LINEAR, wrapS: gl.CLAMP_TO_EDGE, wrapT: gl.CLAMP_TO_EDGE };
  const frameTexture = new Texture(gl, { ...still, image: frame as unknown as HTMLCanvasElement }); // ogl's types omit ImageBitmap
  frameTexture.update();   // now, so the landing does not stall on it
  const arcadeTexture = new Texture(gl, still);

  const offsets = new Float32Array(MAX_WAVES * 2), scales = new Float32Array(MAX_WAVES * 2), opacities = new Float32Array(MAX_WAVES);
  const waves: Wave[] = Array.from({ length: MAX_WAVES }, () => ({ x: 0, y: 0, scale: START_SCALE, target: START_SCALE, size: 1, opacity: 0 }));
  let current = 0;
  const geometry = new Geometry(gl, {
    position: { size: 2, data: new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]) },
    uv: { size: 2, data: new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]) },
    iOffset: { instanced: 1, size: 2, data: offsets },
    iScale: { instanced: 1, size: 2, data: scales },
    iOpacity: { instanced: 1, size: 1, data: opacities },
  });
  const waveProgram = new Program(gl, { vertex: WAVE_VERT, fragment: WAVE_FRAG, transparent: true, depthTest: false, depthWrite: false, cullFace: false });
  waveProgram.setBlendFunc(gl.ONE, gl.ONE);
  const waveMesh = new Mesh(gl, { geometry, program: waveProgram, frustumCulled: false });

  const W = innerWidth, H = innerHeight;
  renderer.setSize(W, H);
  const fieldW = Math.max(2, Math.round(W * FIELD_SCALE)), fieldH = Math.max(2, Math.round(H * FIELD_SCALE));
  const field = new RenderTarget(gl, { width: fieldW, height: fieldH, depth: false, minFilter: gl.LINEAR, magFilter: gl.LINEAR, wrapS: gl.CLAMP_TO_EDGE, wrapT: gl.CLAMP_TO_EDGE });

  const u = {
    uArcade: { value: arcadeTexture }, uFrame: { value: frameTexture }, uDisplacement: { value: field.texture },
    uRes: { value: [W, H] }, uImg: { value: [frame.width, frame.height] }, uTexel: { value: [1 / fieldW, 1 / fieldH] },
    uC0: { value: [0, 0] }, uC1: { value: [0, 0] }, uR: { value: [0, 0] },
    uFan: { value: 0 }, uCalm: { value: 1 }, uShot: { value: 0 },
  };
  const screen = new Mesh(gl, {
    geometry: new Triangle(gl),
    program: new Program(gl, { vertex: SCREEN_VERT, fragment: COMPOSITE_FRAG, uniforms: u, depthTest: false, depthWrite: false }),
  });

  const lay = (x: number, y: number, size: number, power: number) => {
    const w = waves[current];
    current = (current + 1) % MAX_WAVES;
    w.x = x; w.y = H - y; w.size = size; w.opacity = 1;
    w.scale = START_SCALE * power; w.target = START_SCALE * SPREAD * power;
  };

  const laid: ({ x: number; y: number } | null)[] = [null, null];
  let fan: { t0: number; ms: number; orbs: [Orb, Orb]; far: [number, number]; thrown: number; first: (() => void) | null; done: () => void } | null = null;
  let raf = 0, last = 0;
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;

    if (fan) {
      const t = Math.min(1, (now - fan.t0) / fan.ms);
      const e = 1 - Math.pow(1 - Math.max(0, (t - HOLD) / (1 - HOLD)), 1.3);   // quick, then slowing
      u.uFan.value = 1;
      u.uR.value = [fan.orbs[0].r + (fan.far[0] - fan.orbs[0].r) * e, fan.orbs[1].r + (fan.far[1] - fan.orbs[1].r) * e];
      const k = Math.min(1, Math.max(0, (t - SETTLE_FROM) / (1 - SETTLE_FROM)));
      u.uCalm.value = 1 - k * k * (3 - 2 * k);
      while (fan.thrown < BURSTS.length && t >= BURSTS[fan.thrown]) {
        fan.thrown++;
        for (const o of fan.orbs) lay(o.x, o.y, Math.max(260, o.r * 6), 1.4);
      }
    }

    const growth = 1 - Math.exp(-dt * 1.09), decay = Math.exp((-dt * LIFE) / FADE);
    waves.forEach((w, i) => {
      if (w.opacity > 0) {
        w.opacity *= decay;
        w.scale += (w.target - w.scale) * growth;
        if (w.opacity < 0.002) w.opacity = 0;
      }
      opacities[i] = w.opacity;
      if (!w.opacity) return;
      const half = (w.scale * w.size) / 2;
      offsets[i * 2] = (w.x / W) * 2 - 1;
      offsets[i * 2 + 1] = (w.y / H) * 2 - 1;
      scales[i * 2] = (half / W) * 2;
      scales[i * 2 + 1] = (half / H) * 2;
    });
    geometry.attributes.iOffset.needsUpdate = true;
    geometry.attributes.iScale.needsUpdate = true;
    geometry.attributes.iOpacity.needsUpdate = true;

    renderer.render({ scene: waveMesh, target: field, clear: true });
    renderer.render({ scene: screen });

    if (fan?.first) { fan.first(); fan.first = null; }
    if (fan && now - fan.t0 >= fan.ms) { fan.done(); fan = null; }
  };
  raf = requestAnimationFrame(loop);

  return {
    arcade(shot) {
      arcadeTexture.image = shot;
      u.uShot.value = 1;
    },
    trail(i, x, y, r) {
      const p = laid[i];
      if (p && Math.abs(x - p.x) <= SPACING && Math.abs(y - p.y) <= SPACING) return;
      laid[i] = { x, y };
      lay(x, y, 90 + r * 3, 1);
    },
    fan(orbs, ms, onFirstFrame) {
      // each front runs past its farthest corner, so the screen is covered whatever the other does
      const far = (o: Orb) => Math.hypot(Math.max(o.x, W - o.x), Math.max(o.y, H - o.y)) * 1.1 + 0.06 * H;
      u.uC0.value = [orbs[0].x, orbs[0].y];
      u.uC1.value = [orbs[1].x, orbs[1].y];
      return new Promise((done) => {
        fan = { t0: performance.now(), ms, orbs, far: [far(orbs[0]), far(orbs[1])], thrown: 0, first: onFirstFrame, done };
      });
    },
    dispose() {
      cancelAnimationFrame(raf);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
