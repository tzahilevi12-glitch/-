/** Station timezone — "today" and "now" use local wall-clock time. */
export const STATION_TZ = process.env.STATION_TZ ?? 'Asia/Jerusalem';

/** First day of the publishing week: 0 = Sunday (Israeli work week). */
export const WEEK_START_DAY = Number(process.env.WEEK_START_DAY ?? 0);

export function nowInStation(now = new Date()): { date: string; minute: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: STATION_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minute: Number(parts.hour) * 60 + Number(parts.minute) };
}

export function todayInStation(now = new Date()): string {
  return nowInStation(now).date;
}

/** Prisma returns @db.Date columns as a Date at UTC midnight. */
export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function fromIsoDate(s: string): Date {
  return new Date(`${s}T00:00:00Z`);
}

export function isIsoDate(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

/** Prisma returns @db.Time columns as a Date on 1970-01-01 (UTC). */
export function timeToHHMM(d: Date): string {
  return d.toISOString().slice(11, 16);
}

export function hhmmToTime(hhmm: string): Date {
  return new Date(`1970-01-01T${hhmm}:00Z`);
}
