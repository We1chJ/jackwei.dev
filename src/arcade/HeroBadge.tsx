// Jack's badge, hanging in the gap between the name and the claw machine: drag it, throw it, click to flip.
// The back is printed here: who he is, with the links live (a tap on one opens it). Built during the
// loading screen, where its slow first render can't be seen; it swings in once the name has landed,
// then hangs still. Windows without room for it go without.
import { useEffect, useRef, useState } from 'react';
import { intro, useIntro } from './intro';
import Lanyard from './Lanyard';
import { heroNameSize } from './NameSign';
import { useTheme } from './theme';

const ARRIVES_S = 3.1;     // after the drop starts, when the last letter is down
const NAME_LEFT = 0.07, MACHINES_LEFT = 0.42;   // shares of the window
const NAME_WIDTH = 1.95;   // ems across, as turned (NameSign's TURN_DEG)
const MIN_GAP = 100;       // px between the name and the machines: any less and it goes without
const CARD_ASPECT = 1.6 / 2.25;

// What the back says. A line with a link opens it when tapped.
const LINES: { role: string; at: string; href?: string }[] = [
  { role: 'ECE/CS student', at: '@ Olin College of Engineering' },
  { role: 'Solo founder', at: '@ Truly', href: 'https://trulyta.com' },
  { role: 'Content creator', at: '@we1chj on Instagram', href: 'https://www.instagram.com/we1chj/' },
];
const INK = '#141414', PINK = '#FF4F8B', GOLD = '#F2C744', MUTED = '#6B6760';

type Zone = { x: number; y: number; w: number; h: number; href: string };

let played = false;        // only the first arrival swings in

export default function HeroBadge() {
  const opened = useIntro((s) => s.phase === 'dropping' || s.phase === 'done');
  const [show, setShow] = useState(played);
  const [swingIn] = useState(!played);
  const dark = useTheme((s) => s.mode === 'dark');
  const [{ w, h }, setSize] = useState({ w: innerWidth, h: innerHeight });
  const [fonts, setFonts] = useState(0);
  const zones = useRef<Zone[]>([]);
  const face = useRef({ w: 1, h: 1 });

  useEffect(() => {
    const on = () => setSize({ w: innerWidth, h: innerHeight });
    addEventListener('resize', on);
    return () => removeEventListener('resize', on);
  }, []);

  // The back is lettered in the page's fonts: painted again once they are in.
  useEffect(() => {
    let alive = true;
    Promise.all([document.fonts.load("400 60px 'Lilita One'"), document.fonts.load('900 48px Nunito'), document.fonts.load('700 40px Nunito')])
      .then(() => { if (alive) setFonts(1); }, () => { if (alive) setFonts(1); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!opened || played) return;
    const wait = Math.max(0, intro.get().startedAt + ARRIVES_S - performance.now() / 1000) * 1000;
    const timer = setTimeout(() => { played = true; setShow(true); }, wait);
    return () => clearTimeout(timer);
  }, [opened]);

  const paintBack = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
    face.current = { w: W, h: H };
    zones.current = [];
    const u = W / 1024;   // everything below is laid out on a 1024-wide card
    ctx.scale(u, u);
    const HH = H / u;
    // a band of colour across the top, under the slot, and the name on it
    ctx.fillStyle = PINK;
    ctx.fillRect(0, 0, 1024, 300);
    ctx.fillStyle = INK;
    ctx.fillRect(0, 300, 1024, 10);
    ctx.fillStyle = '#FFFDF6';
    ctx.font = "400 118px 'Lilita One', 'Arial Black', sans-serif";
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('JACK WEI', 72, 262);
    ctx.font = '900 30px Nunito, sans-serif';
    ctx.fillStyle = INK;
    ctx.fillText('JACKWEI.DEV', 72, 170);
    // the lines: a role, then where, each with a gold dot; a link is underlined in pink with an arrow
    let y = 430;
    for (const line of LINES) {
      ctx.fillStyle = GOLD;
      ctx.beginPath(); ctx.arc(92, y - 18, 14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = INK;
      ctx.font = '900 58px Nunito, sans-serif';
      ctx.fillText(line.role, 130, y);
      ctx.font = '700 46px Nunito, sans-serif';
      ctx.fillStyle = line.href ? PINK : MUTED;
      const text = line.href ? `${line.at}  ↗` : line.at;
      ctx.fillText(text, 130, y + 62);
      if (line.href) {
        const width = ctx.measureText(text).width;
        ctx.fillRect(130, y + 72, width, 4);
        zones.current.push({ x: 110 * u, y: (y + 12) * u, w: (width + 40) * u, h: 76 * u, href: line.href });
      }
      y += 205;
    }
    // a strip of bars along the bottom, like a badge's
    ctx.fillStyle = INK;
    let x = 72, seed = 7;
    while (x < 952) { seed = (seed * 48271) % 2147483647; const bw = 4 + (seed % 5) * 3; ctx.fillRect(x, HH - 150, bw, 70); x += bw + 6 + (seed % 3) * 4; }
  };
  const onBackClick = (u: number, v: number) => {
    const x = u * face.current.w, y = (1 - v) * face.current.h;
    const zone = zones.current.find((z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h);
    if (!zone) return false;
    window.open(zone.href, '_blank', 'noopener');
    return true;
  };

  const nameRight = NAME_LEFT * w + NAME_WIDTH * heroNameSize(w, h);
  const gap = MACHINES_LEFT * w - nameRight;
  if (gap < MIN_GAP) return null;
  const cardH = Math.min((gap * 0.95) / CARD_ASPECT, 0.46 * h);
  return (
    // The canvas is the whole window, so wherever it is thrown it is never cropped.
    <div className="hero-badge" aria-hidden="true">
      <Lanyard
        frontImage="/lanyard/card.jpg"
        cardColor="#FFFDF6"
        size={cardH / h}
        anchorAt={(nameRight + gap / 2) / w}
        strapLength={0.22}
        strapColor={dark ? '#FF4F8B' : '#141414'}
        breeze={0}
        intro={swingIn}
        hold={!show}
        backPainter={paintBack}
        backKey={fonts}
        onBackClick={onBackClick}
      />
    </div>
  );
}
