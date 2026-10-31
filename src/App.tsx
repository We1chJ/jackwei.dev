import { useEffect, useRef } from 'react';
import HeroBadge from './arcade/HeroBadge';
import NameSign from './arcade/NameSign';
import RotatingText from './arcade/RotatingText';
import Stage from './arcade/Stage';
import { useIntro } from './arcade/intro';
import { HERO_TEXT_BOTTOM, ORDER, SPOT } from './arcade/layout';
import { arcade, useArcade } from './arcade/store';
import { useClaw, type ClawPhase } from './claw/store';
import { EXPERIENCE } from './data/experience';
import { PROJECTS } from './data/projects';
import { gacha, useGacha, type Phase } from './gacha/store';
import { useVending, type VendPhase } from './vending/store';
import Reel from './resume/Reel';
import { loadReel, reel } from './resume/store';
import Sections, { openReel } from './Sections';

const VERBS = ['builds', 'trolls', 'creates content', 'ships', 'tinkers'];

const GACHA_HINT: Record<Phase, string> = {
  settling: 'Filling the machine…',
  idle: 'Drag the handle clockwise one full turn',
  turning: 'Keep turning…',
  dispensing: 'Here it comes',
  ready: 'Push the flap in to take your capsule',
  taking: 'Got it',
  held: 'Click the capsule to put it back',
};
const VEND_HINT: Record<VendPhase, string> = {
  idle: 'Punch a code on the keypad: a letter, then a number (try B2)',
  vending: 'Here it comes…',
  ready: 'Push the flap in to take your card',
  taking: 'Got it',
  held: 'Click the card to put it back',
};
const CLAW_HINT: Record<ClawPhase, string> = {
  idle: 'Grab the red joystick and steer, then press DROP',
  dropping: 'Going down…',
  grabbing: 'Grab!',
  lifting: 'Hold on…',
  returning: 'Hold on…',
  releasing: 'Letting go…',
  prize: 'You won! Push the prize door in to take it',
  taking: 'Got it',
  held: 'Click the plushie to put it back',
};
const CLAW_RESULT = { slipped: 'So close! It slipped.', missed: 'Missed! Try again.', won: '' };

export default function App() {
  const focus = useArcade((s) => s.focus);
  const gPhase = useGacha((s) => s.phase);
  const gHeld = useGacha((s) => s.held);
  const sound = useGacha((s) => s.sound);
  const vPhase = useVending((s) => s.phase);
  const vHeld = useVending((s) => s.held);
  const cPhase = useClaw((s) => s.phase);
  const lastGrab = useClaw((s) => s.lastGrab);
  const opened = useIntro((s) => s.phase === 'dropping' || s.phase === 'done');
  const landed = useIntro((s) => s.phase === 'done');
  const hero = focus === 'hero';

  // The page scrolls past the arcade; it stops drawing while it is out of view.
  const heroRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => arcade.set({ onScreen: e.isIntersecting }));
    io.observe(heroRef.current!);
    return () => io.disconnect();
  }, []);

  const hint = focus === 'gacha' ? GACHA_HINT[gPhase]
    : focus === 'vending' ? VEND_HINT[vPhase]
    : (cPhase === 'idle' && lastGrab && CLAW_RESULT[lastGrab]) || CLAW_HINT[cPhase];
  // What the visitor is holding: a job card from the vending machine, a project from the gacha.
  const card = focus === 'vending' && vHeld !== null ? { ...EXPERIENCE[vHeld], anchor: `#exp-${EXPERIENCE[vHeld].id}` }
    : focus === 'gacha' && gHeld !== null ? { ...PROJECTS[gHeld], anchor: `#project-${PROJECTS[gHeld].id}` }
    : null;

  return (
    <main className="app">
      <section ref={heroRef} className={`hero ${hero ? 'overview' : 'playing'}`}>
        <div className="stage"><Stage /></div>
        {hero ? (
          <>
            <NameSign />
            <HeroBadge />
            {/* The name itself is hidden from screen readers; this heading is its text for them and search. */}
            <div className={`hero-copy${opened ? ' in' : ''}`} style={{ top: `${(HERO_TEXT_BOTTOM * 100 + 2.5).toFixed(1)}vh` }}>
              <h1 className="sr-only">Jack Wei</h1>
              <p className="hero-line">
                <RotatingText texts={VERBS} mainClassName="hero-verb" highlight highlightColor="#141414" auto={opened} rotationInterval={2400} staggerFrom="last" staggerDuration={0.02} />
                <span>too much.</span>
              </p>
              <nav className="hero-links" aria-label="Links">
                <a href="https://github.com/We1chJ" target="_blank" rel="noreferrer">GitHub ↗</a>
                <a href="/assets/ResumeOfficial.pdf" onPointerEnter={() => loadReel()} onFocus={() => loadReel()} onClick={openReel}>Résumé</a>
                <a href="#experience">The boring version ↓</a>
              </nav>
            </div>
            <button className={`sound-toggle${opened ? ' in' : ''}`} aria-pressed={sound} onClick={() => gacha.set({ sound: !sound })}>Sound {sound ? 'on' : 'off'}</button>
            <p className={`hero-cta${landed ? ' in' : ''}`}>Click a machine to play it</p>
          </>
        ) : (
          <>
            <header className="brand">jackwei.dev</header>
            <button type="button" className="resume-btn" onPointerEnter={() => loadReel()} onFocus={() => loadReel()} onClick={() => reel.set({ open: true })}>Résumé</button>
            <nav className="tabs" aria-label="Machines">
              <button type="button" onClick={() => arcade.set({ focus: 'hero', shot: 'main' })}>← Arcade</button>
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
                  <a href={card.anchor}>Read more ↓</a>
                  {card.url && <a href={card.url} target="_blank" rel="noreferrer">Open project ↗</a>}
                </div>
              </aside>
            )}
            <footer className="dock">
              <p className="hint" aria-live="polite">{hint}</p>
              <div className="controls">
                {focus === 'gacha' && <button onClick={() => gacha.actions.turn()} disabled={gPhase === 'settling'}>Turn the handle</button>}
                <button className="quiet" aria-pressed={sound} onClick={() => gacha.set({ sound: !sound })}>Sound {sound ? 'on' : 'off'}</button>
              </div>
            </footer>
          </>
        )}
      </section>
      <Sections />
      <Reel />
    </main>
  );
}
