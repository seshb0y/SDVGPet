import { timingSafeEqual } from 'node:crypto';
import type { TickReport } from '../services/tick.js';

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function handleTick(
  req: Request,
  deps: { secret: string; run: () => Promise<TickReport> },
): Promise<Response> {
  if (!sameSecret(req.headers.get('x-tick-secret') ?? '', deps.secret)) {
    return new Response('Unauthorized', { status: 401 });
  }
  return Response.json(await deps.run());
}
