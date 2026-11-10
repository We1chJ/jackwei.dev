// What every presentation of the sections shares: the scene each one stands in (the journey's stops,
// src/arcade/track.ts), the way into a machine, and a few small text helpers.
import { useEffect, type ReactNode } from 'react';
import SquishTitle from '../arcade/SquishTitle';
import { arcade, type MachineId } from '../arcade/store';
import type { Link } from '../data/schema';

export const LINK_VERB: Record<Link['kind'], string> = { live: 'Open the site', code: 'Read the code', video: 'Watch the video' };

/** Play the machine beside this section; leaving it comes back to the same place on the page. */
export const play = (machine: MachineId) => arcade.set({ focus: machine, shot: 'main' });

/** One stop of the journey. `side` is where the text goes; the machine stands on the other. */
export function Scene({ id, side, title, children }: { id: string; side: 'left' | 'right'; title: string; children: ReactNode }) {
  return (
    <section id={id} data-stop className={`scene cards-${side}`}>
      <div className="scene-col">
        <SquishTitle text={title} />
        {children}
      </div>
    </section>
  );
}

const YEAR = /^(19|20)\d\d\b/;
const FIGURE = /^[$~]?\d/;
/** Squishable words (src/Squish.tsx), with the figures (56%, $1.5M, 3,000+) marked up as <b>. */
export function Rich({ children }: { children: string }) {
  return (
    <>
      {children.split(/(\s+)/).map((w, i) => {
        if (!w || /^\s+$/.test(w)) return w;
        return FIGURE.test(w) && !YEAR.test(w) ? <b key={i} className="sq fig">{w}</b> : <span key={i} className="sq">{w}</span>;
      })}
    </>
  );
}

/** A stylesheet from Google Fonts, added once and left in place. */
export function useFont(href: string) {
  useEffect(() => {
    if (document.querySelector(`link[data-font="${href}"]`)) return;
    const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href });
    link.dataset.font = href;
    document.head.append(link);
  }, [href]);
}

/** "ICPC 2025: top 5 in the district." as its two halves. */
export function halves(line: string): [string, string] {
  const at = line.indexOf(': ');
  return at < 0 ? ['', line] : [line.slice(0, at), line.slice(at + 2)];
}
