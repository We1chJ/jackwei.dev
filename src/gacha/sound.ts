// Synthesised mechanical sounds (WebAudio, no files). Muted until the visitor turns sound on.
import { gacha } from './store';

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function audio(): AudioContext | null {
  if (!gacha.get().sound) return null;
  if (!ctx) {
    ctx = new AudioContext();
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function burst(freq: number, q: number, dur: number, gain: number, when = 0) {
  const a = audio(); if (!a || !noise) return;
  const t = a.currentTime + when;
  const src = a.createBufferSource(); src.buffer = noise;
  const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = a.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(a.destination);
  src.start(t, Math.random() * 0.4); src.stop(t + dur + 0.02);
}

function thump(from: number, to: number, dur: number, gain: number, when = 0) {
  const a = audio(); if (!a) return;
  const t = a.currentTime + when;
  const o = a.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = a.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}

/** Ratchet pawl dropping into the next tooth. */
export const ratchet = () => { burst(3200, 6, 0.03, 0.22); burst(1400, 4, 0.02, 0.08, 0.004); };
/** The dispensing wheel releasing a capsule at the end of a full turn. */
export const clunk = () => { thump(160, 55, 0.16, 0.5); burst(700, 2, 0.08, 0.2); };
/** Plastic capsule hitting plastic. */
let lastClack = 0;
export function clack(strength: number) {
  const now = performance.now(); if (now - lastClack < 45) return; lastClack = now;
  const s = Math.min(1, strength);
  burst(1800 + Math.random() * 900, 5, 0.035, 0.05 + 0.25 * s);
}
/** Flap swinging. */
export const flapSound = () => { burst(900, 3, 0.06, 0.12); thump(220, 120, 0.08, 0.12, 0.01); };
