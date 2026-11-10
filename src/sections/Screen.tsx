// The sections as what plays on an arcade cabinet's screen, each in a bezel of its machine's colours.
// Projects are the game select, in the vending machine's own slot codes; experience is the high-score
// table, newest first; about is the player's sheet; contact is the continue screen.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LOGOS } from '../arcade/logos';
import type { MachineId } from '../arcade/store';
import { EXPERIENCE, SKILLS } from '../data/experience';
import type { Rarity } from '../data/schema';
import { SOFTWARE } from '../data/software';
import { loadReel } from '../resume/store';
import { openReel } from '../Sections';
import { S, useSquish } from '../Squish';
import { halves, LINK_VERB, play, Rich, Scene, useFont } from './shared';
import './screen.css';

const FONT = 'https://fonts.googleapis.com/css2?family=VT323&display=swap';
const STARS: Record<Rarity, number> = { COMMON: 1, RARE: 2, LEGENDARY: 3, SHINY: 4 };
const RANK = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];
/** The vending machine's slot for card i: A1 to D4, four to a shelf. */
const slot = (i: number) => `${'ABCD'[Math.floor(i / 4)]}${(i % 4) + 1}`;

function Cabinet({ machine, marquee, action, children }: { machine: MachineId | 'end'; marquee: string; action?: string; children: ReactNode }) {
  return (
    <div className={`sc-cab of-${machine}`}>
      <div className="sc-marquee">
        <p><S>{marquee}</S></p>
        {action && machine !== 'end' && <button type="button" className="sc-push" onClick={() => play(machine)}>{action}</button>}
      </div>
      <div className="sc-screen">{children}</div>
    </div>
  );
}

/** The mascot at a few pixels a side, blown up: a sprite. */
function Sprite({ cells = 26 }: { cells?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const ctx = canvas.current?.getContext('2d');
      if (ctx) { ctx.imageSmoothingEnabled = true; ctx.drawImage(img, 0, 0, cells, cells); }
    };
    img.src = '/mascot.jpg';
  }, [cells]);
  return <canvas ref={canvas} className="sc-sprite" width={cells} height={cells} aria-hidden="true" />;
}

/** Nine to nought and round again, a second a step. */
function Countdown() {
  const [n, setN] = useState(9);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const id = setInterval(() => setN((x) => (x + 9) % 10), 1000);
    return () => clearInterval(id);
  }, []);
  return <b aria-hidden="true">{n}</b>;
}

export default function Screen() {
  const root = useRef<HTMLDivElement>(null);
  useSquish(root);
  useFont(FONT);
  const [game, setGame] = useState(0);
  const jobs = EXPERIENCE.filter((e) => !e.about);
  const school = EXPERIENCE.find((e) => e.id === 'olin')!, contests = EXPERIENCE.find((e) => e.id === 'contests')!;
  return (
    <div ref={root} className="sections ui-screen">
      <Scene id="projects" side="right" title="Projects">
        <Cabinet machine="vending" marquee="The vending machine sells these as cards." action="Buy one">
          <h3 className="sc-title">Select game</h3>
          <ul className="sc-list">
            {SOFTWARE.map((p, i) => (
              <li key={p.id} id={`project-${p.id}`} className={i === game ? 'on' : undefined}>
                <button type="button" aria-expanded={i === game} onClick={() => setGame(i)}>
                  <span className="sc-slot">{slot(i)}</span><b>{p.title}</b><span className={`sc-stars r-${p.rarity.toLowerCase()}`} role="img" aria-label={p.rarity.toLowerCase()}>{'★'.repeat(STARS[p.rarity])}</span>
                </button>
                {i === game && (
                  <div className="sc-detail">
                    <p>{p.blurb}</p>
                    {p.proof && <p className="sc-hi"><span>Hi-score</span> {p.proof}</p>}
                    <p className="sc-dim">{p.stack.join(' / ')}</p>
                    {p.links?.map((l) => <a key={l.url} className="sc-start" href={l.url} target="_blank" rel="noreferrer">{LINK_VERB[l.kind]}</a>)}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Cabinet>
      </Scene>

      <Scene id="experience" side="left" title="Experience">
        <Cabinet machine="gacha" marquee="Work and research, from the résumé." action="Turn the handle">
          <h3 className="sc-title">High scores</h3>
          <ol className="sc-scores">
            {jobs.map((e, i) => (
              <li key={e.id} id={`exp-${e.id}`}>
                <div className="sc-row"><span className="sc-rank">{RANK[i]}</span><b><S>{e.title}</S></b><span className="sc-when">{e.dates}</span></div>
                <p className="sc-role"><S>{e.role}</S></p>
                <ul>{e.bullets.map((b) => <li key={b}><Rich>{b}</Rich></li>)}</ul>
                <p className="sc-dim">{e.tags.join(' / ')}</p>
              </li>
            ))}
          </ol>
        </Cabinet>
      </Scene>

      <Scene id="about" side="right" title="About">
        <Cabinet machine="claw" marquee="The claw machine has plush versions of me." action="Win one">
          <h3 className="sc-title">Player 1</h3>
          <div id={`exp-${school.id}`} className="sc-player">
            <Sprite />
            <div>
              <b>Jack Wei</b>
              <p>{school.title}, {school.role}</p>
              <p className="sc-dim">{school.dates}</p>
            </div>
          </div>
          <ul className="sc-lines">{school.bullets.map((b) => <li key={b}><Rich>{b}</Rich></li>)}</ul>
          <h3 className="sc-title">Achievements</h3>
          <ul id={`exp-${contests.id}`} className="sc-wins">
            {contests.bullets.map((b) => { const [what, how] = halves(b); return <li key={b}><b>{what}</b><i aria-hidden="true" /><span><Rich>{how.replace(/\.$/, '')}</Rich></span></li>; })}
          </ul>
          <h3 className="sc-title">Inventory</h3>
          <dl className="sc-bag">{SKILLS.map((s) => <div key={s.group}><dt>{s.group}</dt><dd>{s.items.join(' / ')}</dd></div>)}</dl>
        </Cabinet>
      </Scene>

      <Scene id="contact" side="left" title="Contact">
        <Cabinet machine="end" marquee="Say hi. I reply faster than the claw machine pays out.">
          <h3 className="sc-title sc-continue">Continue? <Countdown /></h3>
          <ul className="sc-list sc-links">
            <li><a href="mailto:ewei@olin.edu"><b>Email</b><span>ewei@olin.edu</span></a></li>
            {(['github', 'linkedin', 'instagram'] as const).map((n) => <li key={n}><a href={LOGOS[n].href} target="_blank" rel="noreferrer"><b>{LOGOS[n].label}</b><span>{new URL(LOGOS[n].href).pathname.replace(/^\/(in\/)?|\/$/g, '')}</span></a></li>)}
            <li><a href="/assets/ResumeOfficial.pdf" onPointerEnter={() => loadReel()} onFocus={() => loadReel()} onClick={openReel}><b>Résumé</b><span>one page</span></a></li>
          </ul>
          <p className="sc-dim">Built with React Three Fiber and Rapier. The machines are real physics; the jobs are real jobs.</p>
        </Cabinet>
      </Scene>
    </div>
  );
}
