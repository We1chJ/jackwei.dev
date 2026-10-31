// The ticket on the loading screen: the photo printing itself in step with the real progress, and a
// stub that stays on until everything is ready. Tearing it off is the way in. src/loader.ts owns the
// progress and everything that happens after the tear.
import { useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import type { loading } from '../loader';
import RefineFrame from './RefineFrame';
import TearTicket from './TearTicket';
import './ticket.css';

type Link = typeof loading.ticket;

// One bar's thickness and the gap after it, in px: irregular, so it reads as a real barcode.
const BARS = [[3, 1], [1, 2], [2, 1], [1, 1], [4, 2], [1, 1], [2, 3], [1, 1], [3, 1], [1, 2], [2, 1], [1, 3], [3, 1], [1, 1], [2, 2], [4, 1], [1, 2], [2, 1], [1, 1], [3, 2], [1, 1], [2, 3], [1, 1], [4, 1], [1, 2], [2, 1], [1, 1], [3, 3], [1, 1], [2, 1], [1, 2], [3, 1], [1, 1], [2, 2], [1, 1], [3, 1], [2, 2], [1, 1], [4, 1], [1, 2], [2, 1], [1, 1], [3, 2], [1, 1], [2, 1], [1, 3], [3, 1], [1, 1], [2, 1]];

/** The three machines, as tokens. */
const Tokens = () => (
  <div className="stub-tokens" aria-hidden="true">
    <i style={{ background: '#FF4F8B' }}><svg viewBox="0 0 16 16"><path d="M8 1.5V6M8 6 4 9v2.5L6 13M8 6l4 3v2.5L10 13" /></svg></i>
    <i style={{ background: '#FFF4DC' }}><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" /><path d="M2 8h12" /><circle cx="8" cy="8" r="1.4" /></svg></i>
    <i style={{ background: '#2B3A8C', color: '#FFF4DC' }}><svg viewBox="0 0 16 16"><rect x="3.5" y="1.5" width="9" height="13" rx="1.2" /><path d="M5.5 5h5M5.5 8h5M6 12h4" /></svg></i>
  </div>
);

function Ticket({ link }: { link: Link }) {
  const { progress, ready, failed } = useSyncExternalStore(link.watch, link.get);
  const [serial] = useState(() => String(Math.floor(Math.random() * 1e6)).padStart(6, '0'));
  return (
    <div onPointerDownCapture={link.touched} onPointerUpCapture={link.touched} onKeyDownCapture={link.touched}>
      <TearTicket
        locked={!ready}
        onBreak={link.ripped}
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
            <small>Jack’s Arcade</small>
            <strong>Admit<br />one</strong>
            <Tokens />
            <span className="ticket-hint">
              {ready ? 'Tear to enter' : 'Printing'}
              {ready ? <svg viewBox="0 0 16 10" aria-hidden="true"><path d="M1 5h13M10 1l4 4-4 4" /></svg> : null}
            </span>
            <b className="stub-stamp" aria-hidden="true">Ready</b>
            <div className="stub-code" aria-hidden="true">
              <em>No. {serial}</em>
              <div>{BARS.map(([h, gap], i) => <i key={i} style={{ height: h, marginBottom: gap }} />)}</div>
            </div>
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
    </div>
  );
}

export function mountTicket(el: HTMLElement, link: Link) {
  const root = createRoot(el);
  root.render(<Ticket link={link} />);
  el.classList.add('in');
  link.whenGone(() => root.unmount());
}
