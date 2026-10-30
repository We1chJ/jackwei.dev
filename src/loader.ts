// The loading screen. Plain DOM (markup in index.html), so it runs before React and three.js
// arrive. Everything is drawn in one language, warm light on black: the hero scene as line-art
// (the three machines and the name, projected with the hero camera, so each outline lies exactly
// where its machine will land) fills with light from the bottom up as loading progresses.
//
// The coin is the hero. It drops in as a blank disc and mints itself as the site loads: first
// its edge, then the beaded ring, then the J. It is a real object the whole time: drag it, flick
// it, bounce it off the walls, spin it. Idle, it wobbles and settles and the light wanders over
// the outlines. Once minted, flick or drag it into the slot (or just click it): the outlines
// flare, the dark panel swings down like a trapdoor, and the machines drop into their outlines.

import { HERO_NAME, HERO_TEXT_BOTTOM } from './arcade/layout';
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
const bg = q('.loader-bg'), body = q('.loader-body'), coin = q('.coin'), slot = q('.loader-slot'), retry = q<HTMLButtonElement>('.loader-retry');
const capText = q('.cap-text'), capNum = q('.cap-num');
const dimSvg = root.querySelector<SVGSVGElement>('.outline-dim')!, litSvg = root.querySelector<SVGSVGElement>('.outline-lit')!, litWin = q('.outline-window');
const sweep = q('.outline-sweep');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- the coin: a disc that mints itself ----------
// Each part is drawn as the progress passes through its range (minting(), below).
coin.innerHTML = `<div class="coin-flip"><div class="coin-body"><svg class="coin-face" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
  <defs><clipPath id="coin-clip"><circle cx="50" cy="50" r="45"/></clipPath></defs>
  <circle class="c-disc" cx="50" cy="50" r="45"/>
  <rect class="c-sheen" x="-30" y="0" width="34" height="100" clip-path="url(#coin-clip)"/>
  <circle class="c-rim" cx="50" cy="50" r="45" stroke-width="5" pathLength="100" transform="rotate(-90 50 50)"/>
  <circle class="c-ring" cx="50" cy="50" r="35.5" stroke-width="3" stroke-dasharray="0.1 7.2" transform-origin="50 50"/>
  <path class="c-j" d="M57 31 V58 Q57 70 46 70 Q38 70 35 63" stroke-width="7" pathLength="100"/>
  <circle class="c-flash" cx="50" cy="50" r="45"/>
</svg></div><i class="coin-sheen"></i></div>`;
const flip = q('.coin-flip'), spin = q('.coin-body'), halo = q('.coin-sheen');
const disc = root.querySelector<SVGElement>('.c-disc')!, rim = root.querySelector<SVGElement>('.c-rim')!, ring = root.querySelector<SVGElement>('.c-ring')!;
const jay = root.querySelector<SVGElement>('.c-j')!, flash = root.querySelector<SVGElement>('.c-flash')!, sheen = root.querySelector<SVGElement>('.c-sheen')!;

const ramp = (p: number, a: number, b: number) => { const x = Math.min(1, Math.max(0, (p - a) / (b - a))); return x * x * (3 - 2 * x); };
let minted = false;
function minting(p: number) {
  disc.style.transform = `scale(${0.12 + 0.88 * ramp(p, 0, 0.22)})`;
  disc.style.transformOrigin = '50% 50%';
  rim.style.strokeDashoffset = String(100 * (1 - ramp(p, 0.18, 0.5)));
  const r = ramp(p, 0.46, 0.72);
  ring.style.opacity = String(r);
  ring.style.transform = `rotate(${(1 - r) * 60}deg) scale(${0.82 + 0.18 * r})`;
  jay.style.strokeDashoffset = String(100 * (1 - ramp(p, 0.68, 0.96)));
  if (p >= 0.999 && !minted) {
    minted = true;
    // the die comes down: a stamp flash and a jolt
    void flash.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: 520, easing: 'ease-out', fill: 'forwards' });
    void spin.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.14)', offset: 0.3 }, { transform: 'scale(.96)', offset: 0.65 }, { transform: 'scale(1)' }], { duration: 480, easing: 'ease-out' });
    glint();
  }
}
/** A reflection crosses the face. */
function glint() {
  void sheen.animate([{ transform: 'translateX(0px)' }, { transform: 'translateX(130px)' }], { duration: 650, easing: 'cubic-bezier(.3, 0, .2, 1)' });
}

// ---------- the hero, in outline ----------
// Drawn twice: dim, and lit behind a window that rises with the progress. The window moves down
// and the lit drawing inside it moves up by the same amount, so only transforms animate.
let font: FontData | null = null, litTop = 0, litBottom = 0;
let floorY = 0, slotX = 0, slotY = 0;  // where the coin rests and where the slot stands (px, centre)
let R = 48;                            // coin radius, px
const px = ([x, y]: Pt): string => `${(((x + 1) / 2) * innerWidth).toFixed(1)} ${(((1 - y) / 2) * innerHeight).toFixed(1)}`;
const path = (pts: Pt[], close: boolean) => `M${pts.map(px).join(' L')}${close ? ' Z' : ''}`;
function drawOutline() {
  const parts = heroOutline(innerWidth / innerHeight, font);
  const view = `0 0 ${innerWidth} ${innerHeight}`;
  const svg = (lit: boolean) => parts.map((p) => `<g data-part="${p.id}">${
    p.faces.map((f) => (lit ? `<path class="glow" d="${path(f, true)}"/>` : '') + `<path class="face" d="${path(f, true)}"/>`).join('')}${
    p.lines.map((l) => (lit ? `<path class="glow" d="${path(l, false)}"/>` : '') + `<path class="line" d="${path(l, false)}"/>`).join('')}</g>`).join('');
  for (const [el, lit] of [[dimSvg, false], [litSvg, true]] as const) { el.setAttribute('viewBox', view); el.innerHTML = svg(lit); }
  // The light rises over everything drawn, bottom to top.
  const ys = parts.flatMap((p) => [...p.faces, ...p.lines].flat().map(([, y]) => ((1 - y) / 2) * innerHeight));
  litTop = Math.min(...ys); litBottom = Math.max(...ys);
  // The coin lives under the name: it rests on a floor there, the slot stands to the right.
  const name = parts.find((p) => p.id === 'name');
  const nx = name ? Math.min(...name.lines.flat().map(([x]) => ((x + 1) / 2) * innerWidth)) : ((HERO_NAME.x + 1) / 2) * innerWidth;
  const nr = name ? Math.max(...name.lines.flat().map(([x]) => ((x + 1) / 2) * innerWidth)) : nx + innerWidth * 0.25;
  const ny = name ? Math.max(...name.lines.flat().map(([, y]) => ((1 - y) / 2) * innerHeight)) : HERO_TEXT_BOTTOM * innerHeight;
  R = Math.round(Math.min(64, Math.max(36, innerWidth * 0.042)));
  coin.style.width = coin.style.height = `${R * 2}px`;
  floorY = ny + innerHeight * 0.05 + R;
  slotX = Math.min(nr, innerWidth - 40); slotY = floorY;
  slot.style.left = `${slotX}px`; slot.style.top = `${slotY}px`; slot.style.height = `${R * 2.1}px`;
  body.style.left = `${nx}px`;
  body.style.top = `${floorY + R + 22}px`;
  if (!c.dragging && c.resting) { c.x = Math.min(c.x, slotX - R - 24); c.y = floorY; }
}
const litAt = (p: number) => litBottom - p * (litBottom - litTop);
function showLight(p: number) {
  const y = litAt(p);
  litWin.style.transform = `translateY(${y}px)`;
  litSvg.style.transform = `translateY(${-y}px)`;
}

// ---------- caption ----------
let shown = -1;
function showNumber(n: number) {
  if (n === shown) return;
  shown = n;
  capNum.textContent = `${n}%`;
  root.setAttribute('aria-valuenow', String(n));
}

// ---------- progress: a smooth-damp spring, so bursts of progress turn into one steady rise ----------
let target = 0, pos = 0, vel = 0, last = performance.now();
let finished = false, waiting = false, inserting = false;
let arrive: (() => void) | null = null;
let glide: { from: number; to: number; anims: Animation[] } | null = null;   // see coast()

function render() {
  showLight(pos);
  minting(pos);
  showNumber(Math.round(pos * 100));
}

// ---------- the coin's physics ----------
// Position is its centre in screen px; it falls, bounces off the floor and walls, rolls without
// slipping, and can be grabbed and thrown.
const G = 2600, BOUNCE = 0.42, WALL = 0.55, ROLL = 1.1;
const c = { x: 0, y: -200, vx: 0, vy: 0, ang: 0, angv: 0, resting: false, dragging: false, idleAt: 0 };
let grab: { dx: number; dy: number; samples: { t: number; x: number; y: number }[] } | null = null;
let lastBounce = 0;
const inSlot = () => Math.abs(c.x - slotX) < R * 0.6 && Math.abs(c.y - slotY) < R * 0.9;

function squash(sy: number) {
  void flip.animate([{ transform: `scale(${2 - sy}, ${sy})` }, { transform: 'scale(1, 1)' }], { duration: 260, easing: 'cubic-bezier(.2, .8, .3, 1)' });
}
function sparks(x: number, y: number, n: number, up = true) {
  for (let i = 0; i < n; i++) {
    const s = document.createElement('i');
    s.className = 'coin-spark';
    s.style.left = `${x}px`; s.style.top = `${y}px`;
    root.append(s);
    const a = (up ? Math.PI * (0.1 + 0.8 * (i / Math.max(1, n - 1))) : Math.random() * Math.PI * 2) + (Math.random() - 0.5) * 0.4, d = R * (0.5 + Math.random() * 0.9);
    void s.animate([
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      { transform: `translate(${Math.cos(a) * d}px, ${-Math.sin(a) * d}px) scale(.3)`, opacity: 0 },
    ], { duration: 380 + Math.random() * 260, easing: 'cubic-bezier(.1, .7, .3, 1)', fill: 'forwards' }).finished.then(() => s.remove());
  }
}

function step(dt: number) {
  if (c.dragging || reduced) return;
  const wasResting = c.resting;
  c.vy += G * dt;
  c.x += c.vx * dt;
  c.y += c.vy * dt;
  c.ang += (c.resting ? c.vx / R : c.angv) * dt;   // rolling on the floor, free spin in the air
  // floor
  if (c.y > floorY) {
    c.y = floorY;
    if (c.vy > 120) {
      c.vy = -c.vy * BOUNCE;
      c.angv = c.vx / R;
      squash(0.84 + 0.12 * Math.min(1, 600 / Math.abs(c.vy)));
      if (performance.now() - lastBounce > 120) { sparks(c.x, floorY + R, Math.abs(c.vy) > 500 ? 7 : 3); lastBounce = performance.now(); }
    } else { c.vy = 0; c.resting = true; }
  } else c.resting = false;
  if (c.resting) {
    c.vx *= Math.exp(-dt * ROLL);
    if (Math.abs(c.vx) < 4) c.vx = 0;
    if (!wasResting) c.idleAt = performance.now();
  }
  // walls
  if (c.x < R) { c.x = R; c.vx = -c.vx * WALL; sparks(0, c.y, 3, false); }
  if (c.x > innerWidth - R) { c.x = innerWidth - R; c.vx = -c.vx * WALL; sparks(innerWidth, c.y, 3, false); }
  // the slot: once minted it takes the coin; before that the coin just clinks off it
  if (inSlot()) {
    if (waiting) { insert(); return; }
    if (c.vx > 0 || c.x > slotX - R) { c.x = slotX - R * 0.7; c.vx = -Math.max(220, Math.abs(c.vx)) * 0.6; c.vy = Math.min(c.vy, -260); c.resting = false; sparks(slotX, slotY, 5, false); slotClink(); }
  }
}
function slotClink() {
  void slot.animate([{ transform: 'translate(-50%, -50%) rotate(-5deg)' }, { transform: 'translate(-50%, -50%) rotate(-5deg) translateX(3px)', offset: 0.3 }, { transform: 'translate(-50%, -50%) rotate(-5deg)' }], { duration: 240, easing: 'ease-out' });
}
function place() {
  coin.style.transform = `translate(${(c.x - R).toFixed(1)}px, ${(c.y - R).toFixed(1)}px)`;
  spin.style.transform = `rotate(${c.ang.toFixed(3)}rad)`;
}

function tick(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (reduced) { pos = target; vel = 0; }
  else {
    // Brisker once finished, so the minting lands instead of creeping in.
    const w = 2 / (finished ? SMOOTH * 0.45 : SMOOTH), k = w * dt, e = 1 / (1 + k + 0.48 * k * k + 0.235 * k * k * k);
    const change = pos - target, temp = (vel + w * change) * dt;
    vel = (vel - w * temp) * e;
    pos = target + (change + temp) * e;
    if (pos > target) { pos = target; vel = 0; }   // never run ahead of real progress
  }
  if (glide) {
    // The glide owns the light; the number reads where it is on screen, and the coin keeps minting.
    const p = glide.anims[0].effect?.getComputedTiming().progress ?? 1;
    showNumber(Math.round((glide.from + (glide.to - glide.from) * p) * 100));
    minting(pos);
  } else render();
  if (!inserting) { step(dt); place(); idle(now); }
  if (arrive && target - pos < 0.002) { arrive(); arrive = null; }
  requestAnimationFrame(tick);
}

// ---------- idle life ----------
// The coin at rest wobbles and settles every so often and catches the light; the outlines breathe
// and a band of light wanders over them. Big moments (a bounce, a flick, the minting) stand out
// because the quiet in between is quiet.
let nextIdle = 0, nextSweep = 0;
function idle(now: number) {
  if (reduced) return;
  if (c.resting && !c.dragging && now > nextIdle) {
    nextIdle = now + 2200 + Math.random() * 2600;
    const r = Math.random();
    if (r < 0.45) {
      // a wobble that settles, like a dropped coin coming to rest
      void flip.animate([
        { transform: 'rotate3d(1, .3, 0, 0deg)' }, { transform: 'rotate3d(1, .3, 0, 28deg)', offset: 0.18 }, { transform: 'rotate3d(1, .3, 0, -18deg)', offset: 0.4 },
        { transform: 'rotate3d(1, .3, 0, 9deg)', offset: 0.62 }, { transform: 'rotate3d(1, .3, 0, -3deg)', offset: 0.82 }, { transform: 'rotate3d(1, .3, 0, 0deg)' },
      ], { duration: 1100, easing: 'ease-out' });
      setTimeout(glint, 180);
    } else if (r < 0.75) {
      // a hop on the spot, with a half turn (asking to be played with once it is ready)
      c.vy = -(waiting ? 620 : 380); c.resting = false; c.angv = (Math.random() < 0.5 ? -1 : 1) * 6;
    } else glint();
  }
  if (now > nextSweep) {
    nextSweep = now + 5000 + Math.random() * 4000;
    void sweep.animate([{ transform: 'translateX(-60%) skewX(-18deg)', opacity: 0 }, { opacity: 0.55, offset: 0.2 }, { opacity: 0.55, offset: 0.8 }, { transform: 'translateX(160%) skewX(-18deg)', opacity: 0 }], { duration: 2600, easing: 'ease-in-out' });
    void litSvg.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(1.35)', offset: 0.5 }, { filter: 'brightness(1)' }], { duration: 2600, easing: 'ease-in-out' });
  }
}

const play = (el: Element, frames: Keyframe[], ms: number, easing = 'cubic-bezier(.45, 0, .3, 1)', delay = 0) =>
  el.animate(frames, { duration: reduced ? 1 : ms, delay: reduced ? 0 : delay, easing, fill: 'forwards' }).finished;
const wait = (ms: number) => new Promise((r) => setTimeout(r, reduced ? 0 : ms));

// ---------- grab, drag, throw ----------
coin.addEventListener('pointerdown', (e) => {
  if (inserting || reduced) return;
  e.preventDefault();
  coin.setPointerCapture(e.pointerId);
  c.dragging = true; c.resting = false; c.vx = c.vy = 0;
  grab = { dx: e.clientX - c.x, dy: e.clientY - c.y, samples: [{ t: performance.now(), x: e.clientX, y: e.clientY }] };
  root.classList.add('dragging');
  flip.getAnimations().forEach((a) => a.cancel());
});
coin.addEventListener('pointermove', (e) => {
  if (!grab) return;
  c.x = e.clientX - grab.dx; c.y = e.clientY - grab.dy;
  c.ang += (e.movementX || 0) / R * 0.5;   // it turns a little in the hand
  grab.samples.push({ t: performance.now(), x: e.clientX, y: e.clientY });
  if (grab.samples.length > 6) grab.samples.shift();
  slot.classList.toggle('hot', waiting && inSlot());
  place();
});
const letGo = (e: PointerEvent) => {
  if (!grab) return;
  const s = grab.samples, a = s[0], b = s[s.length - 1];
  const dt = Math.max(16, b.t - a.t) / 1000;
  const moved = Math.hypot(e.clientX - (c.x + grab.dx), e.clientY - (c.y + grab.dy)) + Math.hypot(b.x - a.x, b.y - a.y);
  grab = null; c.dragging = false;
  root.classList.remove('dragging');
  slot.classList.remove('hot');
  if (moved < 6) {
    // a tap: when minted, that is the way in; before, a little hop
    if (waiting) { tossToSlot(); return; }
    c.vy = -420; c.angv = 5;
    return;
  }
  // thrown: it keeps the hand's speed
  c.vx = (b.x - a.x) / dt; c.vy = (b.y - a.y) / dt;
  const speed = Math.hypot(c.vx, c.vy);
  if (speed > 2600) { c.vx *= 2600 / speed; c.vy *= 2600 / speed; }
  c.angv = c.vx / R + (Math.random() - 0.5) * 4;
  if (waiting && inSlot()) insert();
};
coin.addEventListener('pointerup', letGo);
coin.addEventListener('pointercancel', letGo);
coin.addEventListener('keydown', (e) => { if (waiting && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); tossToSlot(); } });

/** The coin hops from where it is into the slot by itself (a click, or the keyboard). */
function tossToSlot() {
  if (!waiting || inserting) return;
  const dx = slotX - c.x, t = 0.55;
  c.resting = false; c.dragging = false;
  c.vx = dx / t; c.vy = -(G * t) / 2 - (floorY - c.y) / t; c.angv = c.vx / R;
  // whatever the arc does, it lands in the slot
  setTimeout(() => { if (waiting && !inserting) { c.x = slotX; c.y = slotY; insert(); } }, t * 1000 + 60);
}

// ---------- intro: the blank disc drops in from the top ----------
function dropIn() {
  c.x = Math.min(innerWidth * 0.5, slotX - R * 3); c.y = -R * 2; c.vx = 0; c.vy = 0; c.angv = 2.2;
  coin.style.opacity = '1';
  if (reduced) { c.y = floorY; c.resting = true; place(); return; }
}

// ---------- the coin is minted: it is the way in ----------
const onEnter: (() => void)[] = [], onOpen: (() => void)[] = [];
function waitForCoin() {
  waiting = true;
  root.classList.add('ready');
  capText.textContent = 'Flick the coin into the slot';
  capNum.textContent = '';
  coin.tabIndex = 0;
  coin.setAttribute('role', 'button');
  coin.setAttribute('aria-label', 'Put the coin in the slot to enter');
  void slot.animate([{ transform: 'translate(-50%, -50%) rotate(-5deg) scale(1)' }, { transform: 'translate(-50%, -50%) rotate(-5deg) scale(1.15, 1.08)', offset: 0.4 }, { transform: 'translate(-50%, -50%) rotate(-5deg) scale(1)' }], { duration: 500, easing: 'ease-out' });
  nextIdle = performance.now() + 900;
}

/** The coin goes in, and we enter: the slot flares, the outlines flood with light, the dark panel
 *  swings down like a trapdoor and the machines drop into their outlines behind it. */
function insert() {
  if (!waiting || inserting) return;
  inserting = true; waiting = false;
  root.classList.remove('ready');
  coin.removeAttribute('tabindex');
  onEnter.forEach((f) => f());          // still inside the visitor's click: sound may start now
  void (async () => {
    // edge-on and down into the slit
    const hop = 520, ease = 'cubic-bezier(.4, 0, .3, 1)';
    void play(coin, [{ transform: `translate(${c.x - R}px, ${c.y - R}px)` }, { transform: `translate(${slotX - R}px, ${slotY - R - R * 0.6}px)`, offset: 0.5 }, { transform: `translate(${slotX - R}px, ${slotY - R + R * 0.9}px)` }], hop, ease);
    void play(flip, [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(84deg)', offset: 0.5 }, { transform: 'rotateY(88deg)' }], hop, ease);
    void play(spin, [{ transform: `rotate(${c.ang}rad)` }, { transform: `rotate(${c.ang + 1.2}rad)` }], hop, ease);
    void play(halo, [{ opacity: 1 }, { opacity: 0, offset: 0.4 }, { opacity: 0 }], hop);
    await wait(hop * 0.6);
    sparks(slotX, slotY - R * 0.5, 9);
    void play(slot, [{ transform: 'translate(-50%, -50%) rotate(-5deg)' }, { transform: 'translate(-50%, -50%) rotate(-5deg) scale(1.3, 1.1)', offset: 0.3 }, { transform: 'translate(-50%, -50%) rotate(-5deg)' }], 360, 'ease-out');
    void play(coin, [{ opacity: 1 }, { opacity: 0 }], 200, 'ease-in', hop * 0.35);
    await wait(hop * 0.4);

    // the outlines flood with light; the caption goes
    void play(litWin, [{ transform: `translateY(${litAt(1)}px)` }, { transform: 'translateY(0px)' }], 380, 'ease-out');
    void play(litSvg, [{ transform: `translateY(${-litAt(1)}px)` }, { transform: 'translateY(0px)' }], 380, 'ease-out');
    void play(litSvg, [{ filter: 'brightness(1)' }, { filter: 'brightness(2.2)', offset: 0.25 }, { filter: 'brightness(1)' }], 900, 'ease-out');
    void play(body, [{ opacity: 1 }, { opacity: 0, transform: 'translateY(6px)' }], 300, 'ease-out');
    void play(slot, [{ opacity: 1 }, { opacity: 0 }], 300, 'ease-out');
    await wait(220);
    root.classList.add('open');
    onOpen.forEach((f) => f());
    // the trapdoor: the dark panel falls away from the top, showing the arcade behind
    await play(bg, [
      { transform: 'perspective(1400px) rotateX(0deg)', opacity: 1, easing: 'cubic-bezier(.55, 0, .9, .4)' },
      { transform: 'perspective(1400px) rotateX(-64deg)', opacity: 0.85, offset: 0.55, easing: 'cubic-bezier(.3, .4, .5, 1)' },
      { transform: 'perspective(1400px) rotateX(-92deg)', opacity: 0 },
    ], 1050, 'linear');
    // The name's outline gives way as its 3D letters stamp in.
    await wait(1100);
    root.querySelectorAll('[data-part="name"]').forEach((g) => void play(g, [{ opacity: 1 }, { opacity: 0 }], 700, 'ease-in-out'));
    await wait(1600);
    root.remove();
  })();
}

export const loading = {
  report(s: LoadStage, frac: number) {
    if (finished) return;
    const [lo, hi] = RANGE[s];
    target = Math.max(target, lo + (hi - lo) * Math.min(1, Math.max(0, frac)));
  },

  // Hand the light to the compositor right before a known main-thread stall (evaluating the big
  // 3D bundle, compiling shaders), so it glides on instead of freezing. `through` lets it glide
  // ahead to the end of a stage that is about to run in short, choppy frames.
  coast(ms = 900, through?: LoadStage) {
    if (reduced || finished) return;
    if (through) target = Math.max(target, RANGE[through][1]);
    // Start from where the light is on screen, which may be partway through an earlier glide.
    let from = pos;
    if (glide) {
      const p = glide.anims[0].effect?.getComputedTiming().progress;
      if (p != null) from = glide.from + (glide.to - glide.from) * p;
      glide.anims.forEach((a) => a.cancel());
    }
    pos = target; vel = 0;
    const opts = { duration: ms, easing: 'cubic-bezier(.25, .6, .35, 1)' };
    const g = {
      from, to: pos,
      anims: [
        litWin.animate([{ transform: `translateY(${litAt(from)}px)` }, { transform: `translateY(${litAt(pos)}px)` }], opts),
        litSvg.animate([{ transform: `translateY(${-litAt(from)}px)` }, { transform: `translateY(${-litAt(pos)}px)` }], opts),
      ],
    };
    glide = g;
    g.anims[0].onfinish = () => { if (glide === g) { glide = null; render(); } };
  },

  // Everything is ready: the minting completes and the coin waits to be put in.
  finish() {
    if (finished) return;
    loading.report('shadows', 1);
    finished = true;
    void (async () => {
      await glide?.anims[0].finished.catch(() => {});
      await new Promise<void>((r) => { arrive = r; });
      render();
      waitForCoin();
    })();
  },

  /** Called inside the visitor's click that puts the coin in (so audio may start). */
  onEnter(fn: () => void) { onEnter.push(fn); },
  /** Called as the screen opens. */
  onOpen(fn: () => void) { onOpen.push(fn); },

  /** A machine has landed in its outline: the outline flashes and goes. */
  landed(machine: string) {
    root.querySelectorAll(`[data-part="${machine}"]`).forEach((g) => void play(g, [{ opacity: 1 }, { opacity: 1, offset: 0.2 }, { opacity: 0 }], 520, 'ease-out'));
  },

  fail() {
    root.classList.add('jammed');
    retry.hidden = false;
    retry.onclick = () => location.reload();
  },
};

drawOutline();
void fetch('/fonts/hero-display.json').then((r) => r.json()).then((f: FontData) => { font = f; if (!inserting) { drawOutline(); render(); } }).catch(() => {});
window.addEventListener('resize', () => { if (!inserting) drawOutline(); if (!glide) render(); });
dropIn();
render();
requestAnimationFrame(tick);
