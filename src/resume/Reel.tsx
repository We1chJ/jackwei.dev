// The résumé reel. The button dims the arcade and shows two orbiting dots (after TikTok's
// loader) while the clip downloads; then the clip opens out of the centre in a growing circle
// and scrolling plays it. On its final white frame the résumé rises to the front.
//
// The page itself never scrolls (the arcade is a fixed canvas), so wheel, touch and keys move a
// target frame and the shown frame eases toward it every display refresh. That turns notchy
// wheels and uneven trackpads into a glide.
import { useEffect, useRef, useState } from 'react';
import { Frames } from './frames';
import ResumePages from './ResumePages';
import { loadReel, reel, useReel } from './store';

type Phase = 'loading' | 'reveal' | 'play' | 'resume' | 'closing';

const MIN_DOTS_MS = 1000;
const PX_PER_FRAME = 7;   // scroll distance per frame (the clip is 1390 frames)
const TOUCH_GAIN = 1.6;   // fingers travel less than wheels
const EASE_MS = 70;       // time constant of the shown frame chasing the target
const PDF = '/assets/ResumeOfficial.pdf';

export default function Reel() {
  const open = useReel((s) => s.open);
  return open ? <Overlay /> : null;
}

function Overlay() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [slow, setSlow] = useState(false);
  const [moved, setMoved] = useState(false);
  const progress = useReel((s) => s.progress);
  const layer = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  // playhead, kept out of React state: it changes every frame
  const s = useRef({ frames: null as Frames | null, target: 0, shown: 0, dir: 1, vel: 0, drawn: null as ImageBitmap | null, then: 0, skip: false });

  const close = () => {
    if (phaseRef.current === 'closing') return;
    setPhase('closing');
    reel.set({ covered: false });
    setTimeout(() => reel.set({ open: false }), 350);
  };
  const toResume = () => {
    const st = s.current;
    if (st.frames) st.target = st.shown = st.frames.count - 1;
    setPhase('resume');
  };
  const backToReel = () => {
    const st = s.current;
    if (!st.frames) return;
    st.target = st.frames.count - 1 - 24; // rewind a little so the résumé does not pop straight back
    panel.current?.scrollTo({ top: 0 });
    setPhase('play');
  };
  const push = (dy: number) => {
    const st = s.current;
    if (!st.frames || phaseRef.current !== 'play') return;
    st.target = Math.min(st.frames.count - 1, Math.max(0, st.target + dy / PX_PER_FRAME));
    if (dy) st.dir = Math.sign(dy);
    setMoved(true);
  };

  // load: dots for at least a second, until the first frame is decoded
  useEffect(() => {
    let dead = false;
    const t0 = performance.now();
    const slowTimer = setTimeout(() => setSlow(true), 1500);
    (async () => {
      let ok = !matchMedia('(prefers-reduced-motion: reduce)').matches;
      try {
        const stream = await loadReel();
        ok &&= await Frames.supported(stream.codec);
        if (ok && !dead) {
          await new Promise<void>((res) => {
            const f = new Frames(stream, (k) => { if (k === 0) res(); });
            s.current.frames = f;
            f.want(0, 1);
          });
        }
      } catch { ok = false; }
      await new Promise((r) => setTimeout(r, Math.max(0, MIN_DOTS_MS - (performance.now() - t0))));
      if (dead) return;
      s.current.skip = !ok; // no decoder, reduced motion or no download: straight to the résumé
      setPhase('reveal');
    })();
    return () => { dead = true; clearTimeout(slowTimer); s.current.frames?.close(); s.current.frames = null; };
  }, []);

  // the circle normally reports its end; this covers browsers that skip the transition
  useEffect(() => {
    if (phase !== 'reveal') return;
    const t = setTimeout(() => onRevealed(), 1000);
    return () => clearTimeout(t);
  }, [phase]);

  // draw loop: ease the shown frame toward the target and draw it when it changes
  const drawing = phase !== 'loading' && phase !== 'closing';
  useEffect(() => {
    if (!drawing) return;
    const cv = canvas.current!, ctx = cv.getContext('2d')!;
    const st = s.current;
    const size = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
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
        if (st.vel) { push(st.vel * dt); st.vel *= Math.exp(-dt / 325); if (Math.abs(st.vel) < 0.02) st.vel = 0; }
        st.shown += (st.target - st.shown) * (1 - Math.exp(-dt / EASE_MS));
        if (Math.abs(st.target - st.shown) < 0.01) st.shown = st.target;
        const k = Math.min(f.count - 1, Math.max(0, Math.round(st.shown)));
        f.want(k, st.dir);
        const bm = f.get(k);
        if (bm && bm !== st.drawn) {
          // cover the window, cropping whichever sides overflow
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
        if (e.deltaY < 0 && atTop()) { e.preventDefault(); backToReel(); }
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
        if (dy < -8 && atTop()) backToReel();
        return;
      }
      e.preventDefault();
      push(dy);
      st.vel = dy / dt;
    };
    const onEnd = (e: TouchEvent) => { if (e.timeStamp - lastT > 80) st.vel = 0; }; // a held finger leaves no fling
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { close(); return; }
      if (phaseRef.current !== 'play') return;
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

  const onRevealed = (e?: React.TransitionEvent) => {
    if ((e && e.target !== e.currentTarget) || phaseRef.current !== 'reveal') return;
    reel.set({ covered: true });
    if (s.current.skip) toResume(); else setPhase('play');
  };

  return (
    <div ref={layer} className={`reel-layer ${phase}`} role="dialog" aria-modal="true" aria-label="Résumé">
      <div className="reel-scrim" aria-hidden={phase !== 'loading'}>
        <div className="reel-dots" role="status" aria-label="Loading">
          <span className="dot red" /><span className="dot blue" />
        </div>
        {slow && phase === 'loading' && <p className="reel-progress">{Math.round(progress * 100)}%</p>}
      </div>
      <div className="reel" onTransitionEnd={(e) => onRevealed(e)}>
        <canvas ref={canvas} aria-hidden="true" />
        <p className={`reel-hint${moved ? '' : ' in'}`} aria-hidden="true">Scroll ↓</p>
        <div ref={panel} className="reel-resume" aria-hidden={phase !== 'resume'}>
          <div className="reel-resume-bar">
            <a href={PDF} target="_blank" rel="noreferrer">Download PDF ↗</a>
          </div>
          <ResumePages url={PDF} />
        </div>
        <div className="reel-ui">
          {phase === 'play' && <button type="button" className="reel-skip" onClick={toResume}>Skip to résumé</button>}
          <button type="button" className="reel-close" onClick={close} aria-label="Close">✕</button>
        </div>
      </div>
    </div>
  );
}
