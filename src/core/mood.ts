import { isQuiet } from './time.js';
import { TUNING } from './tuning.js';
import { NEEDS, type Need, type Needs, type QuietHours } from './types.js';

export type PetState =
  | { kind: 'sleeping' }
  | { kind: 'asking'; need: Need }
  | { kind: 'happy' }
  | { kind: 'ok' };

export function lowestNeed(needs: Needs): Need {
  return NEEDS.reduce((lowest: Need, need: Need) => (needs[need] < needs[lowest] ? need : lowest));
}

export function petState(needs: Needs, minutes: number, quiet: QuietHours): PetState {
  if (isQuiet(minutes, quiet)) return { kind: 'sleeping' };
  const lowest = lowestNeed(needs);
  if (needs[lowest] < TUNING.askBelow) return { kind: 'asking', need: lowest };
  if (needs[lowest] >= TUNING.happyFrom) return { kind: 'happy' };
  return { kind: 'ok' };
}
