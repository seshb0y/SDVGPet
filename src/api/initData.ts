import { createHmac, timingSafeEqual } from 'node:crypto';

const DAY_SECONDS = 86_400;
const FUTURE_SKEW_SECONDS = 60;

function sameHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

function userIdOf(raw: string | null): number | null {
  if (!raw) return null;
  try {
    const id = (JSON.parse(raw) as { id?: unknown }).id;
    return typeof id === 'number' && Number.isInteger(id) ? id : null;
  } catch {
    return null;
  }
}

export function verifyInitData(
  initData: string,
  botToken: string,
  now: Date,
  maxAgeSeconds = DAY_SECONDS,
): { userId: number } | null {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const checkString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secretKey).update(checkString).digest('hex');
  if (!sameHex(expected, hash)) return null;

  const rawDate = params.get('auth_date');
  if (!rawDate || !/^\d+$/.test(rawDate)) return null;
  const age = now.getTime() / 1000 - Number(rawDate);
  if (age > maxAgeSeconds || age < -FUTURE_SKEW_SECONDS) return null;
  const userId = userIdOf(params.get('user'));
  return userId === null ? null : { userId };
}
