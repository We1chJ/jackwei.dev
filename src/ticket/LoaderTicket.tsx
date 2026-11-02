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

function Ticket({ link }: { link: Link }) {
  const { progress, ready, failed } = useSyncExternalStore(link.watch, link.get);
  const [tearing, setTearing] = useState(false);
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
