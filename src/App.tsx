import { useCallback, useEffect, useRef, useState } from 'react';
import GachaScene, { type GachaController } from './scene/GachaScene';
import { PROJECTS, type Project } from './data/projects';

const TOTAL = 14;
const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

export default function App() {
  const controller = useRef<GachaController | null>(null);
  const [found, setFound] = useState<Set<number>>(() => new Set());
  const [card, setCard] = useState<Project | null>(null);
  const [secrets, setSecrets] = useState(0);
  const [boring, setBoring] = useState(() => { try { return localStorage.getItem('boring') === '1'; } catch { return false; } });
  const taps = useRef(0);
  const konami = useRef(0);

  const onRoll = useCallback((capsuleIndex: number) => {
    const projectIndex = capsuleIndex % PROJECTS.length;
    setFound((f) => new Set(f).add(projectIndex));
    setCard(PROJECTS[projectIndex]);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      konami.current = e.key === KONAMI[konami.current] ? konami.current + 1 : (e.key === KONAMI[0] ? 1 : 0);
      if (konami.current === KONAMI.length) { konami.current = 0; setSecrets((s) => Math.min(7, s + 1)); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggleBoring = (on: boolean) => {
    setBoring(on);
    try { localStorage.setItem('boring', on ? '1' : '0'); } catch { /* storage unavailable */ }
  };

  if (boring) return <BoringMode onBack={() => toggleBoring(false)} />;

  return (
    <div className="wrap">
      <header className="bar">
        <a className="logo" href="/">jackwei.dev</a>
        <nav className="nav" aria-label="Main">
          <a href="#jackdex">Projects</a>
          <a href="#about">About</a>
          <span className="secret">Secrets found: {secrets}/7</span>
        </nav>
        <button className="btn quiet" onClick={() => toggleBoring(true)}>Boring Mode <span className="sad">(sad)</span></button>
      </header>

      <section className="hero">
        <div className="pitch">
          <h1>I make too many things.</h1>
          <p className="lede">Crank the machine. Get a project. Repeat until something impresses you.</p>
          <div className="actions">
            <button className="btn primary" onClick={() => controller.current?.spin()}>Crank it</button>
            <a className="btn" href="#jackdex">See all {TOTAL}</a>
            <span className="count">Found {found.size} of {TOTAL}</span>
          </div>
          <p className="hint">Drag the pink handle to crank it yourself. Drag the machine to look around.</p>
        </div>

        <div className="stage">
          <div className="scene"><GachaScene controller={controller} onRoll={onRoll} /></div>
          <div className={`card sticker ${card ? 'show' : ''}`} aria-live="polite">
            {card && (
              <>
                <span className={`rar ${card.rarity.toLowerCase()}`}>{card.rarity}</span>
                <h3>{card.title}</h3>
                <p>{card.blurb}</p>
                <div className="tags">{card.tags.map((t) => <span key={t}>{t}</span>)}</div>
                {card.url ? <a className="btn primary" href={card.url} target="_blank" rel="noreferrer">Open project</a> : <button className="btn" onClick={() => setCard(null)}>Put it back</button>}
              </>
            )}
          </div>
          <button
            className="mascot"
            title="Jack"
            onClick={() => { if (++taps.current === 10) setSecrets((s) => Math.min(7, s + 1)); }}
          >
            <img src="/mascot.jpg" alt="Yellow Jack, a shocked white blob with a sprout" />
          </button>
        </div>
      </section>

      <section className="shelf sticker" id="jackdex">
        <header>
          <h2>Jackdex</h2>
          <span className="meta">Collect them all. Some are shiny.</span>
        </header>
        <div className="slots">
          {Array.from({ length: TOTAL }, (_, i) => {
            const p = PROJECTS[i];
            return p && found.has(i)
              ? <div key={i} className={`slot got ${p.rarity === 'SHINY' ? 'shiny' : ''}`}>{p.title}</div>
              : <div key={i} className="slot">?</div>;
          })}
        </div>
      </section>

      <footer className="foot" id="about">
        <span>There are 7 secrets on this page. One of them is <kbd>↑</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>↓</kbd>…</span>
        <span>Made with too much free time by Jack Wei</span>
      </footer>
    </div>
  );
}

function BoringMode({ onBack }: { onBack: () => void }) {
  return (
    <div className="plain">
      <div className="in">
        <button className="back" onClick={onBack}>Make it fun again</button>
        <div className="sulk"><img src="/mascot.jpg" alt="" /><span>Jack has been placed in time-out until you leave Boring Mode.</span></div>
        <h1>Jack Wei</h1>
        <p>Computer Science, Olin College of Engineering, class of 2028. GPA 3.96.<br />
          <a href="https://github.com/We1chJ">github.com/We1chJ</a> · <a href="https://linkedin.com/in/erqi-jack-wei">linkedin.com/in/erqi-jack-wei</a> · ewei@olin.edu · <a href="/assets/ResumeOfficial.pdf">Download PDF</a></p>
        <h2>Experience</h2>
        <ul>
          <li>Software Engineer Intern, Bloomberg (Summer 2026)</li>
          <li>Software Engineer Research Intern, Raytheon BBN Technologies (2024, 2025)</li>
          <li>Mobile App Developer and Researcher, Olin PLai Lab (2025–present)</li>
          <li>UAS SAR Researcher, MIT Lincoln Laboratory BWSI (2023)</li>
        </ul>
        <h2>Projects</h2>
        <ul>{PROJECTS.slice(0, 5).map((p) => <li key={p.id}>{p.title}</li>)}</ul>
        <p><em>This is the whole resume, with no jokes. The fun version is one click away.</em></p>
      </div>
    </div>
  );
}
