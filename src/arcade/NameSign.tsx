// The name on the left of the hero: crisp letters with real depth (TechText, with DepthText's extrusion
// built in), typed in once the machines have landed, a thud per letter. It turns toward the pointer;
// hover a letter to press it in and see its outline, drag or click it to knock it about. Replaces the
// 3D letters; the loader's wireframe of them fades as this arrives.
import { useEffect, useState } from 'react';
import { thud } from '../gacha/sound';
import { intro, useIntro } from './intro';
import { HERO_NAME, HERO_TEXT_BOTTOM } from './layout';
import { useReel } from '../resume/store';
import TechText from './TechText';

const COLORS = ['#FF4F8B', '#2B3A8C', '#FFF4DC', '#FF7A2E', '#21B07A', '#FF4F8B', '#2B3A8C'];
const LETTERS = 7;
const INTRO_S = 1.1;
const LANDED_S = 2;       // after the drop starts
const CAP = 0.72;         // Lilita One's cap height, em
const LINE = 0.94;        // baseline to baseline, em
const BOX_W = 0.56, BOX_H = 0.7;   // the canvas, as shares of the window: room to throw letters around

let played = false;       // only the first arrival types in; coming back from a machine it is just there

function useWindowSize() {
  const [size, setSize] = useState({ w: innerWidth, h: innerHeight });
  useEffect(() => {
    const on = () => setSize({ w: innerWidth, h: innerHeight });
    addEventListener('resize', on);
    return () => removeEventListener('resize', on);
  }, []);
  return size;
}

export default function NameSign() {
  const opened = useIntro((s) => s.phase === 'dropping' || s.phase === 'done');
  const { w, h } = useWindowSize();
  const covered = useReel((s) => s.covered);   // the reel is over it: nothing moves under there
  const [shown, setShown] = useState(played);
  const [typeIn] = useState(!played);

  useEffect(() => {
    if (!opened || shown) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const wait = Math.max(0, intro.get().startedAt + LANDED_S - performance.now() / 1000) * 1000;
    const timers = [setTimeout(() => { played = true; setShown(true); }, wait)];
    if (!reduced) for (let i = 0; i < LETTERS; i++) timers.push(setTimeout(() => thud(0.35), wait + 150 + (i * 860 * INTRO_S) / LETTERS));
    return () => timers.forEach(clearTimeout);
  }, [opened, shown]);

  const size = Math.min((HERO_NAME.line * h) / CAP, (0.38 * w) / 2.4);
  const nameTop = 1 - (HERO_NAME.y + 1) / 2;
  const boxW = w * BOX_W;
  return (
    <div
      className="hero-name"
      aria-hidden="true"
      style={{ left: (HERO_NAME.x + 1) / 2 * w - boxW * 0.05, top: ((nameTop + HERO_TEXT_BOTTOM) / 2 - BOX_H / 2 - 0.016) * h, width: boxW, height: BOX_H * h }}
    >
      {shown && (
        <TechText
          text={'JACK\nWEI'}
          fontFamily="'Lilita One', 'Arial Black', sans-serif"
          fontWeight={400}
          fontSize={size}
          letterSpacing={0.015}
          lineHeight={LINE}
          relief={0.42}
          paused={covered}
          colors={COLORS}
          color="#141414"
          accentColor="#141414"
          align="left"
          reveal="letter"
          dashLength={5}
          dashGap={3}
          specks={12}
          bounce={0.45}
          sweep={false}
          intro={typeIn ? 'type' : 'none'}
          introDuration={INTRO_S}
        />
      )}
    </div>
  );
}
