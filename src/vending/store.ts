import { createStore } from '../arcade/store';

export type VendPhase = 'idle' | 'vending' | 'ready' | 'taking' | 'held';
// `held` is the index into EXPERIENCE of the card in the visitor's hand.
export const [vending, useVending] = createStore({ phase: 'idle' as VendPhase, held: null as number | null });
