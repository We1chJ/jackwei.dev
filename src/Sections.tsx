// The readable sections. Each belongs to a machine: as the page scrolls that machine slides out of the
// row and stands beside its section (src/arcade/path.ts), so here each only fills the other half of the
// window. The sections marked data-stop are the journey's stops, in order; keep them matching SCENES.
import { useRef } from 'react';
import { LogoLink } from './arcade/logos';
import Magnet from './arcade/Magnet';
import SquishTitle from './arcade/SquishTitle';
import { arcade, type MachineId } from './arcade/store';
import { EXPERIENCE, SKILLS } from './data/experience';
import type { Link } from './data/schema';
import { SOFTWARE } from './data/software';
import { loadReel, reel } from './resume/store';
import { S, useSquish } from './Squish';

const LINK_LABEL: Record<Link['kind'], string> = { live: 'Open', code: 'Code', video: 'Video' };

/** Play the machine beside this section; leaving it comes back to the same place on the page. */
const play = (machine: MachineId) => arcade.set({ focus: machine, shot: 'main' });

// The Résumé links play the reel; a modified click (new tab, download) still gets the PDF itself.
export function openReel(e: React.MouseEvent) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
  e.preventDefault();
  reel.set({ open: true });
}

function EntryCard({ entry }: { entry: (typeof EXPERIENCE)[number] }) {
  return (
    <li id={`exp-${entry.id}`} className="card">
      <div className="card-head"><h3><S>{entry.title}</S></h3><span className="card-dates"><S>{entry.dates}</S></span></div>
      <p className="card-role"><S>{entry.role}</S></p>
      <ul className="bullets">{entry.bullets.map((b) => <li key={b}><S>{b}</S></li>)}</ul>
      <ul className="tags">{entry.tags.map((t) => <li key={t}><S>{t}</S></li>)}</ul>
    </li>
  );
}

export default function Sections() {
  const root = useRef<HTMLDivElement>(null);
  useSquish(root);
  return (
    <div ref={root} className="sections">
      <section id="projects" data-stop className="scene cards-right">
        <div className="scene-col">
          <SquishTitle text="Projects" />
          <p className="section-lead"><span><S>The vending machine sells these as cards.</S></span> <button type="button" className="pill" onClick={() => play('vending')}>Buy one</button></p>
          <ul className="cards projects-grid">
            {SOFTWARE.map((p) => (
              <li key={p.id} id={`project-${p.id}`} className={`card rarity-${p.rarity.toLowerCase()}`}>
                <span className="card-rarity">{p.rarity}</span>
                <h3><S>{p.title}</S></h3>
                <p className="card-blurb"><S>{p.blurb}</S></p>
                <ul className="tags">{p.stack.map((t) => <li key={t}><S>{t}</S></li>)}</ul>
                {p.links && (
                  <div className="card-links">
                    {p.links.map((l) => <a key={l.url} className="pill" href={l.url} target="_blank" rel="noreferrer">{LINK_LABEL[l.kind]} ↗</a>)}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="experience" data-stop className="scene cards-left">
        <div className="scene-col">
          <SquishTitle text="Experience" />
          <p className="section-lead"><span><S>Work and research, from the résumé.</S></span> <button type="button" className="pill" onClick={() => play('gacha')}>Turn the handle</button></p>
          <ol className="cards">{EXPERIENCE.filter((e) => !e.about).map((e) => <EntryCard key={e.id} entry={e} />)}</ol>
        </div>
      </section>

      <section id="about" data-stop className="scene cards-right">
        <div className="scene-col">
          <SquishTitle text="About" />
          <p className="section-lead"><span><S>School, contests and tools. The claw machine has plush versions of me.</S></span> <button type="button" className="pill" onClick={() => play('claw')}>Win one</button></p>
          <ol className="cards">
            {EXPERIENCE.filter((e) => e.about).map((e) => <EntryCard key={e.id} entry={e} />)}
            <li className="card">
              <h3><S>Skills</S></h3>
              {SKILLS.map((s) => (
                <div key={s.group} className="skill-group">
                  <h4><S>{s.group}</S></h4>
                  <ul className="tags">{s.items.map((t) => <li key={t}><S>{t}</S></li>)}</ul>
                </div>
              ))}
            </li>
          </ol>
        </div>
      </section>

      <section id="contact" data-stop className="scene cards-left">
        <div className="scene-col">
          <SquishTitle text="Contact" />
          <p className="section-lead"><span><S>Say hi. I reply faster than the claw machine pays out.</S></span></p>
          <div className="contact-row">
            <a className="pill" href="mailto:ewei@olin.edu">ewei@olin.edu</a>
            <LogoLink name="github" className="pill logo" />
            <LogoLink name="linkedin" className="pill logo" />
            <LogoLink name="instagram" className="pill logo" />
            <Magnet><a className="pill" href="/assets/ResumeOfficial.pdf" onPointerEnter={() => loadReel()} onFocus={() => loadReel()} onClick={openReel}>Résumé</a></Magnet>
          </div>
          <footer className="site-footer"><S>Built with React Three Fiber and Rapier. The machines are real physics; the jobs are real jobs.</S></footer>
        </div>
      </section>
    </div>
  );
}
