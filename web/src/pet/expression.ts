import type { PetState } from '../api/types';

export interface Expression {
  pose: 'awake' | 'sleep';
  extra: 'zzz' | 'sparkles' | null;
  motion: 'idle' | 'bounce' | 'tilt' | 'breathe' | 'jump';
}

export function expressionFor(mood: PetState, celebrating: boolean): Expression {
  if (celebrating) return { pose: 'awake', extra: 'sparkles', motion: 'jump' };
  switch (mood.kind) {
    case 'sleeping':
      return { pose: 'sleep', extra: 'zzz', motion: 'breathe' };
    case 'asking':
      return { pose: 'awake', extra: null, motion: 'tilt' };
    case 'happy':
      return { pose: 'awake', extra: null, motion: 'bounce' };
    case 'ok':
      return { pose: 'awake', extra: null, motion: 'idle' };
  }
}
