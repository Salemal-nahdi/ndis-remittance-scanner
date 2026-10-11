const DAY_MS = 86_400_000;

/** Business time zone used to decide what "today" is. */
export const BUSINESS_TZ = process.env.BUSINESS_TZ ?? "Australia/Sydney";

/** Today's date (YYYY-MM-DD) in the business time zone. */
export function todayISO(now: Date = new Date(), timeZone = BUSINESS_TZ): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
}

/**
 * Xero returns dates either as "/Date(1756684800000+0000)/" or as
 * "2026-09-01T00:00:00". Returns YYYY-MM-DD, or null if unparseable.
 */
export function parseXeroDate(value: string | Date | undefined | null): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const ms = /\/Date\((-?\d+)/.exec(value);
  if (ms) return new Date(Number(ms[1])).toISOString().slice(0, 10);
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return iso ? iso[1] : null;
}

/** Whole days from `from` to `to` (both YYYY-MM-DD). Positive when `to` is later. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}
