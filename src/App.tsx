import { useEffect } from 'react';
import HeroBadge from './arcade/HeroBadge';
import NameSign from './arcade/NameSign';
import RotatingText from './arcade/RotatingText';
import Stage from './arcade/Stage';
import { useIntro } from './arcade/intro';
import { HERO_TEXT_BOTTOM, ORDER, SPOT } from './arcade/layout';
import { arcade, useArcade } from './arcade/store';
import { useTheme } from './arcade/theme';
import { SoundToggle, ThemeToggle } from './arcade/ThemeToggle';
import { EXPERIENCE } from './data/experience';
import { PROJECTS } from './data/projects';
import { useGacha } from './gacha/store';
import HeldCard from './vending/HeldCard';
import { useVending, vendActions } from './vending/store';
import Reel from './resume/Reel';
import { loadReel, reel } from './resume/store';
import Sections, { openReel } from './Sections';

const VERBS = ['builds', 'trolls', 'creates content', 'ships', 'tinkers'];

export default function App() {
  const focus = useArcade((s) => s.focus);
  const gHeld = useGacha((s) => s.held);
  const vHeld = useVending((s) => s.held);
  const dark = useTheme((s) => s.mode === 'dark');
  const opened = useIntro((s) => s.phase === 'dropping' || s.phase === 'done');
  const landed = useIntro((s) => s.phase === 'done');
  const hero = focus === 'hero';

  // The page holds still through the opening and while a machine is being played.
  useEffect(() => { document.documentElement.classList.toggle('locked', !landed || !hero); }, [landed, hero]);

  // What the visitor is holding: a job card from the vending machine, a project from the gacha.
  const card = focus === 'vending' && vHeld !== null ? { ...EXPERIENCE[vHeld], anchor: `exp-${EXPERIENCE[vHeld].id}` }
    : focus === 'gacha' && gHeld !== null ? { ...PROJECTS[gHeld], anchor: PROJECTS[gHeld].listed === false ? null : `project-${PROJECTS[gHeld].id}` }
    : null;

  // Leave the machine, then down to that entry once the page can scroll again.
  const readMore = (id: string) => {
    arcade.set({ focus: 'hero', shot: 'main' });
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'center' }), 80);
  };

  return (
    <main className={`app ${hero ? 'overview' : 'playing'}`}>
      <div className="stage"><Stage /></div>
      <section className="hero">
        <div className="hero-fade">
        <NameSign />
        <HeroBadge />
        {/* The name itself is hidden from screen readers; this heading is its text for them and search. */}
        <div className={`hero-copy${opened ? ' in' : ''}`} style={{ top: `${(HERO_TEXT_BOTTOM * 100 + 2.5).toFixed(1)}vh` }}>
          <h1 className="sr-only">Jack Wei</h1>
          <p className="hero-line">
            <RotatingText texts={VERBS} mainClassName="hero-verb" highlight highlightColor={dark ? '#FF6FA8' : '#141414'} auto={opened} rotationInterval={2400} staggerFrom="last" staggerDuration={0.02} />
            <span>too much.</span>
          </p>
          <nav className="hero-links" aria-label="Links">
            <a href="https://github.com/We1chJ" target="_blank" rel="noreferrer">GitHub ↗</a>
            <a href="/assets/ResumeOfficial.pdf" onPointerEnter={() => loadReel()} onFocus={() => loadReel()} onClick={openReel}>Résumé</a>
          </nav>
        </div>
        <p className={`hero-cta${landed ? ' in' : ''}`}>Scroll, or click a machine to play it</p>
        </div>
      </section>
      <Sections />
      <div className={`corner${opened ? ' in' : ''}`}>
        <ThemeToggle />
        <SoundToggle />
      </div>
      {!hero && (
        <div className="play-ui">
          <header className="brand">jackwei.dev</header>
          <button type="button" className="resume-btn" onPointerEnter={() => loadReel()} onFocus={() => loadReel()} onClick={() => reel.set({ open: true })}>Résumé</button>
          <nav className="tabs" aria-label="Machines">
            <button type="button" onClick={() => arcade.set({ focus: 'hero', shot: 'main' })}>← Back</button>
            {ORDER.map((f) => (
              <button key={f} type="button" aria-pressed={focus === f} onClick={() => arcade.set({ focus: f })}>{SPOT[f].label}</button>
            ))}
          </nav>
          {card && (
            <aside className={`card-info rarity-${card.rarity.toLowerCase()}`} aria-live="polite">
              <span className="card-rarity">{card.rarity}</span>
              <h2>{card.title}</h2>
              <p>{card.blurb}</p>
              <ul>{card.tags.map((t) => <li key={t}>{t}</li>)}</ul>
              <div className="card-info-links">
                {card.anchor && <button type="button" onClick={() => readMore(card.anchor!)}>Read more</button>}
                {focus === 'vending' && <button type="button" onClick={() => vendActions.putBack()}>Put it back</button>}
                {card.url && <a href={card.url} target="_blank" rel="noreferrer">Open project ↗</a>}
              </div>
            </aside>
          )}
        </div>
      )}
      {focus === 'vending' && vHeld !== null && <HeldCard project={vHeld} />}
      <Reel />
      <div className="theme-ring" aria-hidden="true"><i /></div>
    </main>
  );
}
