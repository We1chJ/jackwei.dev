// The loading screen. Plain DOM (markup in index.html), so it runs before React and three.js
// arrive. Everything is drawn in one language, warm light on black: the hero scene as line-art
// (the three machines and the name, projected with the hero camera, so each outline lies exactly
// where its machine will land) fills with light from the bottom up as loading progresses, and a
// line-art coin falls onto a sloped hairline under the name and rolls along it with the progress
// (a critically damped spring: never stop-and-go). Once loaded, click the coin or drag it into
// the slot: the outlines flare, the dark lifts, and each machine drops into its own outline.

import { HERO_NAME, HERO_TEXT_BOTTOM } from './arcade/layout';
import type { FontData } from './arcade/heroName';
import { heroOutline, type Pt } from './arcade/silhouette';

export type LoadStage = 'download' | 'compile' | 'settle' | 'shadows';

// Share of the bar each stage owns, in the order they happen.
const RANGE: Record<LoadStage, [number, number]> = {
  download: [0, 0.7], compile: [0.7, 0.8], settle: [0.8, 0.86], shadows: [0.86, 1],
};
const SMOOTH = 0.42;                   // spring smoothing time, seconds
const TRACK = 200, COIN_R = 13;        // px (match CSS)
const SLOT_X = TRACK + 19;             // slot centre from the track start (CSS: 100% + 14px, 10px wide)

const root = document.getElementById('loader')!;
const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
const body = q('.loader-body'), row = q('.loader-row'), fill = q('.loader-fill'), glow = q('.loader-glow');
const coin = q('.coin'), slot = q('.loader-slot'), retry = q<HTMLButtonElement>('.loader-retry');
const capText = q('.cap-text'), capNum = q('.cap-num'), bg = q('.loader-bg');
const dimSvg = root.querySelector<SVGSVGElement>('.outline-dim')!, litSvg = root.querySelector<SVGSVGElement>('.outline-lit')!, litWin = q('.outline-window');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- the coin, in line-art like everything else: rim, beaded ring, a J ----------
const face = `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="50" cy="50" r="45" stroke-width="5"/>
  <circle cx="50" cy="50" r="35.5" stroke-width="3" stroke-dasharray="0.1 7.2" opacity=".85"/>
  <path d="M57 31 V58 Q57 70 46 70 Q38 70 35 63" stroke-width="7"/>
</svg>`;
coin.innerHTML = `<div class="coin-drop"><div class="coin-flip"><div class="coin-body"><span class="coin-face">${face}</span></div></div><i class="coin-sheen"></i></div>`;
const drop = q('.coin-drop'), flip = q('.coin-flip'), spin = q('.coin-body'), sheen = q('.coin-sheen');

// ---------- the hero, in outline ----------
// Drawn twice: dim, and lit behind a window that rises with the progress. The window moves down
// and the lit drawing inside it moves up by the same amount, so only transforms animate.
let font: FontData | null = null, litTop = 0, litBottom = 0;
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
  // The coin's line sits just under the name, aligned with its left edge.
  const name = parts.find((p) => p.id === 'name');
  const nx = name ? Math.min(...name.lines.flat().map(([x]) => ((x + 1) / 2) * innerWidth)) : ((HERO_NAME.x + 1) / 2) * innerWidth;
  const ny = name ? Math.max(...name.lines.flat().map(([, y]) => ((1 - y) / 2) * innerHeight)) : HERO_TEXT_BOTTOM * innerHeight;
  body.style.left = `${nx}px`;
  body.style.top = `${ny + innerHeight * 0.05}px`;
}
const litAt = (p: number) => litBottom - p * (litBottom - litTop);
function showLight(p: number) {
  const y = litAt(p);
  litWin.style.transform = `translateY(${y}px)`;
  litSvg.style.transform = `translateY(${-y}px)`;
}
drawOutline();
void fetch('/fonts/hero-display.json').then((r) => r.json()).then((f: FontData) => { font = f; if (!inserting) { drawOutline(); render(); } }).catch(() => {});

// ---------- caption ----------
let shown = -1;
function showNumber(n: number) {
  if (n === shown) return;
  shown = n;
  capNum.textContent = `${n}%`;
  root.setAttribute('aria-valuenow', String(n));
}

let target = 0, pos = 0, vel = 0, last = performance.now();
let landed = reduced, finished = false, rolling = true;
let arrive: (() => void) | null = null;
let glide: { from: number; to: number; anims: Animation[] } | null = null;   // see coast()

// The coin rolls without slipping, so its turn follows the distance travelled.
const along = (p: number) => `translateX(${p * TRACK}px)`;
const turned = (p: number, extra = 0) => `rotate(${(p * TRACK) / COIN_R + extra}rad)`;

function render() {
  showLight(pos);
  fill.style.transform = `scaleX(${pos})`;
  coin.style.transform = along(pos);
  spin.style.transform = turned(pos);
  showNumber(Math.round(pos * 100));
}

// Smooth-damp spring: continuous speed, so bursts of progress turn into one steady roll.
function tick(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (reduced) { pos = target; vel = 0; }
  else if (landed) {
    // Brisker once finished, so the coin rolls home instead of creeping in.
    const w = 2 / (finished ? SMOOTH * 0.45 : SMOOTH), k = w * dt, e = 1 / (1 + k + 0.48 * k * k + 0.235 * k * k * k);
    const change = pos - target, temp = (vel + w * change) * dt;
    vel = (vel - w * temp) * e;
    pos = target + (change + temp) * e;
    if (pos > target) { pos = target; vel = 0; }   // never run ahead of real progress
  }
  if (glide) {
    // The glide owns the line and coin; the number reads where the line is on screen.
    const p = glide.anims[0].effect?.getComputedTiming().progress ?? 1;
    showNumber(Math.round((glide.from + (glide.to - glide.from) * p) * 100));
  } else render();
  if (arrive && landed && target - pos < 0.002) { arrive(); arrive = null; }
  if (rolling) requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

const play = (el: Element, frames: Keyframe[], ms: number, easing = 'cubic-bezier(.45, 0, .3, 1)', delay = 0) =>
  el.animate(frames, { duration: reduced ? 1 : ms, delay: reduced ? 0 : delay, easing, fill: 'forwards' }).finished;
const wait = (ms: number) => new Promise((r) => setTimeout(r, reduced ? 0 : ms));

// ---------- intro: the coin falls from the top of the screen onto the line ----------
const FALL = 1500, IMPACT = 0.5;     // ms, and the share of it spent falling
async function intro() {
  coin.style.opacity = '1';
  if (reduced) { sheen.style.opacity = '1'; return; }
  const height = row.getBoundingClientRect().bottom + 40;
  const fall = (y: number, s = 1): Keyframe => ({ transform: `translateY(${y}px) scale(${s}, ${2 - s})` });
  const done = drop.animate([
    { ...fall(-height), easing: 'cubic-bezier(.5, 0, 1, .6)' },            // gravity
    { ...fall(0, 1.06), offset: IMPACT, easing: 'cubic-bezier(.1, .7, .3, 1)' },
    { ...fall(-22), offset: 0.68, easing: 'cubic-bezier(.6, 0, 1, .6)' },    // first bounce
    { ...fall(0, 1.03), offset: 0.82, easing: 'cubic-bezier(.1, .7, .3, 1)' },
    { ...fall(-6), offset: 0.9, easing: 'cubic-bezier(.6, 0, 1, .6)' },      // second, smaller
    { ...fall(0), offset: 0.97 },
    fall(0),
  ], { duration: FALL, fill: 'forwards' }).finished;
  // Tumbling end over end on the way down, landing face-on; a little rock as it settles.
  void flip.animate([
    { transform: 'rotate3d(1, .22, 0, -1260deg)', easing: 'cubic-bezier(.2, .5, .5, 1)' },
    { transform: 'rotate3d(1, .22, 0, -14deg)', offset: IMPACT },
    { transform: 'rotate3d(1, .22, 0, 9deg)', offset: 0.68 },
    { transform: 'rotate3d(1, .22, 0, -3deg)', offset: 0.85 },
    { transform: 'rotate3d(1, .22, 0, 0deg)' },
  ], { duration: FALL, fill: 'forwards' });
  void sheen.animate([{ opacity: 0 }, { opacity: 0, offset: IMPACT - 0.08 }, { opacity: 1 }], { duration: FALL * 0.75, fill: 'forwards' });

  // On impact: the line dips like a taut string and a few sparks fly.
  setTimeout(() => {
    void row.animate([
      { transform: 'rotate(5deg)' }, { transform: 'rotate(5deg) translateY(4px)', offset: 0.18 },
      { transform: 'rotate(5deg) translateY(-1.5px)', offset: 0.5 }, { transform: 'rotate(5deg) translateY(.5px)', offset: 0.75 }, { transform: 'rotate(5deg)' },
    ], { duration: 520, easing: 'ease-out' });
    for (let i = 0; i < 7; i++) {
      const s = document.createElement('i');
      s.className = 'coin-spark';
      row.append(s);
      const a = Math.PI * (0.12 + 0.76 * (i / 6)) + (Math.random() - 0.5) * 0.3, d = 16 + Math.random() * 16;
      void s.animate([
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: `translate(${Math.cos(a) * d}px, ${-Math.sin(a) * d * 0.8}px) scale(.3)`, opacity: 0 },
      ], { duration: 420 + Math.random() * 200, easing: 'cubic-bezier(.1, .7, .3, 1)', fill: 'forwards' }).finished.then(() => s.remove());
    }
  }, FALL * IMPACT);

  await done;
  landed = true;
}
void intro();

// ---------- the coin is the way in: click it, or drag it into the slot ----------
let waiting = false, inserting = false;
let drag: null | { x0: number; y0: number; lx: number; ly: number } = null;
const onEnter: (() => void)[] = [], onOpen: (() => void)[] = [];
const TILT = (5 * Math.PI) / 180;                      // the line's slope (matches CSS)
const nearSlot = (lx: number, ly: number) => Math.hypot(lx - (SLOT_X - TRACK), ly + 4) < 26;

function waitForCoin() {
  // Let go of the intro's held animations so the coin can be moved directly.
  for (const el of [drop, flip, sheen]) el.getAnimations().forEach((a) => a.cancel());
  sheen.style.opacity = '1';
  waiting = true;
  root.classList.add('ready');
  capText.textContent = 'Click the coin, or drag it into the slot';
  capNum.textContent = '';
  coin.tabIndex = 0;
  coin.setAttribute('role', 'button');
  coin.setAttribute('aria-label', 'Put the coin in the slot to enter');
  // Every so often it hops on the spot, asking to be played with.
  const nudge = () => {
    if (!waiting) return;
    if (!drag) {
      void drop.animate([{ transform: 'none' }, { transform: 'translateY(-9px)', offset: 0.35 }, { transform: 'none', offset: 0.7 }, { transform: 'translateY(-2px)', offset: 0.85 }, { transform: 'none' }], { duration: 560, easing: 'ease-out' });
      void spin.animate([{ transform: turned(1) }, { transform: turned(1, 0.5), offset: 0.5 }, { transform: turned(1) }], { duration: 560, easing: 'ease-in-out' });
    }
    setTimeout(nudge, 2400);
  };
  setTimeout(nudge, reduced ? 1e9 : 900);
}

coin.addEventListener('pointerdown', (e) => {
  if (!waiting) return;
  e.preventDefault();
  drag = { x0: e.clientX, y0: e.clientY, lx: 0, ly: 0 };
  coin.setPointerCapture(e.pointerId);
  root.classList.add('dragging');
});
coin.addEventListener('pointermove', (e) => {
  if (!drag) return;
  // Screen delta into the sloped row's own frame.
  const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
  drag.lx = dx * Math.cos(TILT) + dy * Math.sin(TILT);
  drag.ly = -dx * Math.sin(TILT) + dy * Math.cos(TILT);
  coin.style.transform = `translateX(${TRACK + drag.lx}px)`;
  drop.style.transform = `translateY(${drag.ly}px)`;
  slot.classList.toggle('hot', nearSlot(drag.lx, drag.ly));
});
const letGo = () => {
  if (!drag) return;
  const { lx, ly } = drag;
  drag = null;
  root.classList.remove('dragging');
  slot.classList.remove('hot');
  if (Math.hypot(lx, ly) < 5 || nearSlot(lx, ly)) { insert(lx, ly); return; }
  // Dropped somewhere else: it rolls back to the end of the line.
  coin.style.transform = along(1); drop.style.transform = '';
  void coin.animate([{ transform: `translateX(${TRACK + lx}px)` }, { transform: along(1) }], { duration: 420, easing: 'cubic-bezier(.3, .7, .3, 1)' });
  void spin.animate([{ transform: turned(1, lx / COIN_R) }, { transform: turned(1) }], { duration: 420, easing: 'cubic-bezier(.3, .7, .3, 1)' });
  void drop.animate([{ transform: `translateY(${ly}px)` }, { transform: 'none', offset: 0.7 }, { transform: 'translateY(-3px)', offset: 0.85 }, { transform: 'none' }], { duration: 420, easing: 'ease-in' });
};
coin.addEventListener('pointerup', letGo);
coin.addEventListener('pointercancel', letGo);
coin.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); insert(0, 0); } });

/** The coin goes in (from where it was let go, relative to the end of the line), and we enter. */
function insert(lx: number, ly: number) {
  if (!waiting || inserting) return;
  inserting = true; waiting = false;
  root.classList.remove('ready');
  coin.removeAttribute('tabindex');
  onEnter.forEach((f) => f());          // still inside the visitor's click: sound may start now
  coin.style.transform = ''; drop.style.transform = '';
  void (async () => {
    // Up and over, turning edge-on (showing its thickness) above the slot, and down into it.
    const hop = 700, ease = 'cubic-bezier(.4, 0, .3, 1)', apex = Math.min(-30, ly - 12);
    void play(coin, [{ transform: `translateX(${TRACK + lx}px)` }, { transform: `translateX(${SLOT_X}px)`, offset: 0.6 }, { transform: `translateX(${SLOT_X}px)` }], hop, ease);
    void play(spin, [{ transform: turned(1, lx / COIN_R) }, { transform: turned(1, 1.6), offset: 0.6 }, { transform: turned(1, 1.6) }], hop, ease);
    void play(flip, [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(80deg)', offset: 0.55 }, { transform: 'rotateY(84deg)' }], hop, ease);
    void play(sheen, [{ opacity: 1 }, { opacity: 0, offset: 0.4 }, { opacity: 0 }], hop);
    void play(drop, [
      { transform: `translateY(${ly}px)`, easing: 'cubic-bezier(.2, .7, .4, 1)' },
      { transform: `translateY(${apex}px)`, offset: 0.42, easing: 'cubic-bezier(.6, 0, 1, .7)' },
      { transform: 'translateY(-6px)', offset: 0.7, opacity: 1 },
      { transform: 'translateY(16px)', opacity: 0 },
    ], hop, 'linear');
    await wait(hop * 0.72);
    void play(slot, [{ transform: 'rotate(-5deg)' }, { transform: 'rotate(-5deg) scale(1.12, 1.06)', offset: 0.3 }, { transform: 'rotate(-5deg)' }], 360, 'ease-out');
    await play(glow, [{ opacity: 0 }, { opacity: 1, offset: 0.35 }, { opacity: 0.85 }], 300, 'ease-out');

    // The outlines flare to full light, the dark lifts off the scene, and the machines drop in
    // (each into its own outline: see landed()).
    void play(litWin, [{ transform: `translateY(${litAt(1)}px)` }, { transform: 'translateY(0px)' }], 380, 'ease-out');
    void play(litSvg, [{ transform: `translateY(${-litAt(1)}px)` }, { transform: 'translateY(0px)' }], 380, 'ease-out');
    void play(body, [{ opacity: 1 }, { opacity: 0, transform: 'translateY(6px)' }], 420, 'ease-out');
    await wait(260);
    root.classList.add('open');
    onOpen.forEach((f) => f());
    await play(bg, [{ opacity: 1 }, { opacity: 0 }], 750, 'cubic-bezier(.4, 0, .2, 1)');
    // The name's outline gives way as its 3D letters stamp in.
    await wait(1250);
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

  // Hand the line and coin to the compositor right before a known main-thread stall (evaluating
  // the big 3D bundle, compiling shaders), so they glide on instead of freezing. `through` lets
  // them glide ahead to the end of a stage that is about to run in short, choppy frames.
  coast(ms = 900, through?: LoadStage) {
    if (reduced || finished) return;
    if (through) target = Math.max(target, RANGE[through][1]);
    if (!landed) return;   // still falling (on the compositor already); the roll starts on landing
    // Start from where the line is on screen, which may be partway through an earlier glide.
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
        fill.animate([{ transform: `scaleX(${from})` }, { transform: `scaleX(${pos})` }], opts),
        coin.animate([{ transform: along(from) }, { transform: along(pos) }], opts),
        spin.animate([{ transform: turned(from) }, { transform: turned(pos) }], opts),
        litWin.animate([{ transform: `translateY(${litAt(from)}px)` }, { transform: `translateY(${litAt(pos)}px)` }], opts),
        litSvg.animate([{ transform: `translateY(${-litAt(from)}px)` }, { transform: `translateY(${-litAt(pos)}px)` }], opts),
      ],
    };
    glide = g;
    g.anims[0].onfinish = () => { if (glide === g) { glide = null; render(); } };
  },

  // Everything is ready: the coin rolls to the end of the line and waits to be put in.
  finish() {
    if (finished) return;
    loading.report('shadows', 1);
    finished = true;
    void (async () => {
      await glide?.anims[0].finished.catch(() => {});
      await new Promise<void>((r) => { arrive = r; });
      rolling = false;
      render();
      waitForCoin();
    })();
  },

  /** Called inside the visitor's click that puts the coin in (so audio may start). */
  onEnter(fn: () => void) { onEnter.push(fn); },
  /** Called as the screen splits open. */
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

window.addEventListener('resize', () => { if (!inserting) drawOutline(); if (!glide) render(); });
render();
