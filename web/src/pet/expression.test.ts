import { describe, expect, it } from 'vitest';
import { expressionFor } from './expression';

describe('expressionFor', () => {
  it('спит — кадр сна, Zzz, дышит', () => {
    expect(expressionFor({ kind: 'sleeping' }, false)).toEqual({
      pose: 'sleep', extra: 'zzz', motion: 'breathe',
    });
  });

  it('просит — без предметов, о чём просит, говорит фраза под ним', () => {
    expect(expressionFor({ kind: 'asking', need: 'walk' }, false)).toEqual({
      pose: 'awake', extra: null, motion: 'tilt',
    });
  });

  it('счастлив — подпрыгивает', () => {
    expect(expressionFor({ kind: 'happy' }, false)).toEqual({ pose: 'awake', extra: null, motion: 'bounce' });
  });

  it('обычное — спокойно дышит', () => {
    expect(expressionFor({ kind: 'ok' }, false)).toEqual({ pose: 'awake', extra: null, motion: 'idle' });
  });

  it('праздник важнее любого состояния, даже сна', () => {
    for (const mood of [{ kind: 'sleeping' }, { kind: 'asking', need: 'food' }, { kind: 'ok' }] as const) {
      expect(expressionFor(mood, true)).toEqual({ pose: 'awake', extra: 'sparkles', motion: 'jump' });
    }
  });
});
