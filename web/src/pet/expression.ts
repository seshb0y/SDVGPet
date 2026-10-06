import type { Need, PetState } from '../api/types';

export interface Expression {
  eyes: 'open' | 'sad' | 'closed' | 'joy';
  mouth: 'smile' | 'sad' | 'tongue';
  prop: Need | null;
  extra: 'zzz' | 'sparkles' | null;
  motion: 'idle' | 'bounce' | 'tilt' | 'breathe' | 'jump';
}

export function expressionFor(mood: PetState, celebrating: boolean): Expression {
  if (celebrating) return { eyes: 'joy', mouth: 'tongue', prop: null, extra: 'sparkles', motion: 'jump' };
  switch (mood.kind) {
    case 'sleeping':
      return { eyes: 'closed', mouth: 'smile', prop: null, extra: 'zzz', motion: 'breathe' };
    case 'asking':
      return { eyes: 'sad', mouth: 'sad', prop: mood.need, extra: null, motion: 'tilt' };
    case 'happy':
      return { eyes: 'open', mouth: 'tongue', prop: null, extra: null, motion: 'bounce' };
    case 'ok':
      return { eyes: 'open', mouth: 'smile', prop: null, extra: null, motion: 'idle' };
  }
}
