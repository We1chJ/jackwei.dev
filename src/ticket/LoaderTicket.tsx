// The ticket on the loading screen: the photo printing itself in step with the real progress, and a
// stub that stays on until everything is ready. Tearing it off is the way in. src/loader.ts owns the
// progress and everything that happens after the tear.
import { useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import type { loading } from '../loader';
import RefineFrame from './RefineFrame';
import TearTicket from './TearTicket';
import './ticket.css';

type Link = typeof loading.ticket;

function Ticket({ link }: { link: Link }) {
  const { progress, ready, failed } = useSyncExternalStore(link.watch, link.get);
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
          <div className="ticket-stub">
            <small>Jack Wei Arcade</small>
            <strong>Admit<br />one</strong>
            <span className={ready ? 'ticket-hint on' : 'ticket-hint'}><i className="dm" />{ready ? 'Tear to enter' : 'Printing'}</span>
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
        <p className="ticket-side"><b>Jack Wei</b><i className="dm" /><span>Arcade</span></p>
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
