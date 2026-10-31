import NameSign from './arcade/NameSign';
import Stage from './arcade/Stage';
import { useIntro } from './arcade/intro';
import { HERO_TEXT_BOTTOM, ORDER, SPOT } from './arcade/layout';
import { arcade, useArcade } from './arcade/store';
import { useClaw, type ClawPhase } from './claw/store';
import { PROJECTS } from './data/projects';
import { gacha, useGacha, type Phase } from './gacha/store';
import { useVending, type VendPhase } from './vending/store';
import Reel from './resume/Reel';
import { loadReel, reel } from './resume/store';

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

// The Résumé links play the reel; a modified click (new tab, download) still gets the PDF itself.
function openReel(e: React.MouseEvent) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
  e.preventDefault();
  reel.set({ open: true });
}

export default function App() {
  const focus = useArcade((s) => s.focus);
  const gPhase = useGacha((s) => s.phase);
  const sound = useGacha((s) => s.sound);
  const vPhase = useVending((s) => s.phase);
  const held = useVending((s) => s.held);
  const cPhase = useClaw((s) => s.phase);
  const lastGrab = useClaw((s) => s.lastGrab);

  const hint = focus === 'gacha' ? GACHA_HINT[gPhase]
    : focus === 'vending' ? VEND_HINT[vPhase]
    : (cPhase === 'idle' && lastGrab && CLAW_RESULT[lastGrab]) || CLAW_HINT[cPhase];
  const card = focus === 'vending' && held !== null ? PROJECTS[held] : null;
  const opened = useIntro((s) => s.phase === 'dropping' || s.phase === 'done');

  if (focus === 'hero') {
    return (
      <main className="app">
        <div className="stage"><Stage /></div>
        <NameSign />
        {/* The name itself is drawn on a canvas; this heading is its text for screen readers and search. */}
        <section className={`hero-copy${opened ? ' in' : ''}`} style={{ top: `${(HERO_TEXT_BOTTOM * 100 + 2.5).toFixed(1)}vh` }}>
          <h1 className="sr-only">Jack Wei</h1>
          <p className="hero-line">builds too many things.</p>
          <nav className="hero-links" aria-label="Links">
            <a href="https://github.com/We1chJ" target="_blank" rel="noreferrer">GitHub ↗</a>
            <a href="/assets/ResumeOfficial.pdf" onPointerEnter={() => loadReel()} onFocus={() => loadReel()} onClick={openReel}>Résumé</a>
          </nav>
        </section>
        <button className={`sound-toggle${opened ? ' in' : ''}`} aria-pressed={sound} onClick={() => gacha.set({ sound: !sound })}>Sound {sound ? 'on' : 'off'}</button>
        <Reel />
      </main>
    );
  }

  return (
    <main className="app">
      <div className="stage"><Stage /></div>
      <header className="brand">jackwei.dev</header>
      <button type="button" className="resume-btn" onPointerEnter={() => loadReel()} onFocus={() => loadReel()} onClick={() => reel.set({ open: true })}>Résumé</button>
      <nav className="tabs" aria-label="Machines">
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
          {card.url && <a href={card.url} target="_blank" rel="noreferrer">Open project ↗</a>}
        </aside>
      )}
      <footer className="dock">
        <p className="hint" aria-live="polite">{hint}</p>
        <div className="controls">
          {focus === 'gacha' && <button onClick={() => gacha.actions.turn()} disabled={gPhase === 'settling'}>Turn the handle</button>}
          <button className="quiet" aria-pressed={sound} onClick={() => gacha.set({ sound: !sound })}>Sound {sound ? 'on' : 'off'}</button>
        </div>
      </footer>
      <Reel />
    </main>
  );
}
