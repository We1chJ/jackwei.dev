// The name on the left of the hero, in the buttons' recipe: warm white letters, a black outline and a
// short hard shadow. It stamps in a letter at a time once the machines have landed, a thud per letter,
// then stays still. Replaces the 3D letters; the loader's wireframe of them fades as this arrives.
// A canvas so the reel's snapshot of the arcade can include it (arcadeShot in resume/store.ts).
import { useEffect, useRef, useState } from 'react';
import { thud } from '../gacha/sound';
import { intro, useIntro } from './intro';
import { HERO_NAME, HERO_TEXT_BOTTOM } from './layout';

const ROWS = ['JACK', 'WEI'];
const LETTERS = ROWS.join('').length;
const INK = '#141414', PAPER = '#FFFDF6';
const FONT = "'Lilita One', 'Arial Black', sans-serif";
const LANDED_S = 2.15;    // after the drop starts
const STEP_MS = 135;      // between letters
const CAP = 0.72;         // Lilita One's cap height, em
const LINE = 0.94;        // baseline to baseline, em
const SPACING = 0.015;    // em
const OUTLINE = 0.05;     // stroke width, em: half of it shows outside the letter
const SHADOW = 0.027;     // em, down and right
const BOX_W = 0.56, BOX_H = 0.7;   // the canvas, as shares of the window

let played = false;       // only the first arrival stamps in; coming back from a machine it is just there

function useWindowSize() {
  const [size, setSize] = useState({ w: innerWidth, h: innerHeight });
  useEffect(() => {
    const on = () => setSize({ w: innerWidth, h: innerHeight });
    addEventListener('resize', on);
    return () => removeEventListener('resize', on);
  }, []);
  return size;
}

/** The first `count` letters. Shadows, then outlines, then faces, so no letter's black lands on a neighbour's white. */
function paint(canvas: HTMLCanvasElement, width: number, height: number, size: number, count: number) {
  const dpr = Math.min(devicePixelRatio, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const g = canvas.getContext('2d');
  if (!g) return;
  g.scale(dpr, dpr);
  g.font = `400 ${size}px ${FONT}`;
  g.lineJoin = 'round';
  g.lineWidth = size * OUTLINE;
  const left = width * 0.05;
  const baseline = (height + (CAP - LINE * (ROWS.length - 1)) * size) / 2;
  const glyphs = ROWS.flatMap((row, r) => [...row].map((ch, i) => ({
    ch,
    x: left + g.measureText(row.slice(0, i)).width + i * SPACING * size,
    y: baseline + r * LINE * size,
  }))).slice(0, count);
  g.fillStyle = g.strokeStyle = INK;
  const shadow = size * SHADOW;
  glyphs.forEach(({ ch, x, y }) => { g.strokeText(ch, x + shadow, y + shadow); g.fillText(ch, x + shadow, y + shadow); });
  glyphs.forEach(({ ch, x, y }) => g.strokeText(ch, x, y));
  g.fillStyle = PAPER;
  glyphs.forEach(({ ch, x, y }) => g.fillText(ch, x, y));
}

export default function NameSign() {
  const opened = useIntro((s) => s.phase === 'dropping' || s.phase === 'done');
  const { w, h } = useWindowSize();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [count, setCount] = useState(played ? LETTERS : 0);

  useEffect(() => {
    if (!opened || played) return;
    const wait = Math.max(0, intro.get().startedAt + LANDED_S - performance.now() / 1000) * 1000;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const timer = setTimeout(() => { played = true; setCount(LETTERS); }, wait);
      return () => clearTimeout(timer);
    }
    const timers = Array.from({ length: LETTERS }, (_, i) => setTimeout(() => {
      thud(0.35);
      setCount(i + 1);
      played = i === LETTERS - 1;
    }, wait + i * STEP_MS));
    return () => timers.forEach(clearTimeout);
  }, [opened]);

  const size = Math.min((HERO_NAME.line * h) / CAP, (0.38 * w) / 2.4);
  const nameTop = 1 - (HERO_NAME.y + 1) / 2;
  const boxW = w * BOX_W, boxH = h * BOX_H;

  useEffect(() => {
    let live = true;
    void document.fonts.load(`400 ${size}px 'Lilita One'`).then(() => {
      if (live && canvas.current) paint(canvas.current, boxW, boxH, size, count);
    });
    return () => { live = false; };
  }, [boxW, boxH, size, count]);

  return (
    <div
      className="hero-name"
      aria-hidden="true"
      style={{ left: (HERO_NAME.x + 1) / 2 * w - boxW * 0.05, top: ((nameTop + HERO_TEXT_BOTTOM) / 2 - BOX_H / 2 - 0.016) * h, width: boxW, height: boxH }}
    >
      <canvas ref={canvas} />
    </div>
  );
}
