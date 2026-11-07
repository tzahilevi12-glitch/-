import type { Certification, ShiftType } from './types.ts';

// Hebrew display names. The internal code stays EVENING (renaming it in the database would risk existing data).
export const SHIFT_LABEL: Record<ShiftType, string> = { MORNING: 'בוקר', EVENING: 'צהריים', NIGHT: 'לילה' };
export const SHIFT_TYPES: ShiftType[] = ['MORNING', 'EVENING', 'NIGHT'];

export const CERT_LABEL: Record<Certification, string> = {
  NONE: 'מתנדב אק״מ',
  LEVEL_A: "מוסמך שלב א'",
  LEVEL_B: "מוסמך שלב ב'",
  LEVEL_C: "מוסמך שלב ג'",
};
export const CERT_SHORT: Record<Certification, string> = { NONE: '', LEVEL_A: "שלב א'", LEVEL_B: "שלב ב'", LEVEL_C: "שלב ג'" };
export const CERTIFICATIONS: Certification[] = ['NONE', 'LEVEL_A', 'LEVEL_B', 'LEVEL_C'];
/** Level B / C may open an additional patrol car (join full shifts). Level A follows the normal rules. */
export const isCertified = (c: Certification | undefined) => c === 'LEVEL_B' || c === 'LEVEL_C';
export const WEEKDAYS = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"];

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** Wrap left-to-right content (times, dates, ranges) so it reads correctly inside Hebrew text. */
export const ltr = (s: string) => `⁦${s}⁩`;
/** "14:30–22:00", isolated for RTL text. */
export const range = (a: string, b: string) => ltr(`${a}–${b}`);

/** "6.11" */
export function numericDay(iso: string): string {
  const x = d(iso);
  return ltr(`${x.getUTCDate()}.${x.getUTCMonth() + 1}`);
}

/** "יום שישי, 6.11" */
export function dayLabel(iso: string): string {
  const weekday = d(iso).toLocaleDateString('he-IL', { weekday: 'long', timeZone: 'UTC' });
  return `${weekday}, ${numericDay(iso)}`;
}

/** { weekday: "יום ו׳", day: "6.11" } */
export function shortDay(iso: string): { weekday: string; day: string } {
  return { weekday: d(iso).toLocaleDateString('he-IL', { weekday: 'short', timeZone: 'UTC' }), day: numericDay(iso) };
}

/** "8–14 בנובמבר", or "29.11–5.12" across months */
export function weekRangeLabel(start: string, end: string): string {
  const a = d(start);
  const b = d(end);
  if (a.getUTCMonth() === b.getUTCMonth()) {
    const month = b.toLocaleDateString('he-IL', { month: 'long', timeZone: 'UTC' });
    return `${range(String(a.getUTCDate()), String(b.getUTCDate()))} ב${month}`;
  }
  return range(`${a.getUTCDate()}.${a.getUTCMonth() + 1}`, `${b.getUTCDate()}.${b.getUTCMonth() + 1}`);
}

export function addDays(iso: string, n: number): string {
  const x = d(iso);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

/** Station-local date and minute of day. */
export function nowLocal(): { date: string; minute: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jerusalem',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minute: Number(parts.hour) * 60 + Number(parts.minute) };
}

export function todayLocal(): string {
  return nowLocal().date;
}

/** Minutes from now until a shift-relative time (minutes may exceed 1440 for night shifts). */
export function minutesUntil(date: string, minuteOfShiftDay: number): number {
  const now = nowLocal();
  const days = (d(date).getTime() - d(now.date).getTime()) / 86_400_000;
  return days * 1440 + minuteOfShiftDay - now.minute;
}

// ── minutes within a shift (end may pass midnight) ──

export const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
export const fromMin = (m: number) => {
  const x = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
};

export function windowOf(start: string, end: string): { start: number; end: number } {
  const s = toMin(start);
  const e = toMin(end);
  return { start: s, end: e <= s ? e + 1440 : e };
}

/** Position of a clock time inside a shift window (after-midnight times wrap). */
export function inWindow(hhmm: string, w: { start: number }): number {
  const m = toMin(hhmm);
  return m < w.start ? m + 1440 : m;
}

/** Selectable times in a shift window, every `step` minutes, including both ends. */
export function timeOptions(start: string, end: string, step = 30): string[] {
  const w = windowOf(start, end);
  const out: string[] = [];
  const first = Math.ceil(w.start / step) * step;
  if (first !== w.start) out.push(fromMin(w.start));
  for (let m = first; m < w.end; m += step) out.push(fromMin(m));
  out.push(fromMin(w.end));
  return out;
}

/** "4 שעות", "שעה וחצי", "3 שעות ו-15 דקות" */
export function durationLabel(start: string, end: string): string {
  const w = windowOf(start, end);
  const mins = w.end - w.start;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const hours = h === 0 ? '' : h === 1 ? 'שעה' : h === 2 ? 'שעתיים' : `${h} שעות`;
  if (!m) return hours;
  if (m === 30) return hours ? `${hours} וחצי` : 'חצי שעה';
  return hours ? `${hours} ו-${m} דקות` : `${m} דקות`;
}

/** "לפני 5 דקות", "היום ב-14:05", "6.11 ב-09:30" */
export function whenLabel(isoTimestamp: string): string {
  const t = new Date(isoTimestamp);
  const mins = Math.round((Date.now() - t.getTime()) / 60000);
  if (mins < 1) return 'עכשיו';
  if (mins < 60) return mins === 1 ? 'לפני דקה' : `לפני ${mins} דקות`;
  const time = ltr(t.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jerusalem' }));
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(t);
  return date === todayLocal() ? `היום ב-${time}` : `${numericDay(date)} ב-${time}`;
}
