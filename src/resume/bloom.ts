// The watercolor bloom from the two loading dots into the clip's first frame. A short-lived
// WebGL layer that only changes transparency: the frame appears inside two wet washes that
// spread out from where its blue and red orbs sit (which is where the dots have just landed),
// each with a wavy front (domain-warped noise), a soft grainy edge, and merging like liquid
// where they meet. At t = 1 it is exactly the first frame, drawn with the same cover fit as the
// reel's own canvas, so swapping to that canvas is invisible.
// Returns null when WebGL is unavailable (the caller crossfades instead).

const FADE_IN = 0.12; // share of the bloom spent fading the orbs in before the washes spread

const VERT = `attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform sampler2D uFrame;
uniform vec2 uRes, uImg;          // device px
uniform vec2 uC0, uC1;            // wash centres, device px from the top left
uniform vec2 uR, uR0;             // current and starting radii of the two washes, device px
uniform float uT, uTime;          // progress 0..1, seconds

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}
// smooth union: two washes that touch flow into one instead of creasing
float smin(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }

void main() {
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  float sc = max(uRes.x / uImg.x, uRes.y / uImg.y);
  vec3 frame = texture2D(uFrame, (px - (uRes - uImg * sc) * 0.5) / (uImg * sc)).rgb;

  vec2 q = px / uRes.y;                          // noise space: screen heights
  vec2 w = vec2(fbm(q * 3.0 + uTime * 0.15), fbm(q * 3.0 + 7.3 - uTime * 0.12));
  float lobeN = fbm(q * 1.5 + w * 1.8) - 0.5;
  float fringe = (fbm(q * 9.0 + w * 3.0) - 0.5) * 0.035;
  // each wash: round at its orb, growing big lobes and a feathery fringe as it spreads
  vec2 grow = smoothstep(uR0, uR0 * 3.0, uR);
  float f0 = (length(px - uC0) - uR.x) / uRes.y - (lobeN * (0.06 + 0.25 * uR.x / uRes.y) + fringe) * grow.x;
  float f1 = (length(px - uC1) - uR.y) / uRes.y - (lobeN * (0.06 + 0.25 * uR.y / uRes.y) + fringe) * grow.y;
  float f = smin(f0, f1, 0.06);                  // signed distance to the wet front, negative inside
  float g = max(grow.x, grow.y);

  float soft = mix(1.5 / uRes.y, 0.045, g);
  float a = smoothstep(soft, -soft * 0.5, f);
  // granulation: the edge of the wash dries unevenly
  a = clamp(a + (fbm(q * 40.0) - 0.5) * 0.4 * a * (1.0 - a) * 4.0 * g, 0.0, 1.0);
  a *= smoothstep(0.0, ${FADE_IN.toFixed(2)}, uT); // the orbs fade in over the dots
  gl_FragColor = vec4(frame * a, a);
}`;

export interface Wash { x: number; y: number; r: number } // device px

export interface BloomOpts {
  canvas: HTMLCanvasElement;
  frame: ImageBitmap;
  washes: [Wash, Wash];
  ms: number;
  onFirstFrame: () => void;
}

export function bloom(o: BloomOpts): Promise<void> | null {
  const gl = o.canvas.getContext('webgl', { premultipliedAlpha: true, antialias: false });
  if (!gl) return null;
  const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); // one triangle over the screen
  const pos = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(pos);
  gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

  // the frame exactly as the 2D canvas gets it: no colour conversion, no premultiply
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, o.frame);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const u = (name: string) => gl.getUniformLocation(prog, name);
  const { width: W, height: H } = o.canvas;
  const [a, b] = o.washes;
  gl.viewport(0, 0, W, H);
  gl.uniform2f(u('uRes'), W, H);
  gl.uniform2f(u('uImg'), o.frame.width, o.frame.height);
  gl.uniform2f(u('uC0'), a.x, a.y);
  gl.uniform2f(u('uC1'), b.x, b.y);
  gl.uniform2f(u('uR0'), a.r, b.r);
  // each wash alone grows far enough past its farthest corner for its lobes (up to ~0.13 x
  // radius inward) to clear it, so the screen is covered by the end whatever the other does
  const far = (c: Wash) => Math.hypot(Math.max(c.x, W - c.x), Math.max(c.y, H - c.y)) * 1.15 + 0.06 * H;
  const farA = far(a), farB = far(b);
  const uT = u('uT'), uR = u('uR'), uTime = u('uTime');

  return new Promise((done) => {
    const t0 = performance.now();
    let first = true;
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / o.ms);
      // first the orbs fade in over the dots at their size (FADE_IN), then the washes spread:
      // quickly at first, slowing as they soak in
      const e = 1 - Math.pow(1 - Math.max(0, (t - FADE_IN) / (1 - FADE_IN)), 1.3);
      gl.uniform1f(uT, t);
      gl.uniform2f(uR, a.r + (farA - a.r) * e, b.r + (farB - b.r) * e);
      gl.uniform1f(uTime, (now - t0) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (first) { first = false; o.onFirstFrame(); }
      if (t < 1) requestAnimationFrame(tick);
      else done();
    };
    requestAnimationFrame(tick);
  });
}
