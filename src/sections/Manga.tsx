// The sections as manga pages: each a sheet of inked panels beside its machine. Dates sit in caption
// boxes, the way a page says when and where; what was done is spoken in bubbles whose tails point at the
// machine; a win is a shout. The lettering marks figures the way manga marks a stressed word.
import { useRef, type ReactNode } from 'react';
import { LogoLink } from '../arcade/logos';
import type { MachineId } from '../arcade/store';
import { EXPERIENCE, SKILLS, type Experience } from '../data/experience';
import type { Rarity, Software } from '../data/schema';
import { SOFTWARE } from '../data/software';
import { loadReel } from '../resume/store';
import { openReel } from '../Sections';
import { S, useSquish } from '../Squish';
import { halves, LINK_VERB, play, Rich, Scene, useFont } from './shared';
import './manga.css';

// The sound each machine makes, as a manga would letter it, with how to say it.
const SOUND = { vending: ['ガコン', 'ga-kon'], gacha: ['ガチャ', 'gacha'], claw: ['ウィーン', 'wiiin'], end: ['つづく', 'to be continued'] } as const;
const SFX_FONT = `https://fonts.googleapis.com/css2?family=Reggae+One&display=swap&text=${encodeURIComponent('ガコンチャウィーつづく')}`;
const STARS: Record<Rarity, number> = { COMMON: 1, RARE: 2, LEGENDARY: 3, SHINY: 4 };

// A shout's outline: a ring of spikes, a little uneven.
const SHOUT = (() => {
  const spikes = 13, points: string[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 0.76 + ((i * 7) % 5) * 0.014 : 1 - ((i * 3) % 4) * 0.02;
    points.push(`${(50 + 50 * r * Math.cos(a)).toFixed(1)}% ${(50 + 50 * r * Math.sin(a)).toFixed(1)}%`);
  }
  return `polygon(${points.join(',')})`;
})();

function Sfx({ sound }: { sound: keyof typeof SOUND }) {
  const [kana, say] = SOUND[sound];
  return <span className="mg-sfx" aria-hidden="true"><b>{kana}</b><i>{say}</i></span>;
}

/** The mascot in a small panel, saying the section's opening line. */
function Narrator({ line, children }: { line: string; children?: ReactNode }) {
  return (
    <div className="mg-narrator">
      <div className="mg-face"><img src="/mascot.jpg" alt="" /></div>
      <div className="mg-says">
        <p className="mg-bubble tail-face"><S>{line}</S></p>
        {children}
      </div>
    </div>
  );
}

function Play({ machine, children }: { machine: MachineId; children: string }) {
  return <button type="button" className="mg-btn" onClick={() => play(machine)}>{children}</button>;
}

function Project({ p, shape }: { p: Software; shape: string }) {
  const shout = p.rarity === 'LEGENDARY' || p.rarity === 'SHINY' ? p.proof : undefined;
  return (
    <li id={`project-${p.id}`} className={`mg-cell ${shape}`}>
      <div className="mg-panel">
        <div className="mg-in">
          <div className={`mg-art${p.cover ? '' : ` tone-${(p.title.length % 3) + 1}`}`}>
            {p.cover && <img src={`/software/${p.id}/${p.cover}`} alt="" loading="lazy" />}
          </div>
          <div className="mg-body">
            <h3><S>{p.title}</S> <span className="mg-stars" role="img" aria-label={`${p.rarity.toLowerCase()} card`}>{'★'.repeat(STARS[p.rarity])}</span></h3>
            <p className="mg-bubble"><Rich>{p.blurb}</Rich></p>
            <p className="mg-credits"><S>{`Made with ${p.stack.join(', ')}`}</S></p>
            {p.links?.map((l) => <a key={l.url} className="mg-btn" href={l.url} target="_blank" rel="noreferrer">{LINK_VERB[l.kind]}</a>)}
          </div>
        </div>
      </div>
      {shout && <p className="mg-shout" style={{ clipPath: SHOUT }}><span style={{ clipPath: SHOUT }}><em>{shout}</em></span></p>}
    </li>
  );
}

/** One job: a panel of a four-panel strip. The first bubble's tail points at the machine. */
function Koma({ e, flip }: { e: Experience; flip: boolean }) {
  return (
    <li id={`exp-${e.id}`} className={`mg-cell mg-koma${flip ? ' flip' : ''}`}>
      <div className="mg-panel">
        <div className="mg-in">
          <span className="mg-caption"><S>{e.dates}</S></span>
          <h3><S>{e.title}</S></h3>
          <p className="mg-role"><S>{e.role}</S></p>
          <div className="mg-talk">
            {e.bullets.map((b, i) => <p key={b} className={`mg-bubble${i === 0 ? ' tail-machine' : ''}`}><Rich>{b}</Rich></p>)}
          </div>
          <p className="mg-credits"><S>{`With ${e.tags.join(', ')}`}</S></p>
        </div>
      </div>
    </li>
  );
}

export default function Manga() {
  const root = useRef<HTMLDivElement>(null);
  useSquish(root);
  useFont(SFX_FONT);
  const jobs = EXPERIENCE.filter((e) => !e.about);
  const school = EXPERIENCE.find((e) => e.id === 'olin')!, contests = EXPERIENCE.find((e) => e.id === 'contests')!;
  // The first project gets the splash panel; the rest pair off across slanted gutters; one left over is a strip.
  const [splash, ...rest] = SOFTWARE;
  const shape = (i: number) => (i === rest.length - 1 && i % 2 === 0 ? 'strip' : `${i % 2 ? 'cut-b' : 'cut-a'} ${Math.floor(i / 2) % 2 ? 'lean-back' : 'lean'}`);

  return (
    <div ref={root} className="sections ui-manga">
      <Scene id="projects" side="right" title="Projects">
        <Sfx sound="vending" />
        <div className="mg-page">
          <Narrator line="The vending machine sells these as cards."><Play machine="vending">Buy one</Play></Narrator>
          <ul className="mg-panels">
            <Project p={splash} shape="splash" />
            {rest.map((p, i) => <Project key={p.id} p={p} shape={shape(i)} />)}
          </ul>
        </div>
      </Scene>

      <Scene id="experience" side="left" title="Experience">
        <Sfx sound="gacha" />
        <div className="mg-page">
          <Narrator line="Work and research, from the résumé."><Play machine="gacha">Turn the handle</Play></Narrator>
          <ol className="mg-panels">{jobs.map((e, i) => <Koma key={e.id} e={e} flip={i % 2 === 1} />)}</ol>
        </div>
      </Scene>

      <Scene id="about" side="right" title="About">
        <Sfx sound="claw" />
        <div className="mg-page">
          <Narrator line="School, contests and tools. The claw machine has plush versions of me."><Play machine="claw">Win one</Play></Narrator>
          <ol className="mg-panels">
            <Koma e={school} flip={false} />
            <li id={`exp-${contests.id}`} className="mg-cell">
              <div className="mg-panel">
                <div className="mg-in">
                  <span className="mg-caption"><S>{contests.dates}</S></span>
                  <h3><S>{contests.title}</S></h3>
                  <p className="mg-role"><S>{contests.role}</S></p>
                  <ul className="mg-wins">
                    {contests.bullets.map((b) => { const [what, how] = halves(b); return <li key={b}><b><S>{what}</S></b><span><Rich>{how[0].toUpperCase() + how.slice(1)}</Rich></span></li>; })}
                  </ul>
                </div>
              </div>
            </li>
            <li className="mg-cell">
              <div className="mg-panel">
                <div className="mg-in">
                  <h3><S>Skills</S></h3>
                  <dl className="mg-skills">
                    {SKILLS.map((s) => <div key={s.group}><dt><S>{s.group}</S></dt><dd><S>{s.items.join(', ')}</S></dd></div>)}
                  </dl>
                </div>
              </div>
            </li>
          </ol>
        </div>
      </Scene>

      <Scene id="contact" side="left" title="Contact">
        <Sfx sound="end" />
        <div className="mg-page">
          <Narrator line="Say hi. I reply faster than the claw machine pays out.">
            <div className="mg-links">
              <a className="mg-btn" href="mailto:ewei@olin.edu">ewei@olin.edu</a>
              <LogoLink name="github" className="mg-btn mg-mark" />
              <LogoLink name="linkedin" className="mg-btn mg-mark" />
              <LogoLink name="instagram" className="mg-btn mg-mark" />
              <a className="mg-btn" href="/assets/ResumeOfficial.pdf" onPointerEnter={() => loadReel()} onFocus={() => loadReel()} onClick={openReel}>Résumé</a>
            </div>
          </Narrator>
          <footer className="mg-foot"><S>Built with React Three Fiber and Rapier. The machines are real physics; the jobs are real jobs.</S></footer>
        </div>
      </Scene>
    </div>
  );
}
