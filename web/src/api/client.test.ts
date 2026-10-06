import { describe, expect, it } from 'vitest';
import { ApiError, httpApi } from './client';

function fakeFetch(status: number, body: unknown, binary = false) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return binary
      ? new Response(new Blob(['IMG'], { type: 'image/jpeg' }), { status })
      : Response.json(body, { status });
  };
  return { calls, fetchImpl };
}

describe('httpApi', () => {
  it('шлёт POST /api/app с tma-заголовком и op в теле, разворачивает data', async () => {
    const { calls, fetchImpl } = fakeFetch(200, { ok: true, data: { completed: true, needs: {} } });
    const api = httpApi('query_id=1&hash=abc', fetchImpl);
    const result = await api.completeTask(7);
    expect(result.completed).toBe(true);
    expect(calls[0]?.url).toBe('/api/app');
    expect(calls[0]?.init.method).toBe('POST');
    expect(new Headers(calls[0]?.init.headers).get('authorization')).toBe('tma query_id=1&hash=abc');
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ op: 'tasks.complete', id: 7 });
  });

  it('патч рутины уходит плоско вместе с id', async () => {
    const { calls, fetchImpl } = fakeFetch(200, { ok: true, data: {} });
    await httpApi('x', fetchImpl).updateRoutine(3, { active: false });
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ op: 'routines.update', id: 3, active: false });
  });

  it('ошибка сервера превращается в ApiError со статусом и кодом', async () => {
    const { fetchImpl } = fakeFetch(401, { ok: false, error: 'unauthorized' });
    const error = await httpApi('x', fetchImpl).state().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, code: 'unauthorized' });
  });

  it('ответ без JSON тоже даёт ApiError', async () => {
    const fetchImpl = async () => new Response('Bad Gateway', { status: 502 });
    await expect(httpApi('x', fetchImpl).state()).rejects.toMatchObject({ status: 502, code: 'network' });
  });

  it('фото приходит как Blob', async () => {
    const { calls, fetchImpl } = fakeFetch(200, null, true);
    const blob = await httpApi('x', fetchImpl).photo(5);
    expect(blob.type).toBe('image/jpeg');
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ op: 'photo', id: 5 });
  });
});
