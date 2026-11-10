// The sections as what each machine hands over. Projects are the vending machine's own cards, in the
// pockets of a binder page, with a grading slip for the one taken out. Experience is a strip of tickets
// fed out of the gacha, one a job. About is what hangs off a plush from the claw: its tags, and the care
// label sewn into it. Printed things keep their colours in both themes, as the loading ticket does.
import { useEffect, useRef, useState } from 'react';
import { LogoLink } from '../arcade/logos';
import { EXPERIENCE, SKILLS, type Experience } from '../data/experience';
import type { Rarity } from '../data/schema';
import { SOFTWARE } from '../data/software';
import { loadReel } from '../resume/store';
import { openReel } from '../Sections';
import { S, useSquish } from '../Squish';
import { cardPictures } from '../vending/art';
import { LINK_VERB, play, Rich, Scene } from './shared';
import './prizes.css';

const STARS: Record<Rarity, number> = { COMMON: 1, RARE: 2, LEGENDARY: 3, SHINY: 4 };
const serial = (i: number) => `#${String(i + 1).padStart(3, '0')}/${String(SOFTWARE.length).padStart(3, '0')}`;
type Faces = { front: string; back: string };

/** The cards the vending machine sells, in a binder page. Taking one out reads its grading slip below. */
function Binder() {
  const [faces, setFaces] = useState<(Faces | null)[]>(() => SOFTWARE.map(() => null));
  const [at, setAt] = useState(0);
  const [turned, setTurned] = useState(false);
  useEffect(() => {
    let alive = true;
    SOFTWARE.forEach((p, i) => void cardPictures(p, i, SOFTWARE.length, 1).then((f) => { if (alive) setFaces((all) => all.map((x, k) => (k === i ? f : x))); }));
    return () => { alive = false; };
  }, []);
  const p = SOFTWARE[at];
  return (
    <>
      <ul className="pz-binder">
        {SOFTWARE.map((c, i) => (
          <li key={c.id} id={`project-${c.id}`}>
            <button
              type="button" className={`pz-card rarity-${c.rarity.toLowerCase()}${i === at ? ' out' : ''}${i === at && turned ? ' turned' : ''}`} aria-pressed={i === at}
              aria-label={i === at ? `${c.title}: turn it over` : `${c.title}: take it out`}
              onClick={() => { if (i === at) setTurned(!turned); else { setAt(i); setTurned(false); } }}
            >
              {faces[i] && <><img className="front" src={faces[i]!.front} alt="" /><img className="back" src={faces[i]!.back} alt="" /></>}
            </button>
          </li>
        ))}
      </ul>
      <article className={`pz-slip rarity-${p.rarity.toLowerCase()}`} aria-live="polite">
        <header>
          <b>Jack Cards</b>
          <span>{serial(at)}</span>
          <span>{p.rarity.toLowerCase()} {'★'.repeat(STARS[p.rarity])}</span>
        </header>
        <div className="pz-slip-body">
          <h3>{p.title}</h3>
          <p>{p.blurb}</p>
          <dl>
            {p.proof && <div><dt>Proof</dt><dd>{p.proof}</dd></div>}
            <div><dt>Stack</dt><dd>{p.stack.join(', ')}</dd></div>
          </dl>
          <div className="pz-row">
            {p.links?.map((l) => <a key={l.url} className="pz-go" href={l.url} target="_blank" rel="noreferrer">{LINK_VERB[l.kind]}</a>)}
            <button type="button" className="pz-turn" onClick={() => setTurned(!turned)}>{turned ? 'Show the front' : 'Turn the card over'}</button>
          </div>
        </div>
      </article>
    </>
  );
}

/** One job: a ticket of the strip. The stub says when. */
function Ticket({ e }: { e: Experience }) {
  return (
    <li id={`exp-${e.id}`} className="pz-ticket">
      <div className="pz-stub"><span>{e.dates}</span><i aria-hidden="true" /></div>
      <div className="pz-face">
        <h3><S>{e.title}</S></h3>
        <p className="pz-role"><S>{e.role}</S></p>
        <ul>{e.bullets.map((b) => <li key={b}><Rich>{b}</Rich></li>)}</ul>
        <p className="pz-with"><S>{e.tags.join(', ')}</S></p>
      </div>
    </li>
  );
}

/** A plush's swing tag, on its string. */
function Tag({ e }: { e: Experience }) {
  return (
    <li id={`exp-${e.id}`} className="pz-tag">
      <div className="pz-tag-in">
        <p className="pz-when"><S>{e.dates}</S></p>
        <h3><S>{e.title}</S></h3>
        <p className="pz-role"><S>{e.role}</S></p>
        <ul>{e.bullets.map((b) => <li key={b}><Rich>{b}</Rich></li>)}</ul>
      </div>
    </li>
  );
}

// Care symbols, drawn as a label prints them: wash, do not bleach, iron, do not tumble dry.
const CARE = [
  <><path d="M3 8l2 11h14l2-11" /><path d="M3 8c2 1.6 4 1.6 6 0s4-1.6 6 0 4 1.6 6 0" /><circle cx="12" cy="14.5" r="1" /></>,
  <><path d="M12 4l9 16H3z" /><path d="M5 5l14 15M19 5L5 20" /></>,
  <><path d="M4 18h16l-2-8H8.5C6 10 4.5 12 4 18z" /><path d="M8.5 10V7H17" /><circle cx="12" cy="14.5" r="1" /></>,
  <><rect x="3.5" y="3.5" width="17" height="17" /><circle cx="12" cy="12" r="6" /><path d="M4 4l16 16M20 4L4 20" /></>,
];

export default function Prizes() {
  const root = useRef<HTMLDivElement>(null);
  useSquish(root);
  const jobs = EXPERIENCE.filter((e) => !e.about), about = EXPERIENCE.filter((e) => e.about);
  return (
    <div ref={root} className="sections ui-prizes">
      <Scene id="projects" side="right" title="Projects">
        <p className="pz-lead"><span><S>The cards the vending machine sells. Take one out to read it.</S></span> <button type="button" className="pz-go" onClick={() => play('vending')}>Buy one</button></p>
        <Binder />
      </Scene>

      <Scene id="experience" side="left" title="Experience">
        <p className="pz-lead"><span><S>Work and research, from the résumé. One ticket a job.</S></span> <button type="button" className="pz-go" onClick={() => play('gacha')}>Turn the handle</button></p>
        <ol className="pz-strip">{jobs.map((e) => <Ticket key={e.id} e={e} />)}</ol>
      </Scene>

      <Scene id="about" side="right" title="About">
        <p className="pz-lead"><span><S>The claw machine has plush versions of me. These are their tags.</S></span> <button type="button" className="pz-go" onClick={() => play('claw')}>Win one</button></p>
        <ul className="pz-tags">
          {about.map((e) => <Tag key={e.id} e={e} />)}
        </ul>
        <section className="pz-care" aria-label="Skills">
          <h3><S>Made of</S></h3>
          <dl>{SKILLS.map((s) => <div key={s.group}><dt><S>{s.group}</S></dt><dd><S>{s.items.join(', ')}</S></dd></div>)}</dl>
          <div className="pz-symbols" aria-hidden="true">{CARE.map((d, i) => <svg key={i} viewBox="0 0 24 24">{d}</svg>)}</div>
          <p><S>Machine wash cold. Do not bleach. Do not deploy on a Friday.</S></p>
        </section>
      </Scene>

      <Scene id="contact" side="left" title="Contact">
        <ul className="pz-strip">
          <li className="pz-ticket pz-claim">
            <div className="pz-stub"><span>Say hi</span><i aria-hidden="true" /></div>
            <div className="pz-face">
              <h3><S>Good for one reply</S></h3>
              <p className="pz-role"><S>I reply faster than the claw machine pays out.</S></p>
              <div className="pz-row">
                <a className="pz-go" href="mailto:ewei@olin.edu">ewei@olin.edu</a>
                <LogoLink name="github" className="pz-go pz-mark" />
                <LogoLink name="linkedin" className="pz-go pz-mark" />
                <LogoLink name="instagram" className="pz-go pz-mark" />
                <a className="pz-go" href="/assets/ResumeOfficial.pdf" onPointerEnter={() => loadReel()} onFocus={() => loadReel()} onClick={openReel}>Résumé</a>
              </div>
              <p className="pz-with"><S>Built with React Three Fiber and Rapier. The machines are real physics; the jobs are real jobs.</S></p>
            </div>
          </li>
        </ul>
      </Scene>
    </div>
  );
}
