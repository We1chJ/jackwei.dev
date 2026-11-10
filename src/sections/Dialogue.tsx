// The sections as a game's dialogue: one box in which Jack talks, and a list of things to ask him about.
// Picking one has him tell it, typed out; a click on the box finishes the line. Each section's nameplate
// wears its machine's colours.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LOGOS } from '../arcade/logos';
import type { MachineId } from '../arcade/store';
import { EXPERIENCE, SKILLS } from '../data/experience';
import type { Rarity } from '../data/schema';
import { SOFTWARE } from '../data/software';
import { loadReel } from '../resume/store';
import { openReel } from '../Sections';
import { S, useSquish } from '../Squish';
import { LINK_VERB, play, Scene } from './shared';
import './dialogue.css';

const SPEED = 170;   // characters a second
const STARS: Record<Rarity, number> = { COMMON: 1, RARE: 2, LEGENDARY: 3, SHINY: 4 };

type Line = { text: string; kind?: 'role' | 'note' };
type Topic = {
  id: string;
  /** In the list: its name, and a word beside it (when, or how rare). */
  label: string; meta: string;
  lines: Line[];
  cover?: string;
  links?: { label: string; href: string }[];
};

const PROJECTS: Topic[] = SOFTWARE.map((p) => ({
  id: `project-${p.id}`, label: p.title, meta: '★'.repeat(STARS[p.rarity]),
  lines: [{ text: p.blurb }, ...(p.proof && !p.blurb.includes(p.proof) ? [{ text: p.proof }] : []), { text: `Made with ${p.stack.join(', ')}.`, kind: 'note' as const }],
  cover: p.cover && `/software/${p.id}/${p.cover}`,
  links: p.links?.map((l) => ({ label: LINK_VERB[l.kind], href: l.url })),
}));
const told = (e: (typeof EXPERIENCE)[number]): Topic => ({
  id: `exp-${e.id}`, label: e.title, meta: e.dates,
  lines: [{ text: e.role, kind: 'role' }, ...e.bullets.map((text) => ({ text })), { text: `With ${e.tags.join(', ')}.`, kind: 'note' }],
});
const JOBS = EXPERIENCE.filter((e) => !e.about).map(told);
const ABOUT: Topic[] = [
  ...EXPERIENCE.filter((e) => e.about).map(told),
  { id: 'skills', label: 'Skills', meta: `${SKILLS.reduce((n, s) => n + s.items.length, 0)} tools`, lines: SKILLS.map((s) => ({ text: `${s.group}: ${s.items.join(', ')}.` })) },
];

/** How many characters of `total` have been said so far; `finish` says the rest at once. */
function useTyping(total: number, key: string, running: boolean) {
  const [said, setSaid] = useState(0);
  const cut = useRef(false);
  useEffect(() => {
    if (!running) return undefined;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setSaid(total); return undefined; }
    cut.current = false;
    setSaid(0);
    let raf = 0;
    const from = performance.now();
    const step = (now: number) => {
      if (cut.current) return;
      const n = Math.min(total, Math.floor(((now - from) / 1000) * SPEED));
      setSaid(n);
      if (n < total) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [total, key, running]);
  return [said, () => { cut.current = true; setSaid(total); }] as const;
}

/** The box: who is talking, their face, and what they say, typed. `children` follows once it is said. */
function Box({ machine, heading, meta, lines, cover, id, children }: { machine: MachineId | 'end'; heading?: string; meta?: string; lines: Line[]; cover?: string; id: string; children?: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { threshold: 0.35 });
    io.observe(box.current!);
    return () => io.disconnect();
  }, []);
  const total = lines.reduce((n, l) => n + l.text.length, 0);
  const [said, finish] = useTyping(total, id, seen);
  const talking = seen && said < total;
  let left = said;
  return (
    <div ref={box} className={`dg-box from-${machine}${talking ? ' talking' : ''}`} onClick={talking ? finish : undefined}>
      <span className="dg-name">Jack</span>
      <img className="dg-face" src="/mascot.jpg" alt="" />
      <div className="dg-said">
        {heading && <div className="dg-head"><h3>{heading}</h3><span>{meta}</span></div>}
        {cover && <img className="dg-cover" src={cover} alt="" />}
        <div aria-hidden="true">
          {lines.map((l, i) => {
            const take = Math.max(0, Math.min(l.text.length, left));
            left -= l.text.length;
            return <p key={i} className={l.kind}>{l.text.slice(0, take)}<span className="dg-unsaid">{l.text.slice(take)}</span></p>;
          })}
        </div>
        <div className="sr-only">{lines.map((l, i) => <p key={i}>{l.text}</p>)}</div>
        <div className={`dg-after${talking ? '' : ' in'}`}>{children}</div>
      </div>
      <i className="dg-more" aria-hidden="true" />
    </div>
  );
}

/** A section: the question, the things to ask about, and the box that answers. */
function Talk({ machine, ask, topics, action }: { machine: MachineId; ask: string; topics: Topic[]; action: string }) {
  const [at, setAt] = useState(0);
  const t = topics[at];
  return (
    <div className="dg">
      <p className="dg-ask"><span><S>{ask}</S></span> <button type="button" className="pill" onClick={() => play(machine)}>{action}</button></p>
      <ul className={`dg-menu${topics.length > 5 ? ' two' : ''}`}>
        {topics.map((x, i) => (
          <li key={x.id}>
            <button type="button" id={x.id} aria-pressed={i === at} onClick={() => setAt(i)}><b><S>{x.label}</S></b><span>{x.meta}</span></button>
          </li>
        ))}
      </ul>
      <Box machine={machine} heading={t.label} meta={t.meta} lines={t.lines} cover={t.cover} id={t.id}>
        {t.links?.map((l) => <a key={l.href} className="pill" href={l.href} target="_blank" rel="noreferrer">{l.label}</a>)}
        <button type="button" className="dg-next" onClick={() => setAt((at + 1) % topics.length)}>Next: {topics[(at + 1) % topics.length].label}</button>
      </Box>
    </div>
  );
}

export default function Dialogue() {
  const root = useRef<HTMLDivElement>(null);
  useSquish(root);
  return (
    <div ref={root} className="sections ui-dialogue">
      <Scene id="projects" side="right" title="Projects">
        <Talk machine="vending" ask="The vending machine sells these as cards. Which one do you want to hear about?" topics={PROJECTS} action="Buy one" />
      </Scene>
      <Scene id="experience" side="left" title="Experience">
        <Talk machine="gacha" ask="Work and research, from the résumé. Where should I start?" topics={JOBS} action="Turn the handle" />
      </Scene>
      <Scene id="about" side="right" title="About">
        <Talk machine="claw" ask="School, contests and tools. The claw machine has plush versions of me." topics={ABOUT} action="Win one" />
      </Scene>
      <Scene id="contact" side="left" title="Contact">
        <div className="dg">
          <Box machine="end" id="contact" lines={[{ text: 'Say hi. I reply faster than the claw machine pays out.' }, { text: 'Built with React Three Fiber and Rapier. The machines are real physics; the jobs are real jobs.', kind: 'note' }]} />
          <ul className="dg-menu two">
            <li><a href="mailto:ewei@olin.edu"><b>Email</b><span>ewei@olin.edu</span></a></li>
            {(['github', 'linkedin', 'instagram'] as const).map((n) => <li key={n}><a href={LOGOS[n].href} target="_blank" rel="noreferrer"><b>{LOGOS[n].label}</b><span>{new URL(LOGOS[n].href).pathname.replace(/^\/(in\/)?|\/$/g, '')}</span></a></li>)}
            <li><a href="/assets/ResumeOfficial.pdf" onPointerEnter={() => loadReel()} onFocus={() => loadReel()} onClick={openReel}><b>Résumé</b><span>one page</span></a></li>
          </ul>
        </div>
      </Scene>
    </div>
  );
}
