// Jack's badge, hanging beside the name's second line, in front of the claw machine's edge: drag it,
// throw it, click to flip. The back is printed here: who he is, with the links live (a tap on one
// opens it). Built during the loading screen, where its slow first render can't be seen; it swings
// in once the name has landed, then hangs still. Windows without room for it go without.
import { useEffect, useRef, useState } from 'react';
import { intro, useIntro } from './intro';
import Lanyard from './Lanyard';
import { drawLogo, LOGOS, type LogoName } from './logos';
import { heroNameSize, TURN_DEG } from './NameSign';
import { useTheme } from './theme';

const ARRIVES_S = 3.1;     // after the drop starts, when the last letter is down
const NAME_LEFT = 0.07;    // share of the window where the name starts
const WEI_EMS = 1.905;     // its second line's width before the turn, in ems (Lilita One, NameSign's spacing)
const PIVOT_EMS = 0.48;    // where the name turns about, in ems from its left (NameSign's pivot)
const DEPTH = 800;         // the name's perspective, px (NameSign's view)
const CLAW_EDGE = 0.40;    // share of the window where the claw machine's side shows
const OVERLAP = 0.04;      // how far over that side the card may hang, as a share of the window
const MIN_SLOT = 90;       // px of room beside WEI: any less and it goes without
const MAX_H = 0.34;        // the card's height, at most, as a share of the window height
const MID_Y = 0.55;        // where the card's middle hangs, as a share of the window height
const READ_H = 0.6;        // turned over, it comes forward to be read: up to this share of the window height
const LIFT_MAX = 1.9;      // and at most this many times its size
const CARD_ASPECT = 1.6 / 2.25;

// What the back says. A line with a link opens it when tapped; the marks along the bottom likewise.
const LINES: { role: string; at: string; href?: string }[] = [
  { role: 'ECE/CS student', at: '@ Olin College of Engineering' },
  { role: 'Solo founder', at: '@ Truly', href: 'https://trulyta.com' },
  { role: 'Content creator', at: '@we1chj' },
];
const MARKS: LogoName[] = ['github', 'linkedin', 'instagram'];
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
    let y = 445;
    for (const line of LINES) {
      ctx.fillStyle = GOLD;
      ctx.beginPath(); ctx.arc(92, y - 23, 16, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = INK;
      ctx.font = '900 76px Nunito, sans-serif';
      ctx.fillText(line.role, 130, y);
      ctx.font = '700 54px Nunito, sans-serif';
      ctx.fillStyle = line.href ? PINK : MUTED;
      const text = line.href ? `${line.at}  ↗` : line.at;
      ctx.fillText(text, 130, y + 72);
      if (line.href) {
        const width = ctx.measureText(text).width;
        ctx.fillRect(130, y + 84, width, 4);
        zones.current.push({ x: 110 * u, y: (y + 14) * u, w: (width + 40) * u, h: 88 * u, href: line.href });
      }
      y += 235;
    }
    // the marks along the bottom, each on a dark coin, each a tap away
    const R = 92, cy = HH - 215;
    MARKS.forEach((name, i) => {
      const cx = 512 + (i - 1) * 300;
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#FFFDF6';
      drawLogo(ctx, name, cx - 50, cy - 50, 100);
      zones.current.push({ x: (cx - R - 24) * u, y: (cy - R - 24) * u, w: (R + 24) * 2 * u, h: (R + 24) * 2 * u, href: LOGOS[name].href });
    });
  };
  const onBackClick = (u: number, v: number) => {
    const x = u * face.current.w, y = (1 - v) * face.current.h;
    const zone = zones.current.find((z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h);
    if (!zone) return false;
    window.open(zone.href, '_blank', 'noopener');
    return true;
  };

  // Its slot: from the end of WEI, as turned away (the far end foreshortens, more the bigger the name),
  // to a little way over the claw's side. The strap is as long as puts the card's middle at MID_Y
  // (Lanyard hangs the card's top 12% to 42% of the way down).
  const em = heroNameSize(w, h), turn = (TURN_DEG * Math.PI) / 180, reach = (WEI_EMS - PIVOT_EMS) * em;
  const weiEnd = NAME_LEFT * w + PIVOT_EMS * em + (reach * Math.cos(turn) * DEPTH) / (DEPTH + reach * Math.sin(turn));
  const slotLeft = weiEnd + 0.02 * w + 10, slotRight = (CLAW_EDGE + OVERLAP) * w;
  if (slotRight - slotLeft < MIN_SLOT) return null;
  const cardH = Math.min((slotRight - slotLeft) / CARD_ASPECT, MAX_H * h);
  const strap = (MID_Y - cardH / h / 2 - 0.12) / 0.3;
  return (
    // The canvas is the whole window, so wherever it is thrown it is never cropped.
    <div className="hero-badge" aria-hidden="true">
      <Lanyard
        frontImage="/lanyard/card.jpg"
        cardColor="#FFFDF6"
        size={cardH / h}
        anchorAt={(slotLeft + slotRight) / 2 / w}
        strapLength={strap}
        strapColor={dark ? '#FF4F8B' : '#141414'}
        breeze={0}
        intro={swingIn}
        hold={!show}
        backPainter={paintBack}
        backKey={fonts}
        onBackClick={onBackClick}
        liftOnBack={Math.min(LIFT_MAX, (READ_H * h) / cardH)}
      />
    </div>
  );
}
