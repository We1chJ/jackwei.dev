// The readable sections. Each belongs to a machine: as the page scrolls that machine slides out of the
// row and stands beside its section (src/arcade/path.ts), so here each only fills the other half of the
// window. The sections marked data-stop are the journey's stops, in order; keep them matching SCENES.
import { arcade, type MachineId } from './arcade/store';
import { EXPERIENCE, SKILLS } from './data/experience';
import { PROJECTS } from './data/projects';
import { loadReel, reel } from './resume/store';

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
      <div className="card-head"><h3>{entry.title}</h3><span className="card-dates">{entry.dates}</span></div>
      <p className="card-role">{entry.role}</p>
      <ul className="bullets">{entry.bullets.map((b) => <li key={b}>{b}</li>)}</ul>
      <ul className="tags">{entry.tags.map((t) => <li key={t}>{t}</li>)}</ul>
    </li>
  );
}

export default function Sections() {
  return (
    <div className="sections">
      <section id="experience" data-stop className="scene cards-right">
        <div className="scene-col">
          <h2 className="section-title">Experience</h2>
          <p className="section-lead">The vending machine sells these as cards. <button type="button" className="pill" onClick={() => play('vending')}>Buy one</button></p>
          <ol className="cards">{EXPERIENCE.filter((e) => !e.about).map((e) => <EntryCard key={e.id} entry={e} />)}</ol>
        </div>
      </section>

      <section id="projects" data-stop className="scene cards-left">
        <div className="scene-col">
          <h2 className="section-title">Projects</h2>
          <p className="section-lead">The gacha machine dispenses these, pranks included. <button type="button" className="pill" onClick={() => play('gacha')}>Turn the handle</button></p>
          <ul className="cards projects-grid">
            {PROJECTS.filter((p) => p.listed !== false).map((p) => (
              <li key={p.id} id={`project-${p.id}`} className={`card rarity-${p.rarity.toLowerCase()}`}>
                <span className="card-rarity">{p.rarity}</span>
                <h3>{p.title}</h3>
                <p className="card-blurb">{p.blurb}</p>
                <ul className="tags">{p.tags.map((t) => <li key={t}>{t}</li>)}</ul>
                {p.url && <div className="card-links"><a className="pill" href={p.url} target="_blank" rel="noreferrer">Open ↗</a></div>}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="about" data-stop className="scene cards-right">
        <div className="scene-col">
          <h2 className="section-title">About</h2>
          <p className="section-lead">School, contests and tools. The claw machine has plush versions of me. <button type="button" className="pill" onClick={() => play('claw')}>Win one</button></p>
          <ol className="cards">
            {EXPERIENCE.filter((e) => e.about).map((e) => <EntryCard key={e.id} entry={e} />)}
            <li className="card">
              <h3>Skills</h3>
              {SKILLS.map((s) => (
                <div key={s.group} className="skill-group">
                  <h4>{s.group}</h4>
                  <ul className="tags">{s.items.map((t) => <li key={t}>{t}</li>)}</ul>
                </div>
              ))}
            </li>
          </ol>
        </div>
      </section>

      <section id="contact" data-stop className="scene cards-left">
        <div className="scene-col">
          <h2 className="section-title">Contact</h2>
          <p className="section-lead">Say hi. I reply faster than the claw machine pays out.</p>
          <div className="contact-row">
            <a className="pill" href="mailto:ewei@olin.edu">ewei@olin.edu</a>
            <a className="pill" href="https://github.com/We1chJ" target="_blank" rel="noreferrer">GitHub ↗</a>
            <a className="pill" href="https://linkedin.com/in/erqi-jack-wei" target="_blank" rel="noreferrer">LinkedIn ↗</a>
            <a className="pill" href="/assets/ResumeOfficial.pdf" onPointerEnter={() => loadReel()} onFocus={() => loadReel()} onClick={openReel}>Résumé</a>
          </div>
          <footer className="site-footer">Built with React Three Fiber and Rapier. The machines are real physics; the jobs are real jobs.</footer>
        </div>
      </section>
    </div>
  );
}
