// Jack's badge, hanging in the gap between the name and the claw machine: drag it, throw it, click to flip.
// Built during the loading screen, where its slow first render can't be seen; it swings in once the name
// has landed, then hangs still. Windows without room for it go without.
import { useEffect, useState } from 'react';
import { intro, useIntro } from './intro';
import Lanyard from './Lanyard';
import { heroNameSize } from './NameSign';

const ARRIVES_S = 3.1;     // after the drop starts, when the last letter is down
const NAME_LEFT = 0.07, MACHINES_LEFT = 0.42;   // shares of the window
const NAME_WIDTH = 1.95;   // ems across, as turned (NameSign's TURN_DEG)
const MIN_GAP = 100;       // px between the name and the machines: any less and it goes without
const CARD_ASPECT = 1.6 / 2.25;

let played = false;        // only the first arrival swings in

export default function HeroBadge() {
  const opened = useIntro((s) => s.phase === 'dropping' || s.phase === 'done');
  const [show, setShow] = useState(played);
  const [swingIn] = useState(!played);
  const [{ w, h }, setSize] = useState({ w: innerWidth, h: innerHeight });

  useEffect(() => {
    const on = () => setSize({ w: innerWidth, h: innerHeight });
    addEventListener('resize', on);
    return () => removeEventListener('resize', on);
  }, []);

  useEffect(() => {
    if (!opened || played) return;
    const wait = Math.max(0, intro.get().startedAt + ARRIVES_S - performance.now() / 1000) * 1000;
    const timer = setTimeout(() => { played = true; setShow(true); }, wait);
    return () => clearTimeout(timer);
  }, [opened]);

  const nameRight = NAME_LEFT * w + NAME_WIDTH * heroNameSize(w, h);
  const gap = MACHINES_LEFT * w - nameRight;
  if (gap < MIN_GAP) return null;
  const cardH = Math.min((gap * 0.8) / CARD_ASPECT, 0.34 * h);
  return (
    // The canvas is the whole window, so wherever it is thrown it is never cropped.
    <div className="hero-badge" aria-hidden="true">
      <Lanyard
        frontImage="/lanyard/card.jpg"
        cardColor="#FFFDF6"
        size={cardH / h}
        anchorAt={(nameRight + gap / 2) / w}
        strapLength={0.22}
        strapColor="#141414"
        breeze={0}
        intro={swingIn}
        hold={!show}
      />
    </div>
  );
}
