// The "insert coin" loading screen. Plain DOM (markup in index.html), so it runs before React
// and three.js arrive. The coin is a real 3D object (CSS 3D: two embossed faces and a reeded
// edge) that rolls on a critically damped spring toward the true progress, so it never moves
// stop-and-go. The finish runs on the Web Animations API, which the browser plays on the
// compositor: smooth even while the 3D engine is busy behind it.

export type LoadStage = 'download' | 'compile' | 'settle' | 'shadows';

// Share of the bar each stage owns, in the order they happen.
const RANGE: Record<LoadStage, [number, number]> = {
  download: [0, 0.7], compile: [0.7, 0.8], settle: [0.8, 0.86], shadows: [0.86, 1],
};
const LINES: Record<LoadStage, string[]> = {
  download: ['Downloading 64 capsules…', 'Bribing the physics engine…', 'Hiding the prank capsule…', 'Reticulating sprouts…', 'Oiling the handle…'],
  compile: ['Teaching the GPU what plastic is…'],
  settle: ['Pouring the capsules in…'],
  shadows: ['Polishing the chrome…'],
};
const COIN = 56;                       // px diameter (matches CSS)
const SLATS = 40;                      // reeded-edge segments
const SLOPE = Math.tan((1.8 * Math.PI) / 180);   // the rail's tilt (matches CSS)
const SMOOTH = 0.42;                   // spring smoothing time, seconds

const root = document.getElementById('loader')!;
const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
const body = q('.loader-body'), plate = q('.plate'), groove = q('.groove');
const fly = q('.coin-fly'), hop = q<HTMLButtonElement>('.coin-hop'), coin = q('.coin3d');
const sheen = q('.coin-sheen'), shadow = q('.coin-shadow'), slot = q('.slot');
const ledLabel = q('.led-label'), ledNum = q('.led-num'), line = q('.loader-line'), retry = q<HTMLButtonElement>('.loader-retry');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Reeded edge: thin slats standing around the rim, each facing outward.
for (let i = 0; i < SLATS; i++) {
  const s = document.createElement('i');
  s.style.transform = `rotateZ(${(i * 360) / SLATS}deg) translateY(${-COIN / 2}px) rotateX(90deg)`;
  q('.coin-edge').append(s);
}

let target = 0, pos = 0, vel = 0, last = performance.now();
let stage: LoadStage = 'download', lineIndex = 0, finished = false, rolling = true;
let arrive: (() => void) | null = null;
let glide: { from: number; to: number; anims: Animation[] } | null = null;   // see coast()

const run = () => groove.clientWidth - COIN - 14;
const roll = () => (pos * run()) / (COIN / 2);   // radians: rolls without slipping

function setLine(text: string) {
  line.classList.add('out');
  setTimeout(() => { line.textContent = text; line.classList.remove('out'); }, 160);
}

function render() {
  const x = pos * run();
  fly.style.transform = `translate3d(${x}px, ${x * SLOPE}px, 0)`;
  coin.style.transform = `rotateY(0deg) rotateZ(${roll()}rad)`;
  const n = Math.round(pos * 100);
  ledNum.textContent = `${String(n).padStart(3, '0')}%`;
  root.setAttribute('aria-valuenow', String(n));
}

// Smooth-damp spring: continuous speed, so bursts of progress turn into one steady roll.
function tick(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (reduced) { pos = target; vel = 0; }
  else {
    // A brisker spring once finished, so the coin rolls home instead of creeping in.
    const w = 2 / (finished ? SMOOTH * 0.45 : SMOOTH), k = w * dt, e = 1 / (1 + k + 0.48 * k * k + 0.235 * k * k * k);
    const change = pos - target, temp = (vel + w * change) * dt;
    vel = (vel - w * temp) * e;
    pos = target + (change + temp) * e;
    if (pos > target) { pos = target; vel = 0; }   // never overshoot past real progress
  }
  render();
  if (arrive && target - pos < 0.002) { arrive(); arrive = null; }
  if (rolling) requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

const ticker = setInterval(() => {
  const lines = LINES[stage];
  if (lines.length > 1) setLine(lines[++lineIndex % lines.length]);
}, 1800);

// Prank: poking the coin makes it hop and complain.
hop.addEventListener('click', () => {
  hop.classList.remove('poked'); void hop.offsetWidth; hop.classList.add('poked');
  setLine('Hey! That’s my coin.');
});

const play = (el: Element, frames: Keyframe[], ms: number, easing = 'cubic-bezier(.45, 0, .3, 1)') =>
  el.animate(frames, { duration: reduced ? 1 : ms, easing, fill: 'forwards' }).finished;
const wait = (ms: number) => new Promise((r) => setTimeout(r, reduced ? 0 : ms));

export const loading = {
  report(s: LoadStage, frac: number) {
    if (finished) return;
    const [lo, hi] = RANGE[s];
    target = Math.max(target, lo + (hi - lo) * Math.min(1, Math.max(0, frac)));
    if (s !== stage) { stage = s; lineIndex = 0; setLine(LINES[s][0]); }
  },

  // Hand the coin to the compositor right before a known main-thread stall (evaluating the big
  // 3D bundle, compiling shaders), so it glides on instead of freezing mid-roll. `through` lets
  // it glide ahead to the end of a stage that is about to run in short, choppy frames.
  coast(ms = 900, through?: LoadStage) {
    if (reduced || finished) return;
    if (through) target = Math.max(target, RANGE[through][1]);
    // Start from where the coin is on screen, which may be partway through an earlier glide.
    let from = pos;
    if (glide) {
      const p = glide.anims[0].effect?.getComputedTiming().progress;
      if (p != null) from = glide.from + (glide.to - glide.from) * p;
      glide.anims.forEach((a) => a.cancel());
    }
    pos = target; vel = 0;
    const fromX = from * run(), toX = pos * run(), r = COIN / 2;
    const opts = { duration: ms, easing: 'cubic-bezier(.25, .6, .35, 1)' };
    glide = {
      from, to: pos,
      anims: [
        fly.animate([{ transform: `translate3d(${fromX}px, ${fromX * SLOPE}px, 0)` }, { transform: `translate3d(${toX}px, ${toX * SLOPE}px, 0)` }], opts),
        coin.animate([{ transform: `rotateY(0deg) rotateZ(${fromX / r}rad)` }, { transform: `rotateY(0deg) rotateZ(${toX / r}rad)` }], opts),
      ],
    };
  },

  // The coin rolls home, tips edge-on, slides into the slot, the machine thanks you and the
  // doors swing open with the plate split across them.
  finish() {
    if (finished) return;
    loading.report('shadows', 1);
    finished = true;
    clearInterval(ticker);
    void (async () => {
      await glide?.anims[0].finished.catch(() => {});
      await new Promise<void>((r) => { arrive = r; });
      rolling = false;
      ledLabel.textContent = 'INSERT COIN';
      ledLabel.classList.add('blink');

      const x = run(), from = `translate3d(${x}px, ${x * SLOPE}px, 0)`;
      const c = coin.getBoundingClientRect(), s = slot.getBoundingClientRect();
      const dx = s.left + s.width / 2 - (c.left + c.width / 2), dy = s.top + s.height / 2 - (c.top + c.height / 2);
      const to = `translate3d(${x + dx}px, ${x * SLOPE + dy}px, 0)`;
      const spin = `rotateZ(${roll()}rad)`;
      void play(shadow, [{ opacity: 1 }, { opacity: 0 }], 200);
      void play(sheen, [{ opacity: 1 }, { opacity: 0 }], 300);
      void play(coin, [{ transform: `rotateY(0deg) ${spin}` }, { transform: `rotateY(90deg) ${spin}` }], 480);
      await play(fly, [
        { transform: from },
        { transform: `translate3d(${x + dx * 0.5}px, ${x * SLOPE + dy - 16}px, 0)`, offset: 0.55 },
        { transform: to },
      ], 480);
      await play(fly, [{ transform: to, opacity: 1 }, { transform: `${to} scale(.94)`, opacity: 0 }], 200, 'ease-in');

      ledLabel.classList.remove('blink');
      ledLabel.textContent = 'THANK YOU!';
      ledNum.textContent = '';
      setLine('Coin accepted!');
      void play(plate, [{ transform: 'none' }, { transform: 'translateY(2px)', offset: 0.3 }, { transform: 'none' }], 320, 'ease-out');
      plate.classList.add('clink');
      await wait(560);

      // Copy the (now static) front panel onto both doors, so it splits as they open.
      fly.style.visibility = 'hidden';
      root.querySelectorAll('.door-content').forEach((d) => {
        const copy = body.cloneNode(true) as HTMLElement;
        copy.setAttribute('aria-hidden', 'true');
        copy.querySelector('.coin-fly')?.remove();
        d.append(copy);
      });
      body.style.visibility = 'hidden';
      root.classList.add('open');
      await wait(1000);
      root.remove();
    })();
  },

  fail() {
    clearInterval(ticker);
    root.classList.add('jammed');
    ledLabel.textContent = 'JAMMED';
    ledNum.textContent = 'ERR';
    setLine('The machine jammed while loading.');
    retry.hidden = false;
    retry.onclick = () => location.reload();
  },
};

window.addEventListener('resize', render);
render();
