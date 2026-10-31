// The résumé reel. The button dims the arcade and shows two dots orbiting each other (after
// TikTok's loader) while the clip downloads. When it is ready each dot flies to where the clip's
// first frame has its orb of the same colour, at that orb's size, dragging ripples through the arcade
// behind it, and two big ripples fan out from both and carry the frame in (ripple.ts). The clip then
// plays by itself; a small toggle (or just
// scrolling) pauses that and hands the clip to the scroll. On its final white frame the résumé
// rises to the front.
//
// The page itself never scrolls (the arcade is a fixed canvas), so wheel, touch and keys move a
// target frame and the shown frame eases toward it every display refresh. That turns notchy
// wheels and uneven trackpads into a glide.
import { useEffect, useRef, useState } from 'react';
import { Frames } from './frames';
import ResumePages, { type ZoomApi } from './ResumePages';
import { createRipple, type Ripple } from './ripple';
import { arcadeShot, loadReel, reel, useReel } from './store';
import { FPS, pickSize, smaller } from './stream';

type Phase = 'loading' | 'travel' | 'fan' | 'play' | 'resume' | 'closing';

const MIN_DOTS_MS = 1000;
const ORBIT = 17;          // px from the centre at full swing
const DOT = 11;            // dot radius while loading, px
const ORBIT_S = 0.9;       // seconds per turn
const TRAVEL_MS = 750;
const FAN_MS = 1800;
// The orbs in the clip's first frame, measured off it: centre as a fraction of the frame's width
// and height, radius as a fraction of its height, and the colour of the orb's saturated half.
// Each dot flies to its orb, so the clip appears around the dots.
const DOTS = [
  { from: [0xf2, 0x27, 0x3c], orb: { x: 0.5019, y: 0.8705, r: 0.0396 }, to: [0xe9, 0x79, 0x87] }, // red
  { from: [0x2e, 0x7b, 0xff], orb: { x: 0.5006, y: 0.154, r: 0.105 }, to: [0x38, 0x96, 0xec] },   // blue
];
const FRAME_ASPECT = 16 / 9;
const PX_PER_FRAME = 7;    // scroll distance per frame (the clip is 1390 frames)
const TOUCH_GAIN = 1.6;    // fingers travel less than wheels
const EASE_MS = 70;        // time constant of the shown frame chasing the target
const PDF = '/assets/ResumeOfficial.pdf';
const MIN_DECODE_FPS = 60; // the first frames read low (a machine at 90 here still draws every refresh)
const AUDIO = '/media/reel.m4a'; // the clip's own sound, cut from the source at the same point (see stream.ts)

const css = (c: number[]) => `rgb(${c.map(Math.round).join(' ')})`;
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
/** An orb's centre (CSS px from the window centre) and radius, with the frame covering the window. */
function orbOnScreen(o: { x: number; y: number; r: number }) {
  const sc = Math.max(innerWidth / FRAME_ASPECT, innerHeight); // displayed frame height
  return { x: (o.x - 0.5) * sc * FRAME_ASPECT, y: (o.y - 0.5) * sc, r: o.r * sc };
}
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

export default function Reel() {
  const open = useReel((s) => s.open);
  return open ? <Overlay /> : null;
}

function Overlay() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [moved, setMoved] = useState(false);
  const [auto, setAuto] = useState(true);          // the clip plays itself until paused
  const [zoom, setZoom] = useState(1);             // of the résumé page
  const zoomApi = useRef<ZoomApi | null>(null);
  const [beadDone, setBeadDone] = useState(false); // the ripple has taken over from the dots
  const [fade, setFade] = useState(false);         // no WebGL: the frame crossfades in instead
  const layer = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const rippleCanvas = useRef<HTMLCanvasElement>(null);
  const ripple = useRef<Ripple | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const dotCanvas = useRef<HTMLCanvasElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  // playhead and orbit, kept out of React state: they change every frame
  const s = useRef({ frames: null as Frames | null, target: 0, shown: 0, dir: 1, vel: 0, drawn: null as ImageBitmap | null, then: 0, skip: false, theta: 0, auto: true, zoom: 1 });

  // the sound only plays while the clip plays itself: it stops the moment the scroll takes over
  const sound = (on: boolean) => {
    const a = audio.current;
    if (!a) return;
    if (!on) { a.pause(); return; }
    a.currentTime = s.current.shown / FPS;
    a.play().catch(() => { /* blocked: the clip still plays, silently */ });
  };
  const setPlaying = (on: boolean) => {
    const st = s.current;
    st.auto = on;
    st.vel = 0;
    if (on) st.dir = 1;
    setAuto(on);
    sound(on && phaseRef.current === 'play');
  };
  const close = () => {
    if (phaseRef.current === 'closing') return;
    sound(false);
    setPhase('closing');
    reel.set({ covered: false, dimmed: false });
    setTimeout(() => reel.set({ open: false }), 350);
  };
  const toResume = () => {
    const st = s.current;
    if (st.frames) st.target = st.shown = st.frames.count - 1;
    sound(false);
    setPhase('resume');
  };
  const backToReel = () => {
    const st = s.current;
    if (!st.frames) return;
    st.target = st.frames.count - 1 - 24; // rewind a little so the résumé does not pop straight back
    panel.current?.scrollTo({ top: 0 });
    setPlaying(false); // they came back on purpose: leave it to the scroll
    setPhase('play');
  };
  const push = (dy: number) => {
    const st = s.current;
    if (!st.frames || phaseRef.current !== 'play') return;
    if (st.auto) setPlaying(false); // scrolling takes over from autoplay
    st.target = Math.min(st.frames.count - 1, Math.max(0, st.target + dy / PX_PER_FRAME));
    if (dy) st.dir = Math.sign(dy);
    setMoved(true);
  };

  // load: dots for at least a second, until the first frames are decoded. The first group is
  // timed; a machine whose decoder cannot keep up gets the next smaller rendition instead.
  useEffect(() => {
    let dead = false;
    const t0 = performance.now();
    reel.set({ dimmed: true });
    const start = async (size: ReturnType<typeof pickSize>) => {
      const stream = await loadReel(size);
      if (!(await Frames.supported(stream.codec))) return null;
      if (dead) return null;
      const f = await new Promise<Frames>((res) => {
        const frames = new Frames(stream, () => { if (frames.decodeFps) res(frames); });
        frames.want(0, 1);
      });
      s.current.frames?.close();
      s.current.frames = f;
      if (import.meta.env.DEV) ((window as unknown as { __reel: object[] }).__reel ??= []).push({ size, decodeFps: f.decodeFps });
      const next = smaller(size);
      // below this the picture would visibly drop frames; the sound keeps the time either way
      if (f.decodeFps < MIN_DECODE_FPS && next && !dead) return start(next);
      return f;
    };
    (async () => {
      let ok = !matchMedia('(prefers-reduced-motion: reduce)').matches;
      try { ok &&= !!(await start(pickSize())); } catch { ok = false; }
      // the ripple layer and its still of the arcade, while the dots are still orbiting: setting it up
      // takes a moment, and a stall here does not show the way one in mid-flight would
      const first = ok ? s.current.frames?.get(0) : undefined;
      if (first && !dead) {
        const r = createRipple(rippleCanvas.current!, first, drawDpr());
        ripple.current = r;
        void arcadeShot.request().then((shot) => { if (shot) r?.arcade(shot); });
      }
      await new Promise((r) => setTimeout(r, Math.max(0, MIN_DOTS_MS - (performance.now() - t0))));
      if (dead) return;
      s.current.skip = !ok; // no decoder, reduced motion or no download: straight to the résumé
      if (ok) setPhase('travel');
      else { reel.set({ covered: true }); toResume(); }
    })();
    return () => { dead = true; s.current.frames?.close(); s.current.frames = null; };
  }, []);

  // the dots, drawn at full resolution every frame so they stay crisp at any size: a true circular
  // orbit seen edge-on (constant speed, sinusoidal swing and size). When the clip is ready each one
  // glides to its orb, growing and shifting colour, while the orb's real pixels from the first
  // frame fade in inside it, so it lands as the orb itself at video quality.
  useEffect(() => {
    if (phase !== 'loading' && phase !== 'travel') return;
    const st = s.current, cv = dotCanvas.current!, g = cv.getContext('2d')!;
    const start = performance.now();
    let last = start, raf = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const W = Math.round(innerWidth * dpr), H = Math.round(innerHeight * dpr);
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      const m = phase === 'travel' ? easeInOut(Math.min(1, (now - start) / TRAVEL_MS)) : 0;
      st.theta += dt * ((2 * Math.PI) / ORBIT_S) * (1 - 0.6 * m);
      const frame = phase === 'travel' ? st.frames?.get(0) : undefined;
      g.clearRect(0, 0, W, H);
      g.imageSmoothingQuality = 'high';
      DOTS.forEach((d, i) => {
        const a = st.theta + i * Math.PI, to = orbOnScreen(d.orb);
        const x = (innerWidth / 2 + mix(ORBIT * Math.cos(a), to.x, m)) * dpr;
        const y = (innerHeight / 2 + mix(0, to.y, m)) * dpr;
        const r = mix(DOT * (1 + 0.22 * Math.sin(a)), to.r, m) * dpr;
        if (phase === 'travel') ripple.current?.trail(i, x / dpr, y / dpr, r / dpr);
        g.globalCompositeOperation = 'screen'; // where the dots overlap they add up
        g.fillStyle = css(d.from.map((c, j) => mix(c, d.to[j], m)));
        g.beginPath();
        g.arc(x, y, r, 0, 2 * Math.PI);
        g.fill();
        if (frame && m > 0) {
          // the frame scaled with the dot and placed so its orb sits exactly in it
          const fh = r / d.orb.r, fw = fh * (frame.width / frame.height);
          g.save();
          g.beginPath();
          g.arc(x, y, r, 0, 2 * Math.PI);
          g.clip();
          g.globalCompositeOperation = 'source-over';
          g.globalAlpha = m * m;
          g.drawImage(frame, x - d.orb.x * fw, y - d.orb.y * fh, fw, fh);
          g.restore();
        }
      });
      if (phase === 'travel' && m === 1) { setPhase('fan'); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  // the device pixels per CSS pixel worth drawing: never more than the clip itself has
  const drawDpr = () => {
    const bm = s.current.frames?.get(0);
    const cap = bm ? Math.max(bm.width / innerWidth, bm.height / innerHeight) : 2;
    return Math.min(devicePixelRatio || 1, 2, cap);
  };

  useEffect(() => () => { ripple.current?.dispose(); ripple.current = null; }, []);

  // two ripples fan out from the orbs and bring the first frame in; without WebGL it crossfades instead
  useEffect(() => {
    if (phase !== 'fan') return;
    reel.set({ covered: true }); // the arcade is gone from here on; stop drawing it
    const finish = () => {
      ripple.current?.dispose();
      ripple.current = null;
      if (phaseRef.current !== 'fan') return;   // closed partway through
      setPhase('play');
      if (s.current.auto) sound(true);
    };
    const orb = (i: number) => {
      const o = orbOnScreen(DOTS[i].orb);
      return { x: innerWidth / 2 + o.x, y: innerHeight / 2 + o.y, r: o.r };
    };
    if (ripple.current) { void ripple.current.fan([orb(1), orb(0)], FAN_MS, () => setBeadDone(true)).then(finish); return; }
    setFade(true);
    const t = setTimeout(finish, 600); // .reel fades in over this (styles.css)
    return () => clearTimeout(t);
  }, [phase]);

  // draw loop: ease the shown frame toward the target and draw it when it changes
  const drawing = phase === 'fan' || phase === 'play' || phase === 'resume';
  useEffect(() => {
    if (!drawing) return;
    const cv = canvas.current!, ctx = cv.getContext('2d')!;
    const st = s.current;
    const size = () => {
      const dpr = drawDpr();
      cv.width = Math.round(innerWidth * dpr);
      cv.height = Math.round(innerHeight * dpr);
      st.drawn = null;
    };
    size();
    addEventListener('resize', size);
    let raf = 0;
    st.then = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(64, now - st.then);
      st.then = now;
      const f = st.frames;
      if (f) {
        if (st.auto && phaseRef.current === 'play') {
          const a = audio.current;
          // the sound is the clock while it plays: the shown frame trails the target by EASE_MS,
          // so the target runs that far ahead of the sound and the picture lands on its time
          st.target = a && !a.paused && !a.ended
            ? Math.min(f.count - 1, (a.currentTime + EASE_MS / 1000) * FPS)
            : Math.min(f.count - 1, st.target + (dt * FPS) / 1000);
        }
        if (st.vel) { push(st.vel * dt); st.vel *= Math.exp(-dt / 325); if (Math.abs(st.vel) < 0.02) st.vel = 0; }
        st.shown += (st.target - st.shown) * (1 - Math.exp(-dt / EASE_MS));
        if (Math.abs(st.target - st.shown) < 0.01) st.shown = st.target;
        const k = Math.min(f.count - 1, Math.max(0, Math.round(st.shown)));
        f.want(k, st.dir);
        const bm = f.get(k);
        if (bm && bm !== st.drawn) {
          // cover the window, cropping whichever sides overflow (ripple.ts samples the same way)
          const sc = Math.max(cv.width / bm.width, cv.height / bm.height);
          const w = bm.width * sc, h = bm.height * sc;
          ctx.drawImage(bm, (cv.width - w) / 2, (cv.height - h) / 2, w, h);
          st.drawn = bm;
        }
        if (phaseRef.current === 'play' && st.target >= f.count - 1 && st.shown >= f.count - 1.5) setPhase('resume');
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', size); };
  }, [drawing]);

  // input: wheel, touch and keys drive the target; the résumé panel scrolls natively
  useEffect(() => {
    const el = layer.current!;
    const st = s.current;
    const atTop = () => (panel.current?.scrollTop ?? 0) <= 0;
    const onWheel = (e: WheelEvent) => {
      if (phaseRef.current === 'resume') {
        if (e.deltaY < 0 && atTop() && !e.ctrlKey && !e.metaKey && st.zoom === 1) { e.preventDefault(); backToReel(); }
        return;
      }
      e.preventDefault();
      push(e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1));
    };
    let lastY = 0, lastT = 0;
    const onStart = (e: TouchEvent) => { lastY = e.touches[0].clientY; lastT = e.timeStamp; st.vel = 0; };
    const onMove = (e: TouchEvent) => {
      const y = e.touches[0].clientY, dy = (lastY - y) * TOUCH_GAIN, dt = Math.max(1, e.timeStamp - lastT);
      lastY = y; lastT = e.timeStamp;
      if (phaseRef.current === 'resume') {
        if (dy < -8 && atTop() && e.touches.length === 1 && st.zoom === 1) backToReel();
        return;
      }
      e.preventDefault();
      push(dy);
      st.vel = dy / dt;
    };
    const onEnd = (e: TouchEvent) => { if (e.timeStamp - lastT > 80) st.vel = 0; }; // a held finger leaves no fling
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { close(); return; }
      if (phaseRef.current !== 'play' || e.target instanceof HTMLButtonElement) return;
      const step = innerHeight * 0.8;
      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') push(e.key === 'ArrowDown' ? 120 : step);
      else if (e.key === 'ArrowUp' || e.key === 'PageUp') push(e.key === 'ArrowUp' ? -120 : -step);
      else if (e.key === 'End') push(1e9);
      else if (e.key === 'Home') push(-1e9);
      else return;
      e.preventDefault();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div ref={layer} className={`reel-layer ${phase}${s.current.skip || fade ? ' fade' : ''}`} role="dialog" aria-modal="true" aria-label="Résumé">
      <div className="reel-scrim">
        {(phase === 'loading' || phase === 'travel' || phase === 'fan') && <canvas ref={rippleCanvas} className="reel-ripple" aria-hidden="true" />}
        <canvas ref={dotCanvas} className={`reel-dots${beadDone ? ' done' : ''}`} role="img" aria-label="Loading" />
      </div>
      <audio ref={audio} src={AUDIO} preload="auto" />
      <div className="reel">
        <canvas ref={canvas} aria-hidden="true" />
        <p className={`reel-hint${moved || auto ? '' : ' in'}`} aria-hidden="true">Scroll ↓</p>
        <div ref={panel} className="reel-resume" aria-hidden={phase !== 'resume'}>
          <ResumePages url={PDF} active={phase === 'resume'} scroller={panel} api={zoomApi} onZoom={(z) => { s.current.zoom = z; setZoom(z); }} />
        </div>
        <div className="reel-ui">
          {phase === 'play' && (
            <button type="button" className="reel-toggle" onClick={() => setPlaying(!auto)} aria-label={auto ? 'Pause and scroll instead' : 'Play automatically'} title={auto ? 'Pause and scroll' : 'Play automatically'}>
              <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
                {auto ? <path d="M2 1h3v10H2zM7 1h3v10H7z" /> : <path d="M2.5 1v10l8-5z" />}
              </svg>
            </button>
          )}
          {phase === 'play' && <button type="button" className="reel-skip" onClick={toResume}>Skip to résumé</button>}
          {phase === 'resume' && (
            <div className="reel-zoom" role="group" aria-label="Zoom">
              <button type="button" onClick={() => zoomApi.current?.by(1 / 1.5)} disabled={zoom <= 1} aria-label="Zoom out">−</button>
              <button type="button" onClick={() => zoomApi.current?.reset()} aria-label="Reset zoom">{Math.round(zoom * 100)}%</button>
              <button type="button" onClick={() => zoomApi.current?.by(1.5)} disabled={zoom >= 4} aria-label="Zoom in">+</button>
            </div>
          )}
          {phase === 'resume' && <a className="reel-download" href={PDF} target="_blank" rel="noreferrer">Download PDF ↗</a>}
          <button type="button" className="reel-close" onClick={close} aria-label="Close">✕</button>
        </div>
      </div>
    </div>
  );
}
