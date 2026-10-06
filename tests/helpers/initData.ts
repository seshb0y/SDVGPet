import { createHmac } from 'node:crypto';

export function signInitData(fields: Record<string, string>, botToken: string): string {
  const checkString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secretKey).update(checkString).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

export function initDataFor(userId: number, botToken: string, authDate: Date): string {
  return signInitData(
    {
      auth_date: String(Math.floor(authDate.getTime() / 1000)),
      query_id: 'AAH',
      signature: 'ed25519-signature-stays-in-check-string',
      user: JSON.stringify({ id: userId, first_name: 'Тест' }),
    },
    botToken,
  );
}
