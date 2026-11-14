/**
 * "ריכוז חוסרים שבועי" — the WhatsApp-ready shortage summary. Pure functions (no database),
 * shared by the commander's copy button and the scheduled Telegram message.
 *
 * WhatsApp formatting: *text* is bold. Telegram shows the asterisks as-is, and they turn bold
 * again when the text is forwarded or pasted into WhatsApp.
 */

export type SummaryShiftType = 'MORNING' | 'EVENING' | 'NIGHT';

export interface ShortageItem {
  /** For the direct sign-up link (?shiftId=…) */
  shiftId: string;
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

/** "חסר 1" / "חסרים 2" (short form for lines with a link) */
export function missingShort(n: number): string {
  return n === 1 ? 'חסר 1' : `חסרים ${n}`;
}

/** Direct link that opens the sign-up for one shift: https://site/?shiftId=… */
export function shiftLink(appUrl: string, shiftId: string): string {
  return `${appUrl.replace(/\/+$/, '')}/?shiftId=${encodeURIComponent(shiftId)}`;
}

/** Open shifts only, sorted by day then start time. */
function openSorted(items: ShortageItem[]): ShortageItem[] {
  return items
    .filter((i) => i.missing > 0)
    .sort((a, b) => (a.date === b.date ? a.startMinute - b.startMinute : a.date < b.date ? -1 : 1));
}

/**
 * Volunteers' version ("העתק חוסרים למתנדבים", also the automatic Telegram message): every open
 * shift with how many are missing and its own direct sign-up link. `items` may be in any order;
 * full shifts (missing ≤ 0) are dropped. Without an app URL the lines have no links.
 */
export function formatShortageSummary(items: ShortageItem[], opts: { appUrl?: string | null } = {}): string {
  const open = openSorted(items);
  const title = '🚔 *ריכוז משמרות פנויות לשבוע הקרוב:*';
  const link = opts.appUrl ? `להרשמה מהירה לחצו כאן: ${opts.appUrl}` : null;
  const driver = (i: ShortageItem) => (i.needsDriver ? ', דרוש נהג 🚗' : '');

  if (open.length === 0) {
    return [title, '', '✅ כל המשמרות לשבוע הקרוב מאוישות. תודה לכולם! 🙏', ...(link ? ['', link] : [])].join('\n');
  }

  const lines = [title];
  let day = '';
  for (const i of open) {
    if (i.date !== day) {
      day = i.date;
      lines.push('', `📅 *${summaryDayLabel(i.date)}:*`);
    }
    lines.push(
      opts.appUrl
        ? `• משמרת ${SHIFT_NAME[i.shiftType]} (${missingShort(i.missing)}${driver(i)}): להרשמה -> ${shiftLink(opts.appUrl, i.shiftId)}`
        : `• משמרת ${SHIFT_NAME[i.shiftType]}: ${missingLabel(i.missing)}${i.needsDriver ? ' (דרוש נהג 🚗)' : ''}`,
    );
  }
  return lines.join('\n');
}

/**
 * Commander's version ("העתק סיכום חוסרים למפקד"): one line per day with the total number of
 * volunteers missing across that day's shifts. No links. Days with nothing missing are left out;
 * extra patrol cars never count (they are not in `missing`).
 */
export function formatCommanderSummary(items: ShortageItem[]): string {
  const perDay = new Map<string, number>();
  for (const i of openSorted(items)) perDay.set(i.date, (perDay.get(i.date) ?? 0) + i.missing);
  const title = '📊 *סטטוס חוסרים שבועי (למפקד):*';
  if (perDay.size === 0) return [title, '', '✅ אין חוסרים בשבוע הקרוב – כל המשמרות מאוישות.'].join('\n');
  const lines = [title, ''];
  let total = 0;
  for (const [date, missing] of perDay) {
    total += missing;
    lines.push(`• ${summaryDayLabel(date)} - ${missingLabel(missing)}`);
  }
  lines.push('', `סה״כ השבוע: ${missingLabel(total)} ב-${perDay.size === 1 ? 'יום אחד' : `${perDay.size} ימים`}`);
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
