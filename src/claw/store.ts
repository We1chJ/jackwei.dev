import { createStore } from '../arcade/store';

export type ClawPhase = 'idle' | 'dropping' | 'grabbing' | 'lifting' | 'returning' | 'releasing' | 'prize' | 'taking' | 'held';
export const [claw, useClaw] = createStore({ phase: 'idle' as ClawPhase, lastGrab: null as null | 'won' | 'slipped' | 'missed' });

// Live joystick deflection (-1..1; y = +1 pushes the claw away from you), set by dragging the
// cabinet's joystick. A plain object, not React state: it changes every pointer move.
export const pad = { x: 0, y: 0 };
