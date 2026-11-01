// Performance panel for testing the site on other computers: open any page with #debug on the URL.
// Standalone and loaded only then (boot.tsx), so visitors never run it. It watches the page from the
// outside: its own animation loop for frame times, and the 3D canvas's WebGL context for draws, so the
// counts include the shadow and effect passes.

const SECONDS = 2;            // frame times are judged over this long
const SLOW_MS = 33.4;         // a frame slower than this is under 30 fps: a visible stutter
const DRAW_TRIANGLES = 4;     // gl.TRIANGLES
type GL = WebGL2RenderingContext | WebGLRenderingContext;

const counts = { calls: 0, tris: 0 };

/** Count every draw on this context, as it happens. */
function watch(gl: GL) {
  const g = gl as WebGL2RenderingContext;
  const tally = (mode: number, vertices: number, instances = 1) => {
    counts.calls++;
    if (mode === DRAW_TRIANGLES) counts.tris += (vertices / 3) * instances;
  };
  const wrap = <K extends 'drawArrays' | 'drawElements' | 'drawArraysInstanced' | 'drawElementsInstanced'>(name: K, read: (a: number[]) => void) => {
    const original = g[name] as (...a: number[]) => void;
    if (!original) return;
    (g[name] as unknown) = function patched(this: GL, ...a: number[]) { read(a); original.apply(this, a); };
  };
  wrap('drawArrays', (a) => tally(a[0], a[2]));
  wrap('drawElements', (a) => tally(a[0], a[1]));
  wrap('drawArraysInstanced', (a) => tally(a[0], a[2], a[3]));
  wrap('drawElementsInstanced', (a) => tally(a[0], a[1], a[4]));
}

/** The graphics chip's name, where the browser will say. */
function chip(gl: GL) {
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const name = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  return name.replace(/^ANGLE \((.*)\)$/, '$1').replace(/^.*Renderer: /, '').replace(/, Unspecified Version$/, '').replace(/ \(0x[0-9A-Fa-f]+\)/g, '');
}

const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
const short = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}k` : String(Math.round(n)));

export function startPerfPanel() {
  const box = document.createElement('pre');
  box.setAttribute('aria-hidden', 'true');
  box.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:100;margin:0;padding:10px 12px;max-width:min(380px,calc(100vw - 24px));white-space:pre-wrap;pointer-events:none;'
    + 'font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#EDEDED;background:rgba(12,12,14,.84);border-radius:8px;';
  document.body.append(box);

  let canvas: HTMLCanvasElement | null = null, gpu = '';
  const frames: { at: number; ms: number; calls: number; tris: number }[] = [];
  let last = performance.now(), nextPaint = 0, raf = 0;

  const find = () => {
    canvas = document.querySelector<HTMLCanvasElement>('.stage canvas');
    const gl = canvas?.getContext('webgl2') as GL | null | undefined;
    if (gl) { watch(gl); gpu = chip(gl); }
    else canvas = null;
  };

  const paint = (now: number) => {
    const ms = frames.map((f) => f.ms).sort((a, b) => a - b), n = ms.length;
    if (!n) return;
    const total = ms.reduce((a, b) => a + b, 0), fps = (n * 1000) / total, slow = ms.filter((m) => m > SLOW_MS).length;
    const worst = ms[n - 1];
    // Frames that refresh the shadows draw everything twice, so typical and peak both matter.
    const calls = frames.map((f) => f.calls).sort((a, b) => a - b), tris = frames.map((f) => f.tris).sort((a, b) => a - b);
    const dpr = canvas && canvas.clientWidth ? canvas.width / canvas.clientWidth : 0;
    const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
    const colour = fps >= 50 ? '#7BE495' : fps >= 30 ? '#FFD166' : '#FF7B7B';
    box.innerHTML = [
      `<b style="font-size:17px;color:${colour}">${fps.toFixed(0)} fps</b>`,
      `frame ${(total / n).toFixed(1)} ms  p95 ${pct(ms, 0.95).toFixed(1)}  worst ${worst.toFixed(0)}`,
      `slow frames ${slow} of ${n} (last ${SECONDS}s)`,
      `draws ${short(pct(calls, 0.5))}  peak ${short(calls[n - 1])}`,
      `triangles ${short(pct(tris, 0.5))}  peak ${short(tris[n - 1])}`,
      canvas ? `canvas ${canvas.width}x${canvas.height}  sharpness ${dpr.toFixed(2)}x of ${devicePixelRatio}x` : 'canvas not ready',
      heap ? `js memory ${(heap / 1048576).toFixed(0)} MB` : '',
      gpu ? `gpu ${gpu}` : '',
    ].filter(Boolean).join('\n');
    nextPaint = now + 250;
  };

  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    const ms = now - last;
    last = now;
    if (!canvas) find();
    if (ms < 1000) frames.push({ at: now, ms, calls: counts.calls, tris: counts.tris });   // longer: the tab was hidden
    counts.calls = counts.tris = 0;
    while (frames.length && now - frames[0].at > SECONDS * 1000) frames.shift();
    if (now >= nextPaint) paint(now);
  };
  raf = requestAnimationFrame(tick);

  return () => { cancelAnimationFrame(raf); box.remove(); };
}
