// The name on the left of the hero, in the buttons' recipe: warm white letters and a black outline, with
// real black depth that turns gently toward the pointer. One soft surface (ElasticMesh): press a letter and
// it dents, pull it and it stretches, depth and all. It lands a letter at a time once the machines are down,
// a thud per letter. Replaces the 3D letters; the loader's wireframe of them fades as this arrives.
import { useCallback, useEffect, useState } from 'react';
import { thud } from '../gacha/sound';
import { intro, useIntro } from './intro';
import { HERO_NAME, HERO_TEXT_BOTTOM } from './layout';
import ElasticMesh from './ElasticMesh';

const ROWS = ['JACK', 'WEI'];
const REST = { x: 4, y: -6 };   // the depth shows down and to the right, like the buttons' shadow
const LETTERS = ROWS.join('').length;
const INK = '#141414', PAPER = '#FFFDF6';
const FONT = "'Lilita One', 'Arial Black', sans-serif";
const LANDED_S = 2.15;    // after the drop starts
const STEP_MS = 135;      // between letters
const CAP = 0.72;         // Lilita One's cap height, em
const LINE = 0.94;        // baseline to baseline, em
const SPACING = 0.015;    // em
const OUTLINE = 0.05;     // stroke width, em: half of it shows outside the letter
const LAYERS = 12, LAYER_GAP = 0.025;   // the depth: copies, and em between them
const INK_RGB: [number, number, number] = [0.078, 0.078, 0.078];
const BOX_W = 0.56, BOX_H = 0.7;   // the canvas, as shares of the window

let played = false;       // only the first arrival stamps in; coming back from a machine it is just there

export const heroNameSize = (w: number, h: number) => Math.min((HERO_NAME.line * h) / CAP, (0.38 * w) / 2.4);

function useWindowSize() {
  const [size, setSize] = useState({ w: innerWidth, h: innerHeight });
  useEffect(() => {
    const on = () => setSize({ w: innerWidth, h: innerHeight });
    addEventListener('resize', on);
    return () => removeEventListener('resize', on);
  }, []);
  return size;
}

/** Everything in window px, relative to the name's box. With `outlined` off, just the faces. */
function letters(g: CanvasRenderingContext2D, width: number, height: number, size: number, outlined: boolean) {
  g.font = `400 ${size}px ${FONT}`;
  g.lineJoin = 'round';
  g.lineWidth = size * OUTLINE;
  const left = width * 0.05;
  const baseline = (height + (CAP - LINE * (ROWS.length - 1)) * size) / 2;
  const glyphs = ROWS.flatMap((row, r) => [...row].map((ch, i) => ({
    ch,
    x: left + g.measureText(row.slice(0, i)).width + i * SPACING * size,
    y: baseline + r * LINE * size,
  })));
  if (outlined) {
    g.strokeStyle = INK;
    glyphs.forEach(({ ch, x, y }) => g.strokeText(ch, x, y));
  }
  g.fillStyle = PAPER;
  glyphs.forEach(({ ch, x, y }) => g.fillText(ch, x, y));
}

export default function NameSign() {
  const opened = useIntro((s) => s.phase === 'dropping' || s.phase === 'done');
  const { w, h } = useWindowSize();
  const [landing, setLanding] = useState(played);
  const [typeIn] = useState(!played);

  useEffect(() => {
    if (!opened || played) return;
    const wait = Math.max(0, intro.get().startedAt + LANDED_S - performance.now() / 1000) * 1000;
    const timers = [setTimeout(() => { played = true; setLanding(true); }, wait)];
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (let i = 0; i < LETTERS; i++) timers.push(setTimeout(() => thud(0.35), wait + i * STEP_MS));
    }
    return () => timers.forEach(clearTimeout);
  }, [opened]);

  const size = heroNameSize(w, h);
  const nameTop = 1 - (HERO_NAME.y + 1) / 2;
  const boxW = w * BOX_W, boxH = h * BOX_H;
  const draw = useCallback((g: CanvasRenderingContext2D, outlined: boolean) => letters(g, boxW, boxH, size, outlined), [boxW, boxH, size]);
  const textW = 2.4 * size, textH = (CAP + LINE) * size;

  return (
    <div
      className="hero-name"
      aria-hidden="true"
      style={{ left: (HERO_NAME.x + 1) / 2 * w - boxW * 0.05, top: ((nameTop + HERO_TEXT_BOTTOM) / 2 - BOX_H / 2 - 0.016) * h, width: boxW, height: boxH }}
    >
      <ElasticMesh
        draw={draw}
        fontFamily="'Lilita One'"
        fontWeight={400}
        material="sticker"
        theme="light"
        inflate={0.6}
        stiffness={0.5}
        wobble={0.6}
        press={0.35}
        grabRadius={size * 0.45}
        shadow={0}
        intro={typeIn}
        start={landing}
        introGap={STEP_MS / 1000}
        rowHeight={LINE * size}
        view={{
          layers: LAYERS,
          gap: LAYER_GAP * size,
          color: INK_RGB,
          rest: REST,
          tilt: 6,
          perspective: 1100,
          pivot: { x: boxW * 0.05 + textW / 2, y: boxH / 2 },
          reach: { x: textW, y: textH },
        }}
      />
    </div>
  );
}
