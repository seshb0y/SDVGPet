import { describe, expect, it, vi } from 'vitest';
import { handleTick } from '../../src/api/tick.js';

const SECRET = 'tick_secret_1234567890';

describe('handleTick', () => {
  it('без секрета — 401 и tick не запускается', async () => {
    const run = vi.fn(async () => ({ sent: 0, failed: 0 }));
    const res = await handleTick(new Request('https://x/api/tick', { method: 'POST' }), { secret: SECRET, run });
    expect(res.status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it('с неверным секретом — 401', async () => {
    const run = vi.fn(async () => ({ sent: 0, failed: 0 }));
    const req = new Request('https://x/api/tick', { method: 'POST', headers: { 'x-tick-secret': 'wrong' } });
    expect((await handleTick(req, { secret: SECRET, run })).status).toBe(401);
  });

  it('с верным секретом — 200 и отчёт', async () => {
    const run = vi.fn(async () => ({ sent: 2, failed: 0 }));
    const req = new Request('https://x/api/tick', { method: 'POST', headers: { 'x-tick-secret': SECRET } });
    const res = await handleTick(req, { secret: SECRET, run });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: 2, failed: 0 });
  });

  it('с пустым секретом в deps — 401 и tick не запускается', async () => {
    const run = vi.fn(async () => ({ sent: 0, failed: 0 }));
    const res = await handleTick(new Request('https://x/api/tick', { method: 'POST' }), { secret: '', run });
    expect(res.status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });
});
