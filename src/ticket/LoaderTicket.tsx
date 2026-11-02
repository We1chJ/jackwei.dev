// The ticket on the loading screen: the photo printing itself in step with the real progress, and a
// stub that stays on until everything is ready. Tearing it off is the way in. src/loader.ts owns the
// progress and everything that happens after the tear.
import { useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { loading } from '../loader';
import CountUp from './CountUp';
import RefineFrame from './RefineFrame';
import TearTicket from './TearTicket';
import './ticket.css';

type Link = typeof loading.ticket;

// One bar's thickness and the gap after it, in px: irregular, so it reads as a real barcode.
const BARS = [[3, 1], [1, 2], [2, 1], [1, 1], [4, 2], [1, 1], [2, 3], [1, 1], [3, 1], [1, 2], [2, 1], [1, 3], [3, 1], [1, 1], [2, 2], [4, 1], [1, 2], [2, 1], [1, 1], [3, 2], [1, 1], [2, 3], [1, 1], [4, 1], [1, 2], [2, 1], [1, 1], [3, 3], [1, 1], [2, 1], [1, 2], [3, 1], [1, 1], [2, 2], [1, 1], [3, 1], [2, 2], [1, 1], [4, 1], [1, 2], [2, 1], [1, 1], [3, 2], [1, 1], [2, 1], [1, 3], [3, 1], [1, 1], [2, 1]];

/** The three machines as die-cut stickers, each going on at this much of the printing. */
const STICKERS = [
  { at: 0.15, background: '#FF4F8B', art: <path d="M8 1.5V6M8 6 4 9v2.5L6 13M8 6l4 3v2.5L10 13" /> },
  { at: 0.5, background: '#FFF4DC', art: <><circle cx="8" cy="8" r="6" /><path d="M2 8h12" /><circle cx="8" cy="8" r="1.4" /></> },
  { at: 0.85, background: '#2B3A8C', color: '#FFF4DC', art: <><rect x="3.5" y="1.5" width="9" height="13" rx="1.2" /><path d="M5.5 5h5M5.5 8h5M6 12h4" /></> },
];

function Ticket({ link }: { link: Link }) {
  const { progress, ready, failed } = useSyncExternalStore(link.watch, link.get);
  const [tearing, setTearing] = useState(false);
  const [serial] = useState(() => String(Math.floor(Math.random() * 1e6)).padStart(6, '0'));
  const [percent] = useState(() => document.querySelector('.loader-percent') as HTMLElement);
  return (
    <div onPointerDownCapture={link.touched} onPointerUpCapture={link.touched} onKeyDownCapture={link.touched}>
      {createPortal(<CountUp to={Math.round(progress * 100)} trigger="load" duration={0.35} suffix="%" />, percent)}
      <TearTicket
        locked={!ready}
        beckon={ready}
        onBreak={() => { setTearing(true); link.ripped(); }}
        onTear={link.torn}
        width={500}
        height={280}
        stubSize={168}
        holes={14}
        notch={4}
        tearAngle={18}
        resistance={0.3}
        rotate={-3}
        background="#FFF4DC"
        stubBackground="#F2C744"
        color="#141414"
        ariaLabel="Tear off the stub to enter"
        stub={
          <div className={ready ? 'ticket-stub ready' : 'ticket-stub'}>
            <strong>Admit<br />one</strong>
            <div className="stub-stickers" aria-hidden="true">
              {STICKERS.map(({ at, art, ...colours }, i) => <i key={i} className={progress >= at ? 'on' : ''} style={colours}><svg viewBox="0 0 16 16">{art}</svg></i>)}
            </div>
            <i className="stub-seal" aria-hidden="true" />
            <b className="stub-stamp" aria-hidden="true">Ready</b>
            <div className="stub-code" aria-hidden="true">
              <em>No. {serial}</em>
              <div>{BARS.map(([h, gap], i) => <i key={i} style={{ height: h, marginBottom: gap }} />)}</div>
            </div>
            {ready
              ? <svg className="stub-arrow" viewBox="0 0 112 24" aria-hidden="true"><path d="M2 12h106M95 2l13 10-13 10" /></svg>
              : <small>Printing</small>}
          </div>
        }
      >
        <div className="ticket-art">
          <RefineFrame
            status={failed ? 'error' : ready ? 'complete' : 'refining'}
            progress={progress}
            aspectRatio="1 / 1"
            width={264}
            radius={8}
            background="#141414"
            stageDuration={200}
            showStatus={false}
            labels={{ refining: 'Loading' }}
          >
            <img src="/mascot.jpg" alt="" draggable={false} />
          </RefineFrame>
        </div>
        <p className="ticket-side"><i className="dm" /><b>Jack’s Arcade</b><i className="dm" /></p>
      </TearTicket>
      <div className={tearing ? 'tear-cue gone' : 'tear-cue'} aria-hidden="true">
        <span>Tear to enter</span>
        <svg viewBox="0 0 92 84"><path pathLength={1} d="M3 20C26 2 62 2 70 26c6 18-12 26-18 14-5-12 20-14 24 32" /><path pathLength={1} d="M63 60l13 14 11-16" /></svg>
      </div>
    </div>
  );
}

export function mountTicket(el: HTMLElement, link: Link) {
  const root = createRoot(el);
  root.render(<Ticket link={link} />);
  el.classList.add('in');
  link.whenGone(() => root.unmount());
}
