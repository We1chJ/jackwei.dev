// The loading screen. Plain DOM (markup in index.html), so it runs before React and three.js
// arrive. A black screen with one coin in the middle: it fills with light from the bottom up as
// the site loads. Once full, put it in the slot under it (drag it down, click it, or press Enter).
// Then the hero draws itself in wireframe, the lines flowing out from the slot (the name to the
// left, the machines to the right, each rising from its base), the floor line lights up yellow,
// and the black opens along it, the floor sliding down and the wall lifting away, onto the arcade
// as the machines drop into their outlines.

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
const coin = q('.coin'), slot = q('.loader-slot'), caption = q('.loader-caption'), capText = q('.cap-text'), retry = q<HTMLButtonElement>('.loader-retry');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- the coin: a disc that fills with light ----------
// Two faces drawn on top of each other, the unlit one and the lit one; the lit one is clipped
// to the level, so filling only ever changes one clip and nothing shifts underneath.
const face = (cls: string, id: string) => `<svg class="coin-face ${cls}" viewBox="0 0 100 100" fill="none" stroke-linecap="round" stroke-linejoin="round">
<defs>
  <radialGradient id="shine-${id}" cx="36%" cy="30%" r="80%"><stop offset="0" stop-color="#FFF7DF"/><stop offset=".55" stop-color="#FFE3AE"/><stop offset="1" stop-color="#E2BA7A"/></radialGradient>
  <path id="top-${id}" d="M14 50 A36 36 0 0 1 86 50"/>
  <path id="bot-${id}" d="M8 50 A42 42 0 0 0 92 50"/>
</defs>
<circle class="c-reed" cx="50" cy="50" r="47.6" stroke-width="2.6" stroke-dasharray=".9 1.65" stroke-linecap="butt"/>
<circle class="c-disc" cx="50" cy="50" r="45"/>
<circle class="c-inner" cx="50" cy="50" r="32.5"/>
<text class="c-text"><textPath href="#top-${id}" startOffset="50%" text-anchor="middle">JACK WEI</textPath></text>
<text class="c-text"><textPath href="#bot-${id}" startOffset="50%" text-anchor="middle">ARCADE</textPath></text>
<path class="c-star" d="M11 46.5 L12 49 L14.5 50 L12 51 L11 53.5 L10 51 L7.5 50 L10 49 Z"/>
<path class="c-star" d="M89 46.5 L90 49 L92.5 50 L90 51 L89 53.5 L88 51 L85.5 50 L88 49 Z"/>
<path class="c-j" d="M57 31 V58 Q57 70 46 70 Q38 70 35 63" stroke-width="7" transform="translate(50 50) scale(1.3) translate(-50 -50)"/>
${cls === 'coin-lit' ? '<rect class="c-sheen" x="-30" y="-10" width="18" height="120"/>' : ''}
</svg>`;
coin.innerHTML = `<div class="coin-flip"><div class="coin-body">${face('coin-dim', 'd')}${face('coin-lit', 'l')}<i class="coin-level"></i></div><i class="coin-halo"></i></div>`;
const body = q('.coin-body'), lit = root.querySelector<SVGSVGElement>('.coin-lit')!, level = q('.coin-level');

let size = 112;                        // coin diameter, px
let floorY = innerHeight * 0.85;       // where the machines stand, px from the top
let font: FontData | null = null;

// The lit face is clipped from the top down to the level; a bright line rides on the level.
const clipAt = (p: number) => `inset(${((1 - p) * 100).toFixed(3)}% 0 0 0)`;
const lineAt = (p: number) => `translateY(${(Math.round(size * (1 - p) * 2) / 2).toFixed(1)}px)`;
let shown = -1;
function showLevel(p: number) {
  lit.style.clipPath = clipAt(p);
  level.style.transform = lineAt(p);
  const n = Math.round(p * 100);
  if (n !== shown) { shown = n; root.setAttribute('aria-valuenow', String(n)); }
}

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
let glide: { from: number; to: number; anims: Animation[] } | null = null;   // see coast()

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
  if (!glide) showLevel(pos);              // during a glide the compositor owns the level
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
  waiting = true;
  root.classList.add('ready');
  capText.textContent = 'Insert coin';
  coin.tabIndex = 0;
  coin.setAttribute('role', 'button');
  coin.setAttribute('aria-label', 'Put the coin in the slot to enter');
  void once(body, [{ transform: 'scale(1)' }, { transform: 'scale(1.1)', offset: 0.4 }, { transform: 'scale(1)' }], 520, 'ease-out');
}

// Drag it down into the slot; it goes in as soon as it reaches the slit. Let go early and it
// springs back. A tap, or Enter, drops it in by itself.
let drag: { x0: number; y0: number } | null = null;
const off = { x: 0, y: 0 };            // the coin's offset in hand, px
const reach = () => coin.getBoundingClientRect().bottom >= slot.getBoundingClientRect().top - 1;
coin.addEventListener('pointerdown', (e) => {
  if (!waiting || inserting) return;
  e.preventDefault();
  coin.setPointerCapture(e.pointerId);
  drag = { x0: e.clientX - off.x, y0: e.clientY - off.y };
  root.classList.add('dragging');
});
coin.addEventListener('pointermove', (e) => {
  if (!drag || inserting) return;
  off.x = (e.clientX - drag.x0) * 0.35;
  off.y = Math.max(-14, e.clientY - drag.y0);
  coin.style.transform = `translate(${off.x.toFixed(1)}px, ${off.y.toFixed(1)}px)`;
  if (reach()) { slot.classList.add('hot'); insert(); }
});
const letGo = (e: PointerEvent) => {
  if (!drag) return;
  const moved = Math.hypot(e.clientX - drag.x0 - off.x, e.clientY - drag.y0 - off.y) + Math.hypot(off.x, off.y);
  drag = null;
  root.classList.remove('dragging');
  if (inserting) return;
  if (moved < 6) { insert(); return; }
  // not far enough: it springs back
  const a = coin.animate([{ transform: `translate(${off.x}px, ${off.y}px)` }, { transform: 'translate(0px, 0px)' }], { duration: reduced ? 1 : 480, easing: 'cubic-bezier(.2, 1.5, .35, 1)' });
  off.x = off.y = 0;
  coin.style.transform = '';
  void a;
};
coin.addEventListener('pointerup', letGo);
coin.addEventListener('pointercancel', letGo);
coin.addEventListener('keydown', (e) => { if (waiting && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); insert(); } });

/** The coin drops into the slit and we enter: the slot flashes, the hero draws itself in
 *  wireframe, the floor line lights up, and the black opens along it onto the arcade. */
function insert() {
  if (!waiting || inserting) return;
  inserting = true; waiting = false;
  root.classList.remove('ready');
  root.classList.add('inserting');
  coin.removeAttribute('tabindex');
  onEnter.forEach((f) => f());          // still inside the visitor's gesture: sound may start now
  void (async () => {
    // down into the slit: it moves behind the slot's edge as it goes
    const cr = coin.getBoundingClientRect(), sr = slot.getBoundingClientRect();
    const gap = Math.max(0, sr.top + 1 - cr.bottom), D = gap + cr.height;
    const N = 18, frames: Keyframe[] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, u = t * t * (1.6 - 0.6 * t);   // gathering speed as it falls
      const y = D * u, hidden = Math.min(1, Math.max(0, (y - gap) / cr.height));
      frames.push({ transform: `translate(${(off.x * (1 - u)).toFixed(1)}px, ${(off.y + y).toFixed(1)}px)`, clipPath: `inset(0 0 ${(hidden * 100).toFixed(2)}% 0)` });
    }
    const ms = 300 + gap * 0.6;
    void play(coin, frames, ms, 'linear');
    await wait(ms * Math.sqrt(gap / D) * 0.9);
    slot.classList.add('hot');
    void once(slot, [{ transform: 'scaleX(1)' }, { transform: 'scaleX(1.06)', offset: 0.4 }, { transform: 'scaleX(1)' }], 320, 'ease-out');
    void play(caption, [{ opacity: 1 }, { opacity: 0 }], 320, 'ease-out');
    await wait(ms - ms * Math.sqrt(gap / D) * 0.9);
    setTimeout(() => slot.classList.remove('hot'), 200);
    void play(slot, [{ opacity: 1 }, { opacity: 0 }], 500, 'ease-out', 500);

    // the hero draws itself
    const drawn = drawIn();
    await wait(drawn * 0.8);
    // the floor line lights up...
    void play(horizon, [{ transform: 'scaleX(0)', opacity: 0 }, { transform: 'scaleX(1)', opacity: 1 }], 460, 'cubic-bezier(.2, .7, .2, 1)');
    await wait(340);
    // ...and the black opens along it: the floor slides down, the wall lifts away
    root.classList.add('open');
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

  // Hand the level to the compositor right before a known main-thread stall (evaluating the big
  // 3D bundle, compiling shaders), so it glides on instead of freezing. `through` lets it glide
  // ahead to the end of a stage that is about to run in short, choppy frames.
  coast(ms = 900, through?: LoadStage) {
    if (reduced || finished) return;
    if (through) target = Math.max(target, RANGE[through][1]);
    // Start from where the level is on screen, which may be partway through an earlier glide.
    let from = pos;
    if (glide) {
      const p = glide.anims[0].effect?.getComputedTiming().progress;
      if (p != null) from = glide.from + (glide.to - glide.from) * p;
      glide.anims.forEach((a) => a.cancel());
    }
    pos = target; vel = 0;
    // They hold their end value until the level is written back, so nothing flashes in between.
    const opts: KeyframeAnimationOptions = { duration: ms, easing: 'cubic-bezier(.25, .6, .35, 1)', fill: 'forwards' };
    const g = {
      from, to: pos,
      anims: [
        lit.animate([{ clipPath: clipAt(from) }, { clipPath: clipAt(pos) }], opts),
        level.animate([{ transform: lineAt(from) }, { transform: lineAt(pos) }], opts),
      ],
    };
    glide = g;
    g.anims[0].onfinish = () => { if (glide === g) { glide = null; showLevel(pos); g.anims.forEach((a) => a.cancel()); } };
  },

  // Everything is ready: the coin fills to the brim and waits to be put in.
  finish() {
    if (finished) return;
    loading.report('shadows', 1);
    finished = true;
    void (async () => {
      await glide?.anims[0].finished.catch(() => {});
      await new Promise<void>((r) => { arrive = r; });
      showLevel(pos);
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
window.addEventListener('resize', () => { if (!inserting) { drawOutline(); if (!glide) showLevel(pos); } });
showLevel(0);
root.classList.add('on');
void once(body, [{ transform: 'scale(.7)' }, { transform: 'scale(1)' }], 700, 'cubic-bezier(.2, .9, .3, 1.15)');
requestAnimationFrame(tick);
