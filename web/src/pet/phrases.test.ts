import { describe, expect, it } from 'vitest';
import { SPEECH, speechFor } from './phrases';

describe('speechFor', () => {
  it('просьба берётся из пула своей потребности', () => {
    for (let seed = 0; seed < 10; seed++) {
      expect(SPEECH.asking.love).toContain(speechFor({ kind: 'asking', need: 'love' }, false, seed));
    }
  });

  it('праздник — из пула праздника, даже ночью', () => {
    expect(SPEECH.celebrating).toContain(speechFor({ kind: 'sleeping' }, true, 4));
  });

  it('одинаковый seed — одинаковая фраза, разные seed перебирают весь пул', () => {
    const mood = { kind: 'happy' } as const;
    expect(speechFor(mood, false, 2)).toBe(speechFor(mood, false, 2));
    const seen = new Set(SPEECH.happy.map((_, seed) => speechFor(mood, false, seed)));
    expect(seen.size).toBe(SPEECH.happy.length);
  });

  it('в каждом пуле минимум 3 фразы, без упрёков', () => {
    const pools = [SPEECH.sleeping, SPEECH.celebrating, SPEECH.happy, SPEECH.ok, ...Object.values(SPEECH.asking)];
    for (const pool of pools) {
      expect(pool.length).toBeGreaterThanOrEqual(3);
      for (const phrase of pool) expect(phrase).not.toMatch(/опять|снова не|забыла|ленив/i);
    }
  });
});
