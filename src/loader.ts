// The loading screen. Plain DOM (markup in index.html), so it runs before React and three.js
// arrive. A black screen with one coin hovering in the middle, hollow at first: only its outlines,
// with the mascot struck into it in thin lines. Gold rises in it like a liquid as the site loads,
// waves on the surface, until it is a full coin. The coin is a real object the whole time: grab it,
// throw it, bounce it off the floor and the walls, roll it; the gold inside stays level. Once it is
// full, carry or throw it into the slot (or tap it, or press Enter, and it hops in by itself): a
// clink, and the hero draws itself in wireframe, the lines flowing out from the slot; the floor line
// lights up yellow and the black opens along it, the floor sliding down and the wall lifting away,
// onto the arcade as the machines drop into their outlines.
//
// A note at the bottom says it is best with sound on; the coin going in is the gesture that lets
// the browser start audio.

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
const coin = q('.coin'), slot = q('.loader-slot'), caption = q('.loader-caption'), capText = q('.cap-text'), note = q('.loader-note'), retry = q<HTMLButtonElement>('.loader-retry');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- the coin: a disc that fills with gold ----------
// Two faces drawn on top of each other: the unlit one (thin lines) and the struck one. The struck
// face is masked by a wavy liquid surface that rises with the progress (showLevel), so filling
// only ever changes a mask and nothing shifts underneath. The mascot in the middle is pre-rendered
// as a coin relief by scripts/coin-relief.py.
const face = (cls: string, id: string, img: string) => `<svg class="coin-face ${cls}" viewBox="0 0 100 100" fill="none" stroke-linecap="round" stroke-linejoin="round">
<defs>
  <radialGradient id="shine-${id}" cx="36%" cy="30%" r="80%"><stop offset="0" stop-color="#FFF7DF"/><stop offset=".55" stop-color="#FFE3AE"/><stop offset="1" stop-color="#E2BA7A"/></radialGradient>
  <path id="top-${id}" d="M14 50 A36 36 0 0 1 86 50"/>
  <path id="bot-${id}" d="M8 50 A42 42 0 0 0 92 50"/>
</defs>
<circle class="c-reed" cx="50" cy="50" r="47.6" stroke-width="2.6" stroke-dasharray=".9 1.65" stroke-linecap="butt"/>
<circle class="c-disc" cx="50" cy="50" r="45"/>
<image href="${img}" x="17.5" y="17.5" width="65" height="65"/>
<circle class="c-inner" cx="50" cy="50" r="32.5"/>
<text class="c-text"><textPath href="#top-${id}" startOffset="50%" text-anchor="middle">JACK WEI</textPath></text>
<text class="c-text"><textPath href="#bot-${id}" startOffset="50%" text-anchor="middle">ARCADE</textPath></text>
<path class="c-star" d="M11 46.5 L12 49 L14.5 50 L12 51 L11 53.5 L10 51 L7.5 50 L10 49 Z"/>
<path class="c-star" d="M89 46.5 L90 49 L92.5 50 L90 51 L89 53.5 L88 51 L85.5 50 L88 49 Z"/>
${cls === 'coin-lit' ? '<rect class="c-sheen" x="-30" y="-10" width="18" height="120"/>' : ''}
</svg>`;
// The faces turn with the coin (.coin-spin); the liquid's mask sits on a layer that does not,
// so the gold stays level however the coin rolls.
coin.innerHTML = `<div class="coin-flip"><div class="coin-body"><div class="coin-spin">${face('coin-dim', 'd', '/coin/face-dim.png')}</div><div class="coin-liquid"><div class="coin-spin">${face('coin-lit', 'l', '/coin/face-lit.png')}</div></div></div><i class="coin-halo"></i></div>`;
const flip = q('.coin-flip'), body = q('.coin-body'), liquid = q('.coin-liquid');
const [spinD, spinL] = Array.from(root.querySelectorAll<HTMLElement>('.coin-spin'));

let size = 112;                        // coin diameter, px
let floorY = innerHeight * 0.85;       // where the machines stand, px from the top
let font: FontData | null = null;

// The liquid: two wave-topped mask layers (styles.css), each 3 coin-heights tall with its surface
// a fifth of the way down, slid to the level and drifted sideways at different speeds, so their
// union is a surface that rolls. They wrap at their own wavelengths, so the drift never shows a seam.
let shown = -1;
function showLevel(p: number) {
  const t = reduced ? 0 : performance.now() / 1000;
  const surface = size * (1 - p) + (reduced ? 0 : Math.sin(t * 2.3) * size * 0.012);
  const y = (surface - size * 0.2).toFixed(2);
  const x1 = (-((t * size * 0.11) % (size / 2))).toFixed(2), x2 = (-((t * size * 0.07) % (size * 2 / 3))).toFixed(2);
  const pos = `${x1}px ${y}px, ${x2}px ${y}px`;
  liquid.style.maskPosition = pos;
  (liquid.style as unknown as { webkitMaskPosition: string }).webkitMaskPosition = pos;
  const n = Math.round(p * 100);
  if (n !== shown) { shown = n; root.setAttribute('aria-valuenow', String(n)); }
}

// ---------- sound: a few struck-metal noises, synthesised ----------
// Nothing can sound before the visitor's first gesture (the coin going in).
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
  /** the coin hitting something, by how hard */
  bounce(s: number) { hiss(3400 + s * 1400, 7, 0.03, 0.04 + 0.22 * s); ring(2300, 0.14, 0.015 + 0.06 * s, 0, 1800); },
  /** the coin is full (only heard if sound has already been allowed) */
  ready() { ring(2093, 0.5, 0.05); ring(3136, 0.4, 0.025, 0.02); },
  /** the coin hits the slot and rattles down inside */
  clink() {
    hiss(5200, 9, 0.04, 0.25); ring(2960, 0.4, 0.16); ring(4420, 0.3, 0.07, 0.004);
    [0.1, 0.19, 0.27, 0.36].forEach((w, i) => { hiss(1700 + i * 250, 5, 0.035, 0.11 - i * 0.025, w); ring(820 - i * 90, 0.07, 0.06 - i * 0.012, w, 400); });
  },
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
// Every path carries where it sits, for the draw-in to flow outward from the slot.
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
  size = Math.round(Math.min(136, Math.max(84, Math.min(innerWidth, innerHeight) * 0.16)));
  root.style.setProperty('--coin', `${size}px`);
  R = size / 2;
  measure();
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
let finished = false, waiting = false, inserting = false;
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
  showLevel(pos);
  if (!inserting) { step(dt, now); place(); }
  if (arrive && target - pos < 0.002) { arrive(); arrive = null; }
  if (!inserting) requestAnimationFrame(tick);
}

const play = (el: Element, frames: Keyframe[], ms: number, easing = 'cubic-bezier(.45, 0, .3, 1)', delay = 0) =>
  el.animate(frames, { duration: reduced ? 1 : ms, delay: reduced ? 0 : delay, easing, fill: 'forwards' }).finished;
/** For animations that end where they began: nothing is left behind to fight later styles. */
const once = (el: Element, frames: Keyframe[], ms: number, easing = 'cubic-bezier(.45, 0, .3, 1)') =>
  el.animate(frames, { duration: reduced ? 1 : ms, easing }).finished;
const wait = (ms: number) => new Promise((r) => setTimeout(r, reduced ? 0 : ms));

// ---------- the coin is full: put it in ----------
const onEnter: (() => void)[] = [], onOpen: (() => void)[] = [];
function waitForCoin() {
  waiting = true; readyAt = performance.now();
  root.classList.add('ready');
  capText.textContent = 'Insert coin';
  coin.tabIndex = 0;
  coin.setAttribute('role', 'button');
  coin.setAttribute('aria-label', 'Put the coin in the slot to enter');
  void once(body, [{ transform: 'scale(1)' }, { transform: 'scale(1.1)', offset: 0.4 }, { transform: 'scale(1)' }], 520, 'ease-out');
  if (actx) sfx.ready();
}

// ---------- the coin as an object ----------
// It hovers over the slot while it fills. Grab it and it is yours: throw it, bounce it off the
// floor and the walls, roll it. Tap it (or press Enter) once it is full and it hops into the slot
// by itself; carry or throw it down onto the slit and it goes in. Before it is full the slit only
// clinks it away.
const G = 2600, BOUNCE = 0.46, WALL = 0.6, ROLL = 1.3, AIR = 0.15, MAX_THROW = 3200;   // px, s
let R = 56;
const c = { x: 0, y: 0, vx: 0, vy: 0, ang: 0, angv: 0, tx: 0, ty: 0, free: false, resting: false, dragging: false };
const home = q('.coin-home');
let launched = 0, readyAt = 0;        // the slit only takes a coin let go after it was full
let anchor = { x: innerWidth / 2, y: innerHeight / 2 };
let slotBox = { x: innerWidth / 2, top: innerHeight / 2 + 80, half: 70 };
const groundY = () => innerHeight - 4 - R;
const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));
const ease = (a: number, b: number, k: number) => a + (b - a) * Math.min(1, k);
function measure() {
  const h = home.getBoundingClientRect(), sl = slot.getBoundingClientRect();
  anchor = { x: h.left + h.width / 2, y: h.top + h.height / 2 };
  slotBox = { x: sl.left + sl.width / 2, top: sl.top, half: sl.width / 2 };
  if (!c.free && !c.dragging) { c.x = anchor.x; c.y = anchor.y; }
}
function place() {
  coin.style.transform = `translate(${(c.x - R).toFixed(1)}px, ${(c.y - R).toFixed(1)}px)`;
  flip.style.transform = `rotateX(${c.tx.toFixed(2)}deg) rotateY(${c.ty.toFixed(2)}deg)`;
  const rot = `rotate(${c.ang.toFixed(3)}rad)`;
  spinD.style.transform = rot; spinL.style.transform = rot;
}
function sparks(x: number, y: number, n: number) {
  for (let i = 0; i < n; i++) {
    const el = document.createElement('i');
    el.className = 'coin-spark'; el.style.left = `${x}px`; el.style.top = `${y}px`;
    root.append(el);
    const a = Math.PI * (0.15 + 0.7 * (i / Math.max(1, n - 1))) + (Math.random() - 0.5) * 0.5, d = R * (0.4 + Math.random() * 0.8);
    el.animate([{ transform: 'translate(0, 0) scale(1)', opacity: 1 }, { transform: `translate(${Math.cos(a) * d}px, ${-Math.sin(a) * d}px) scale(.3)`, opacity: 0 }],
      { duration: 360 + Math.random() * 240, easing: 'cubic-bezier(.1, .7, .3, 1)', fill: 'forwards' }).finished.then(() => el.remove());
  }
}
let lastHit = 0;
/** A landing or a knock: sparks when hard, and the sound of it. */
function hit(strength: number, x: number, y: number) {
  const now = performance.now(); if (now - lastHit < 60) return; lastHit = now;
  const st = Math.min(1, strength);
  if (st > 0.3) sparks(x, y, st > 0.65 ? 7 : 3);
  sfx.bounce(st);
}
function squash(sy: number) {
  body.style.transformOrigin = '50% 100%';
  void once(body, [{ transform: `scale(${2 - sy}, ${sy})` }, { transform: 'scale(1, 1)' }], 240, 'cubic-bezier(.2, .8, .3, 1)');
  setTimeout(() => { body.style.transformOrigin = ''; }, 260);
}
function step(dt: number, now: number) {
  if (reduced) return;
  if (c.dragging) {
    // in the hand it banks into the movement
    c.ty = ease(c.ty, clamp1(c.vx / 1100) * 16, dt * 8); c.tx = ease(c.tx, clamp1(-c.vy / 1400) * 12, dt * 8);
    c.vx *= 0.82; c.vy *= 0.82;
    return;
  }
  if (!c.free) {
    // hovering over the slot, breathing, turning a little in the light
    const t = now / 1000;
    c.x = ease(c.x, anchor.x, dt * 6); c.y = ease(c.y, anchor.y + Math.sin(t * 1.7) * 4, dt * 6);
    c.ty = Math.sin(t * 0.75) * 9; c.tx = ease(c.tx, 0, dt * 4);
    return;
  }
  c.vy += G * dt;
  c.vx *= Math.exp(-AIR * dt);
  c.x += c.vx * dt; c.y += c.vy * dt;
  c.ang += (c.resting ? c.vx / R : c.angv) * dt;   // rolling on the floor, free spin in the air
  const floor = groundY();
  if (c.y >= floor) {
    c.y = floor;
    if (c.vy > 130) {
      hit(c.vy / 1800, c.x, c.y + R);
      squash(Math.max(0.8, 1 - c.vy / 5000));
      c.vy = -c.vy * BOUNCE; c.angv = c.vx / R;
    } else { c.vy = 0; c.resting = true; }
  } else c.resting = false;
  if (c.resting) { c.vx *= Math.exp(-dt * ROLL); if (Math.abs(c.vx) < 3) c.vx = 0; c.angv = c.vx / R; }
  else c.angv *= Math.exp(-dt * 0.3);
  if (c.y < R) { c.y = R; c.vy = -c.vy * WALL; hit(Math.abs(c.vy) / 1800, c.x, 0); }
  if (c.x < R) { c.x = R; c.vx = -c.vx * WALL; c.angv *= -0.5; hit(Math.abs(c.vx) / 1800, 0, c.y); }
  else if (c.x > innerWidth - R) { c.x = innerWidth - R; c.vx = -c.vx * WALL; c.angv *= -0.5; hit(Math.abs(c.vx) / 1800, innerWidth, c.y); }
  // it banks into its flight and lies flat on the floor
  c.ty = ease(c.ty, c.resting ? 0 : clamp1(c.vx / 1100) * 14, dt * 5);
  c.tx = ease(c.tx, c.resting ? 0 : clamp1(-c.vy / 1600) * 10, dt * 5);
  atSlot(c.vy);
}
/** The slit takes the coin coming down onto it, once it is full and the visitor has meant it (in
 *  the hand, or let go after it filled); otherwise it only clinks it away. */
function atSlot(vy: number) {
  if (inserting || vy < 0) return;
  if (Math.abs(c.x - slotBox.x) > slotBox.half * 0.85 || c.y + R < slotBox.top || c.y > slotBox.top) return;
  if (waiting && (c.dragging || launched > readyAt)) { insert(); return; }
  c.free = true; c.resting = false;
  c.y = slotBox.top - R; c.vy = -Math.max(220, vy) * 0.5; c.vx += (c.x < slotBox.x ? -1 : 1) * 60;
  slot.classList.add('hot'); setTimeout(() => slot.classList.remove('hot'), 120);
  hit(0.5, c.x, slotBox.top);
}

// ---------- in the hand ----------
let grab: { dx: number; dy: number; sx: number; sy: number; samples: { t: number; x: number; y: number }[] } | null = null;
coin.addEventListener('pointerdown', (e) => {
  if (inserting || reduced) return;
  e.preventDefault();
  coin.setPointerCapture(e.pointerId);
  grab = { dx: e.clientX - c.x, dy: e.clientY - c.y, sx: e.clientX, sy: e.clientY, samples: [{ t: performance.now(), x: e.clientX, y: e.clientY }] };
  c.dragging = true; c.resting = false; c.vx = c.vy = 0;
  root.classList.add('dragging');
});
coin.addEventListener('pointermove', (e) => {
  if (!grab || inserting) return;
  const px = Math.max(R, Math.min(innerWidth - R, e.clientX - grab.dx)), py = Math.max(R, Math.min(groundY(), e.clientY - grab.dy));
  c.vx = (px - c.x) * 60; c.vy = (py - c.y) * 60;   // for the banking; the throw itself uses the samples
  c.x = px; c.y = py;
  c.ang += ((e.movementX || 0) / R) * 0.35;         // it turns a little in the hand
  grab.samples.push({ t: performance.now(), x: e.clientX, y: e.clientY });
  if (grab.samples.length > 6) grab.samples.shift();
  slot.classList.toggle('hot', waiting && Math.abs(c.x - slotBox.x) < slotBox.half * 0.85 && c.y + R >= slotBox.top - 12);
  atSlot(1);
});
const letGo = (e: PointerEvent) => {
  if (!grab) return;
  const s = grab.samples, a = s[0], b = s[s.length - 1];
  const moved = Math.hypot(e.clientX - grab.sx, e.clientY - grab.sy);
  grab = null; c.dragging = false;
  root.classList.remove('dragging'); slot.classList.remove('hot');
  if (inserting) return;
  c.free = true; launched = performance.now();
  if (moved < 6) {
    if (waiting) { tossToSlot(); return; }
    c.vy = -480; c.angv = 4;   // a hop
    return;
  }
  // thrown: it keeps the hand's speed, unless the hand had stopped
  const stale = performance.now() - b.t > 90, dt = Math.max(0.016, (b.t - a.t) / 1000);
  c.vx = stale ? 0 : (b.x - a.x) / dt; c.vy = stale ? 0 : (b.y - a.y) / dt;
  const speed = Math.hypot(c.vx, c.vy);
  if (speed > MAX_THROW) { c.vx *= MAX_THROW / speed; c.vy *= MAX_THROW / speed; }
  c.angv = (c.vx / R) * 0.7 + (Math.random() - 0.5) * 3;
};
coin.addEventListener('pointerup', letGo);
coin.addEventListener('pointercancel', letGo);
coin.addEventListener('keydown', (e) => { if (waiting && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); tossToSlot(); } });

/** The coin hops from where it is into the slot by itself (a tap, or the keyboard). */
function tossToSlot() {
  if (!waiting || inserting) return;
  if (reduced) { c.x = slotBox.x; c.y = slotBox.top - R; insert(); return; }
  c.free = true; c.resting = false; launched = performance.now();
  const t = 0.5, dx = slotBox.x - c.x, dy = slotBox.top - R - c.y;
  c.vx = dx / t; c.vy = dy / t - (G * t) / 2; c.angv = (c.vx / R) * 0.6;
  // whatever the arc does, it lands in the slot
  setTimeout(() => { if (waiting && !inserting) { c.x = slotBox.x; c.y = slotBox.top - R; insert(); } }, t * 1000 + 40);
}

/** The coin drops into the slit and we enter: the slot flashes, the hero draws itself in
 *  wireframe, the floor line lights up, and the black opens along it onto the arcade. */
function insert() {
  if (!waiting || inserting) return;
  inserting = true; waiting = false;
  root.classList.remove('ready');
  root.classList.add('inserting');
  coin.removeAttribute('tabindex');
  ac();                                 // still inside the visitor's gesture: audio may start now
  onEnter.forEach((f) => f());
  void (async () => {
    // down into the slit: it moves behind the slot's edge as it goes
    c.tx = c.ty = 0; place();
    const gap = Math.max(0, slotBox.top + 1 - (c.y + R)), D = gap + 2 * R;
    const N = 18, frames: Keyframe[] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, u = t * t * (1.6 - 0.6 * t);   // gathering speed as it falls
      const y = D * u, hidden = Math.min(1, Math.max(0, (y - gap) / (2 * R)));
      frames.push({ transform: `translate(${(c.x - R + (slotBox.x - c.x) * u).toFixed(1)}px, ${(c.y - R + y).toFixed(1)}px)`, clipPath: `inset(0 0 ${(hidden * 100).toFixed(2)}% 0)` });
    }
    const ms = 300 + gap * 0.6;
    void play(coin, frames, ms, 'linear');
    await wait(ms * Math.sqrt(gap / D) * 0.9);
    slot.classList.add('hot');
    sfx.clink();
    void once(slot, [{ transform: 'scaleX(1)' }, { transform: 'scaleX(1.06)', offset: 0.4 }, { transform: 'scaleX(1)' }], 320, 'ease-out');
    void play(caption, [{ opacity: 1 }, { opacity: 0 }], 320, 'ease-out');
    void play(note, [{ opacity: 1 }, { opacity: 0 }], 320, 'ease-out');
    await wait(ms - ms * Math.sqrt(gap / D) * 0.9);
    setTimeout(() => slot.classList.remove('hot'), 200);
    void play(slot, [{ opacity: 1 }, { opacity: 0 }], 500, 'ease-out', 500);

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

  // Everything is ready: the coin fills to the brim and waits to be put in.
  finish() {
    if (finished) return;
    loading.report('shadows', 1);
    finished = true;
    void (async () => {
      await new Promise<void>((r) => { arrive = r; });
      waitForCoin();
    })();
  },

  /** Called inside the visitor's gesture that puts the coin in (so audio may start). */
  onEnter(fn: () => void) { onEnter.push(fn); },
  /** Called as the floor opens. */
  onOpen(fn: () => void) { onOpen.push(fn); },

  /** A machine has landed in its outline: the outline flashes and goes. */
  landed(machine: string) {
    root.querySelectorAll(`[data-part="${machine}"]`).forEach((g) => void play(g, [{ opacity: 1 }, { opacity: 1, offset: 0.2 }, { opacity: 0 }], 520, 'ease-out'));
  },

  fail() {
    root.classList.add('jammed');
    capText.textContent = 'Jammed';
    retry.hidden = false;
    retry.onclick = () => location.reload();
  },
};

drawOutline();
void fetch('/fonts/hero-display.json').then((r) => r.json()).then((f: FontData) => { font = f; if (!inserting) drawOutline(); }).catch(() => {});
window.addEventListener('resize', () => { if (!inserting) drawOutline(); });
if (document.fonts) void document.fonts.ready.then(measure);
showLevel(0);
place();
root.classList.add('on');
void once(body, [{ transform: 'scale(.7)' }, { transform: 'scale(1)' }], 700, 'cubic-bezier(.2, .9, .3, 1.15)');
requestAnimationFrame(tick);
