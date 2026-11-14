/**
 * "ריכוז חוסרים שבועי" — the WhatsApp-ready shortage summary. Pure functions (no database),
 * shared by the commander's copy button and the scheduled Telegram message.
 *
 * WhatsApp formatting: *text* is bold. Telegram shows the asterisks as-is, and they turn bold
 * again when the text is forwarded or pasted into WhatsApp.
 */

export type SummaryShiftType = 'MORNING' | 'EVENING' | 'NIGHT';

export interface ShortageItem {
  /** YYYY-MM-DD */
  date: string;
  shiftType: SummaryShiftType;
  /** Start minute of the shift, for ordering within a day */
  startMinute: number;
  /** Regular slots still open (extra patrol cars are never counted) */
  missing: number;
  /** The shift still needs a volunteer with a driving chip */
  needsDriver: boolean;
}

const SHIFT_NAME: Record<SummaryShiftType, string> = { MORNING: 'בוקר', EVENING: 'צהריים', NIGHT: 'לילה' };

/** "יום ראשון (15/11)" */
export function summaryDayLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const weekday = d.toLocaleDateString('he-IL', { weekday: 'long', timeZone: 'UTC' });
  return `${weekday} (${d.getUTCDate()}/${d.getUTCMonth() + 1})`;
}

/** "חסר מתנדב 1" / "חסרים 2 מתנדבים" */
export function missingLabel(n: number): string {
  return n === 1 ? 'חסר מתנדב 1' : `חסרים ${n} מתנדבים`;
}

/** The full summary text. `items` may be in any order; full shifts (missing ≤ 0) are dropped. */
export function formatShortageSummary(items: ShortageItem[], opts: { appUrl?: string | null } = {}): string {
  const open = items
    .filter((i) => i.missing > 0)
    .sort((a, b) => (a.date === b.date ? a.startMinute - b.startMinute : a.date < b.date ? -1 : 1));

  const link = opts.appUrl ? `להרשמה מהירה לחצו כאן: ${opts.appUrl}` : null;

  if (open.length === 0) {
    return ['🚔 *ריכוז חוסרים במשמרות לשבוע הקרוב:*', '', '✅ כל המשמרות לשבוע הקרוב מאוישות. תודה לכולם! 🙏', ...(link ? ['', link] : [])].join('\n');
  }

  const lines = ['🚔 *ריכוז חוסרים במשמרות לשבוע הקרוב:*'];
  let day = '';
  for (const i of open) {
    if (i.date !== day) {
      day = i.date;
      lines.push('', `📅 *${summaryDayLabel(i.date)}:*`);
    }
    lines.push(`• משמרת ${SHIFT_NAME[i.shiftType]}: ${missingLabel(i.missing)}${i.needsDriver ? ' (דרוש נהג 🚗)' : ''}`);
  }
  if (link) lines.push('', link);
  return lines.join('\n');
}

// ── schedule ────────────────────────────────────────────────────────────────

/** Whole days from date a to date b (YYYY-MM-DD). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/**
 * Is the scheduled summary due now?
 *  - not before `hour` (station time) and not after 21:00, so a sleeping server that wakes late
 *    in the day still sends it, but never at night;
 *  - at least `everyDays` days after the last day it was sent.
 */
export function isDigestDue(
  lastRunDate: string | null,
  now: { date: string; minute: number },
  opts: { hour: number; everyDays: number },
): boolean {
  if (now.minute < opts.hour * 60 || now.minute >= 21 * 60) return false;
  return lastRunDate === null || daysBetween(lastRunDate, now.date) >= opts.everyDays;
}
