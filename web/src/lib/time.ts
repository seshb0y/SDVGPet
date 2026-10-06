const pad = (n: number) => String(n).padStart(2, '0');

/** Сегодняшняя дата устройства + время "HH:MM" → ISO-строка для dueAt. */
export function dueAtToday(time: string, now: Date): string {
  const [hours, minutes] = time.split(':').map(Number);
  const at = new Date(now);
  at.setHours(hours ?? 0, minutes ?? 0, 0, 0);
  return at.toISOString();
}

/** ISO-строка → "HH:MM" по часам устройства. */
export function timeOf(iso: string): string {
  const at = new Date(iso);
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`;
}
