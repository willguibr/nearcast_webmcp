export function isoFromEpochMs(ms: unknown): string | undefined {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return undefined;
  return new Date(ms).toISOString();
}

export function isoFromString(s: unknown): string | undefined {
  if (typeof s !== "string" || !s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export function isPast(iso: string | undefined, now: Date): boolean {
  if (!iso) return false;
  return new Date(iso).getTime() < now.getTime();
}

export function daysAgoDate(now: Date, days: number): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
}
