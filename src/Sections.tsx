// The readable version, below the arcade: experience, projects and contact as plain text in the
// same white-sticker style, each with a hash anchor. The machines hand out the same things
// (vending: experience, gacha: projects), and each card here can send you back up to play for it.
import { arcade, type MachineId } from './arcade/store';
import { EXPERIENCE } from './data/experience';
import { PROJECTS } from './data/projects';
import { loadReel, reel } from './resume/store';

/** Scroll back up to the arcade with a machine in focus. */
export function play(machine: MachineId) {
  arcade.set({ focus: machine, shot: 'main' });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// The Résumé links play the reel; a modified click (new tab, download) still gets the PDF itself.
export function openReel(e: React.MouseEvent) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
  e.preventDefault();
  reel.set({ open: true });
}

export default function Sections() {
  return (
    <div className="sections">
      <section id="experience" className="section">
        <h2 className="section-title">Experience</h2>
        <p className="section-lead">The boring version. The vending machine sells these as cards. <button type="button" className="pill" onClick={() => play('vending')}>Buy one instead ↑</button></p>
        <ol className="cards">
          {EXPERIENCE.map((e) => (
            <li key={e.id} id={`exp-${e.id}`} className="card">
              <div className="card-head"><h3>{e.title}</h3><span className="card-dates">{e.dates}</span></div>
              <p className="card-role">{e.role}</p>
              <ul className="bullets">{e.bullets.map((b) => <li key={b}>{b}</li>)}</ul>
              <ul className="tags">{e.tags.map((t) => <li key={t}>{t}</li>)}</ul>
            </li>
          ))}
        </ol>
      </section>

      <section id="projects" className="section">
        <h2 className="section-title">Projects</h2>
        <p className="section-lead">The gacha machine dispenses these, pranks included. <button type="button" className="pill" onClick={() => play('gacha')}>Turn the handle instead ↑</button></p>
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
      </section>

      <section id="contact" className="section">
        <h2 className="section-title">Contact</h2>
        <p className="section-lead">Say hi. I reply faster than the claw machine pays out.</p>
        <div className="contact-row">
          <a className="pill" href="mailto:ewei@olin.edu">ewei@olin.edu</a>
          <a className="pill" href="https://github.com/We1chJ" target="_blank" rel="noreferrer">GitHub ↗</a>
          <a className="pill" href="https://linkedin.com/in/erqi-jack-wei" target="_blank" rel="noreferrer">LinkedIn ↗</a>
          <a className="pill" href="/assets/ResumeOfficial.pdf" onPointerEnter={() => loadReel()} onFocus={() => loadReel()} onClick={openReel}>Résumé</a>
        </div>
        <footer className="site-footer">Built with React Three Fiber and Rapier. The machines are real physics; the jobs are real jobs.</footer>
      </section>
    </div>
  );
}
