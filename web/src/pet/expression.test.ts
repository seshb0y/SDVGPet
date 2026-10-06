import { describe, expect, it } from 'vitest';
import { expressionFor } from './expression';

describe('expressionFor', () => {
  it('спит — глаза закрыты, Zzz, дышит', () => {
    expect(expressionFor({ kind: 'sleeping' }, false)).toEqual({
      eyes: 'closed', mouth: 'smile', prop: null, extra: 'zzz', motion: 'breathe',
    });
  });

  it('просит — грустные глаза и предмет своей потребности', () => {
    expect(expressionFor({ kind: 'asking', need: 'walk' }, false)).toEqual({
      eyes: 'sad', mouth: 'sad', prop: 'walk', extra: null, motion: 'tilt',
    });
  });

  it('счастлив — язык наружу', () => {
    expect(expressionFor({ kind: 'happy' }, false)).toMatchObject({ eyes: 'open', mouth: 'tongue', motion: 'bounce' });
  });

  it('обычное — улыбка', () => {
    expect(expressionFor({ kind: 'ok' }, false)).toMatchObject({ eyes: 'open', mouth: 'smile', prop: null, motion: 'idle' });
  });

  it('праздник важнее любого состояния, даже сна', () => {
    for (const mood of [{ kind: 'sleeping' }, { kind: 'asking', need: 'food' }, { kind: 'ok' }] as const) {
      expect(expressionFor(mood, true)).toEqual({ eyes: 'joy', mouth: 'tongue', prop: null, extra: 'sparkles', motion: 'jump' });
    }
  });
});
