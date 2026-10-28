import Stage from './gacha/Stage';
import { gacha, useGacha, type Phase } from './gacha/store';

const HINT: Record<Phase, string> = {
  settling: 'Filling the machine…',
  idle: 'Drag the handle clockwise one full turn',
  turning: 'Keep turning…',
  dispensing: 'Here it comes',
  ready: 'Lift the flap to take your capsule',
  taking: 'Got it',
  held: 'Click the capsule to put it back',
};

export default function App() {
  const phase = useGacha((s) => s.phase);
  const sound = useGacha((s) => s.sound);
  return (
    <main className="app">
      <div className="stage"><Stage /></div>
      <header className="brand">jackwei.dev</header>
      <footer className="dock">
        <p className="hint" aria-live="polite">{HINT[phase]}</p>
        <div className="controls">
          <button onClick={() => gacha.actions.turn()} disabled={phase === 'settling'}>Turn the handle</button>
          <button className="quiet" aria-pressed={sound} onClick={() => gacha.set({ sound: !sound })}>Sound {sound ? 'on' : 'off'}</button>
        </div>
      </footer>
    </main>
  );
}
