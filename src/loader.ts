// The loading screen. Plain DOM (markup in index.html), so it paints before React and three.js
// arrive. A black screen with a thin bar at the bottom and a ticket in the middle, whose photo prints
// itself as the site loads (the ticket is React, src/ticket/, and follows a moment after the first
// paint). The stub stays on until everything is ready. Tear it off: the paper rips, and the hero draws
// itself in wireframe, the lines flowing out from the ticket; the floor line lights up yellow and the
// black opens along it, the floor sliding down and the wall lifting away, onto the arcade as the
// machines drop into their outlines.
//
// A note at the bottom says it is best with sound on; grabbing the stub is the gesture that lets the
// browser start audio.

import type { FontData } from './arcade/heroName';
import { heroOutline, type Pt } from './arcade/silhouette';

export type LoadStage = 'download' | 'compile' | 'settle' | 'shadows';

// Share of the progress each stage owns, in the order they happen.
const RANGE: Record<LoadStage, [number, number]> = {
  download: [0, 0.7], compile: [0.7, 0.8], settle: [0.8, 0.86], shadows: [0.86, 1],
};
const SMOOTH = 0.42;                   // spring smoothing time, seconds

const root = document.getElementById('loader')!;
const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
const sky = q('.loader-sky'), ground = q('.loader-ground'), horizon = q('.loader-horizon');
const outline = root.querySelector<SVGSVGElement>('.outline')!;
const starsBox = q('.loader-stars');
const mount = q('.ticket-mount'), barBox = q('.loader-bar'), fill = q('.loader-bar b'), note = q('.loader-note'), retry = q<HTMLButtonElement>('.loader-retry');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

let floorY = innerHeight * 0.85;       // where the machines stand, px from the top
let font: FontData | null = null;

// What the ticket reads. It lives in its own React root, so it subscribes.
let state = { progress: 0, ready: false, failed: false };
const watchers = new Set<() => void>();
function share(next: Partial<typeof state>) { state = { ...state, ...next }; watchers.forEach((f) => f()); }

let shown = -1;
function showProgress(p: number) {
  fill.style.transform = `scaleX(${p.toFixed(4)})`;
  const n = Math.round(p * 100);
  if (n !== shown) { shown = n; root.setAttribute('aria-valuenow', String(n)); share({ progress: n / 100 }); }
}

// ---------- sound: a few noises, synthesised ----------
// Nothing can sound before the visitor's first gesture (grabbing the stub).
let actx: AudioContext | null = null, noise: AudioBuffer | null = null;
function ac(): AudioContext | null {
  if (!actx) {
    try { actx = new AudioContext(); } catch { return null; }
    noise = actx.createBuffer(1, actx.sampleRate / 2, actx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (actx.state === 'suspended') void actx.resume();
  return actx;
}
function hiss(freq: number, q: number, dur: number, gain: number, when = 0) {
  const a = ac(); if (!a || !noise) return;
  const t = a.currentTime + when, src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = noise; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(a.destination); src.start(t, Math.random() * 0.3); src.stop(t + dur + 0.02);
}
function ring(freq: number, dur: number, gain: number, when = 0, to = freq) {
  const a = ac(); if (!a) return;
  const t = a.currentTime + when, o = a.createOscillator(), g = a.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}
const sfx = {
  /** everything is ready (only heard if sound has already been allowed) */
  ready() { ring(2093, 0.5, 0.05); ring(3136, 0.4, 0.025, 0.02); },
  /** one paper bridge giving way */
  rip() { hiss(2400 + Math.random() * 2200, 1.3, 0.05, 0.1); },
  /** the stub is off */
  stamp() { hiss(700, 1, 0.09, 0.2); ring(150, 0.2, 0.2, 0, 70); },
  /** the wireframes drawing: a pen racing over paper for `ms` */
  trace(ms: number) {
    const a = ac(); if (!a || !noise) return;
    const t = a.currentTime, d = ms / 1000, src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    src.buffer = noise; src.loop = true; f.type = 'bandpass'; f.Q.value = 2.5;
    f.frequency.setValueAtTime(1400, t); f.frequency.exponentialRampToValueAtTime(4200, t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.08); g.gain.setValueAtTime(0.07, t + d - 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    src.connect(f).connect(g).connect(a.destination); src.start(t); src.stop(t + d + 0.05);
  },
  /** the floor opening: air moving, then the weight of it landing */
  open() {
    const a = ac(); if (!a || !noise) return;
    const t = a.currentTime, src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    src.buffer = noise; src.loop = true; f.type = 'lowpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(220, t); f.frequency.exponentialRampToValueAtTime(1600, t + 0.5); f.frequency.exponentialRampToValueAtTime(260, t + 1.1);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.28, t + 0.45); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.15);
    src.connect(f).connect(g).connect(a.destination); src.start(t); src.stop(t + 1.2);
    ring(110, 0.4, 0.5, 0.95, 38); hiss(300, 1, 0.3, 0.2, 0.95);
  },
};
// ---------- the hero, in wireframe ----------
// Projected with the hero camera, so each outline lies exactly where its machine will land.
// Every path carries where it sits, for the draw-in to flow outward from the ticket.
const sx = (x: number) => ((x + 1) / 2) * innerWidth, sy = (y: number) => ((1 - y) / 2) * innerHeight;
function drawOutline() {
  if (!innerWidth || !innerHeight) return;   // a window with no size yet draws again on resize
  const parts = heroOutline(innerWidth / innerHeight, font);
  outline.setAttribute('viewBox', `0 0 ${innerWidth} ${innerHeight}`);
  const el = (cls: string, pts: Pt[], close: boolean) => {
    const xs = pts.map(([x]) => sx(x)), ys = pts.map(([, y]) => sy(y));
    const d = `M${pts.map(([x, y]) => `${sx(x).toFixed(1)} ${sy(y).toFixed(1)}`).join(' L')}${close ? ' Z' : ''}`;
    return `<path class="${cls}" pathLength="1" data-x="${((Math.min(...xs) + Math.max(...xs)) / 2).toFixed(0)}" data-b="${Math.max(...ys).toFixed(0)}" d="${d}"/>`;
  };
  outline.innerHTML = parts.map((p) => `<g data-part="${p.id}">${
    p.faces.map((f) => el('glow', f, true) + el('face', f, true)).join('')}${
    p.lines.map((l) => el('glow', l, false) + el('line', l, false)).join('')}</g>`).join('');
  // the floor line runs under the machines
  const bottoms = parts.filter((p) => p.id !== 'name').flatMap((p) => [...p.faces, ...p.lines].flat().map(([, y]) => sy(y)));
  floorY = bottoms.length ? Math.max(...bottoms) : innerHeight * 0.85;
  root.style.setProperty('--floor', `${floorY.toFixed(1)}px`);
}
/** Every line draws itself, flowing out from the middle: the name to the left, the machines to
 *  the right, each rising from its base. Returns when the last one is done (ms). */
function drawIn() {
  const cx = innerWidth / 2;
  let end = 0;
  outline.querySelectorAll<SVGPathElement>('path').forEach((p) => {
    const delay = (Math.abs(Number(p.dataset.x) - cx) / innerWidth) * 900 + ((floorY - Number(p.dataset.b)) / innerHeight) * 320;
    const ms = 440;
    end = Math.max(end, delay + ms);
    void p.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: reduced ? 1 : ms, delay: reduced ? 0 : delay, easing: 'cubic-bezier(.3, 0, .2, 1)', fill: 'forwards' });
  });
  return reduced ? 0 : end;
}

// ---------- progress: a smooth-damp spring, so bursts of progress turn into one steady rise ----------
let target = 0, pos = 0, vel = 0, last = performance.now();
let finished = false, entering = false;
let arrive: (() => void) | null = null;
function tick(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (reduced) { pos = target; vel = 0; }
  else {
    // Brisker once finished, so the last of the light lands instead of creeping in.
    const w = 2 / (finished ? SMOOTH * 0.45 : SMOOTH), k = w * dt, e = 1 / (1 + k + 0.48 * k * k + 0.235 * k * k * k);
    const change = pos - target, temp = (vel + w * change) * dt;
    vel = (vel - w * temp) * e;
    pos = target + (change + temp) * e;
    if (pos > target) { pos = target; vel = 0; }   // never run ahead of real progress
  }
  showProgress(pos);
  if (arrive && target - pos < 0.002) { arrive(); arrive = null; }
  if (!entering) requestAnimationFrame(tick);
}

const play = (el: Element, frames: Keyframe[], ms: number, easing = 'cubic-bezier(.45, 0, .3, 1)', delay = 0) =>
  el.animate(frames, { duration: reduced ? 1 : ms, delay: reduced ? 0 : delay, easing, fill: 'forwards' }).finished;
const wait = (ms: number) => new Promise((r) => setTimeout(r, reduced ? 0 : ms));

// ---------- the diamonds: a sparse field of stars, twinkling on the black ----------
// Scattered from a fixed seed so the page always looks the same, clear of the ticket and the text,
// with one larger diamond resting in each corner. The tear makes the ones nearby flare.
type Star = { el: HTMLElement; x: number; y: number };
const stars: Star[] = [];
function addStar(x: number, y: number, px: number, o: number, delay: number) {
  const el = document.createElement('i');
  el.style.cssText = `left:${x}%;top:${y}%;width:${px}px;height:${px}px;--o:${o};animation-delay:${delay.toFixed(2)}s`;
  starsBox.append(el);
  stars.push({ el, x, y });
}
function scatter() {
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const want = innerWidth < 560 ? 14 : 30;
  for (let i = 0, made = 0; i < 400 && made < want; i++) {
    const x = 3 + rnd() * 94, y = 4 + rnd() * 92, big = rnd(), delay = rnd() * 7;
    if ((Math.abs(x - 50) < 22 && Math.abs(y - 46) < 30) || (Math.abs(x - 50) < 30 && y > 72 && y < 92)) continue;
    if (stars.some((t) => Math.hypot(t.x - x, (t.y - y) * 0.6) < 7)) continue;
    addStar(x, y, big > 0.85 ? 13 : big > 0.5 ? 9 : 6, big > 0.85 ? 0.3 : 0.18, delay);
    made++;
  }
  [[3.5, 6], [96.5, 6], [3.5, 94], [96.5, 94]].forEach(([x, y], i) => addStar(x, y, 16, 0.42, i * 1.7));
}
function flare(x: number, y: number) {
  for (const t of stars) {
    const d = Math.hypot((t.x / 100) * innerWidth - x, (t.y / 100) * innerHeight - y);
    if (d < 320) void t.el.animate([{ opacity: 1, transform: 'scale(1.5) rotate(45deg)' }, { opacity: 0, transform: 'scale(.75)' }], { duration: 500 + d * 2, delay: d * 0.6, easing: 'ease-out' });
  }
}

// ---------- the way in ----------
const onEnter: (() => void)[] = [], onOpen: (() => void)[] = [];
let ticketGone: (() => void) | null = null;
function ready() {
  root.classList.add('ready');
  share({ ready: true });
  if (actx) sfx.ready();
}
/** Inside a visitor's gesture: audio may start, and the arcade's sound with it. */
let unlocked = false;
function gesture() {
  ac();
  if (!unlocked && onEnter.length) { unlocked = true; onEnter.forEach((f) => f()); }
}

/** The stub is off and we enter: the ticket glides to the middle and goes, the hero draws itself in
 *  wireframe, the floor line lights up, and the black opens along it onto the arcade. */
function enter() {
  if (!state.ready || entering) return;
  entering = true;
  root.classList.remove('ready');
  gesture();
  void (async () => {
    const r = mount.getBoundingClientRect();
    flare(r.left + r.width / 2, r.top + r.height / 2);
    sfx.stamp();
    void play(barBox, [{ opacity: 1 }, { opacity: 0 }], 320, 'ease-out');
    void play(note, [{ opacity: 1 }, { opacity: 0 }], 320, 'ease-out');
    await wait(520);
    void play(mount, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.9)' }], 460, 'ease-in').then(() => ticketGone?.());
    void play(starsBox, [{ opacity: 1 }, { opacity: 0 }], 700, 'ease-out', 200);

    // the hero draws itself
    const drawn = drawIn();
    sfx.trace(drawn);
    await wait(drawn * 0.8);
    // the floor line lights up...
    void play(horizon, [{ transform: 'scaleX(0)', opacity: 0 }, { transform: 'scaleX(1)', opacity: 1 }], 460, 'cubic-bezier(.2, .7, .2, 1)');
    await wait(340);
    // ...and the black opens along it: the floor slides down, the wall lifts away
    root.classList.add('open');
    sfx.open();
    const ease = 'cubic-bezier(.7, 0, .2, 1)';
    void play(ground, [{ transform: 'translateY(0%)' }, { transform: 'translateY(101%)' }], 1000, ease);
    void play(horizon, [{ opacity: 1 }, { opacity: 0 }], 500, 'ease-out', 450);
    const opened = play(sky, [{ transform: 'translateY(0%)' }, { transform: 'translateY(-101%)' }], 1150, ease);
    await wait(180);
    onOpen.forEach((f) => f());          // the machines start to drop
    await opened;
    // The name's outline gives way as its 3D letters stamp in.
    await wait(1000);
    root.querySelectorAll('[data-part="name"]').forEach((g) => void play(g, [{ opacity: 1 }, { opacity: 0 }], 700, 'ease-in-out'));
    await wait(1700);
    root.remove();
  })();
}

export const loading = {
  report(s: LoadStage, frac: number) {
    if (finished) return;
    const [lo, hi] = RANGE[s];
    target = Math.max(target, lo + (hi - lo) * Math.min(1, Math.max(0, frac)));
  },

  // Right before a known main-thread stall (evaluating the big 3D bundle, compiling shaders),
  // `through` lets the level run ahead to the end of a stage that is about to come in choppy frames.
  coast(_ms = 900, through?: LoadStage) {
    if (finished) return;
    if (through) target = Math.max(target, RANGE[through][1]);
  },

  // Everything is ready: the photo finishes printing and the stub comes unlocked.
  finish() {
    if (finished) return;
    loading.report('shadows', 1);
    finished = true;
    void (async () => {
      await new Promise<void>((r) => { arrive = r; });
      ready();
    })();
  },

  /** Called inside the visitor's gesture on the stub (so audio may start). */
  onEnter(fn: () => void) { onEnter.push(fn); },
  /** Called as the floor opens. */
  onOpen(fn: () => void) { onOpen.push(fn); },

  /** A machine has landed in its outline: the outline flashes and goes. */
  landed(machine: string) {
    root.querySelectorAll(`[data-part="${machine}"]`).forEach((g) => void play(g, [{ opacity: 1 }, { opacity: 1, offset: 0.2 }, { opacity: 0 }], 520, 'ease-out'));
  },

  fail() {
    root.classList.add('jammed');
    share({ failed: true });
    retry.hidden = false;
    retry.onclick = () => location.reload();
  },

  /** The ticket's side of things (src/ticket/LoaderTicket.tsx). */
  ticket: {
    get: () => state,
    watch(fn: () => void) { watchers.add(fn); return () => { watchers.delete(fn); }; },
    touched: gesture,
    ripped: () => sfx.rip(),
    torn: enter,
    whenGone(fn: () => void) { ticketGone = fn; },
  },
};

drawOutline();
void fetch('/fonts/hero-display.json').then((r) => r.json()).then((f: FontData) => { font = f; if (!entering) drawOutline(); }).catch(() => {});
window.addEventListener('resize', () => { if (!entering) drawOutline(); });
scatter();
showProgress(0);
root.classList.add('on');
requestAnimationFrame(tick);
