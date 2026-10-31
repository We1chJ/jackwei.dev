// Turns the page's scroll position into the journey's t (see path.ts). Each section has a stretch
// where t sits still and the cards scroll past, and the scroll between two sections is the move:
//   hold:  from the section's top reaching 20% down the window, to its bottom reaching 80%
//   move:  everything between one hold and the next
// The 3D follows the scroll with a little lag, which is what makes it feel weighty next to the page.
import { LAST } from './path';

export const track = { y: 0, t: 0, dolly: 0 };

const SETTLE = 7;                  // how fast the 3D catches up with the scroll (per second)
let holds: [number, number][] = [[0, 0]];
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Where each stop holds, in scroll px. Sections are the elements marked data-stop, in order. */
export function measure() {
  const vh = innerHeight, y = scrollY;
  const end = Math.max(0, document.documentElement.scrollHeight - vh);
  const spans: [number, number][] = [[0, 0]];
  document.querySelectorAll<HTMLElement>('[data-stop]').forEach((el) => {
    const r = el.getBoundingClientRect(), a = r.top + y - vh * 0.2;
    spans.push([a, Math.max(a, r.bottom + y - vh * 0.8)]);
  });
  if (spans.length === LAST) spans.push([end, end]);
  holds = spans;
}

function locate(y: number) {
  for (let k = 1; k < holds.length; k++) {
    const [a, b] = holds[k], prev = holds[k - 1][1];
    if (y < a) { track.t = k - 1 + (a > prev ? Math.max(0, y - prev) / (a - prev) : 1); track.dolly = 0; return; }
    if (y <= b) { track.t = k; track.dolly = b > a ? Math.sin(((y - a) / (b - a)) * Math.PI) : 0; return; }
  }
  track.t = holds.length - 1; track.dolly = 0;
}

/** Once a frame, before anything reads it. */
export function stepTrack(dt: number) {
  const k = reduced() ? 1 : 1 - Math.exp(-SETTLE * Math.min(dt, 1 / 20));
  track.y += (scrollY - track.y) * k;
  if (Math.abs(scrollY - track.y) < 0.2) track.y = scrollY;
  locate(track.y);
}
