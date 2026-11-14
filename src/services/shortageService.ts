import { prisma } from '../lib/prisma.ts';
import { fromIsoDate, nowInStation, toIsoDate } from '../lib/dates.ts';
import { absoluteMinute, addDays, computeStaffing } from '../domain/registrationRules.ts';
import { formatCommanderSummary, formatShortageSummary, type ShortageItem, type SummaryShiftType } from '../domain/shortageSummary.ts';
import { countSeats, windowOf } from './shiftState.ts';

/**
 * Link volunteers tap in the summary (the volunteer sign-in page).
 * APP_URL if set; otherwise Render's own address (RENDER_EXTERNAL_URL, set automatically);
 * otherwise the address the commander's browser used.
 */
export function appUrl(fromRequest?: string | null): string | null {
  const raw = process.env.APP_URL?.trim() || process.env.RENDER_EXTERNAL_URL?.trim() || fromRequest || null;
  return raw ? raw.replace(/\/+$/, '') + '/' : null;
}

/**
 * Published shifts in the next 7 days (today + 6) that haven't started yet and still have
 * open REGULAR slots. Extra patrol cars never count (countSeats excludes them).
 */
export async function loadShortages(now = new Date()): Promise<ShortageItem[]> {
  const station = nowInStation(now);
  const nowAbs = absoluteMinute(station.date, station.minute);
  const shifts = await prisma.shift.findMany({
    where: {
      publishedAt: { not: null },
      status: { in: ['OPEN', 'FILLED'] },
      date: { gte: fromIsoDate(station.date), lte: fromIsoDate(addDays(station.date, 6)) },
    },
    include: {
      registrations: {
        where: { status: 'APPROVED' },
        select: { status: true, opensNewCar: true, user: { select: { hasDrivingChip: true } } },
      },
    },
  });
  const items: ShortageItem[] = [];
  for (const s of shifts) {
    const date = toIsoDate(s.date);
    const window = windowOf(s);
    if (absoluteMinute(date, window.start) <= nowAbs) continue; // already started
    const staffing = computeStaffing(s, countSeats(s.registrations));
    if (staffing.seatsLeft <= 0) continue; // full
    items.push({
      shiftId: s.id,
      date,
      shiftType: s.shiftType as SummaryShiftType,
      startMinute: window.start,
      missing: staffing.seatsLeft,
      needsDriver: staffing.driversMissing > 0,
    });
  }
  return items;
}

export type SummaryFormat = 'volunteers' | 'commander';

/**
 * volunteers: per shift with direct sign-up links (also the automatic Telegram message);
 * commander: one line per day with the day's total missing, no links.
 */
export async function buildShortageSummary(opts: { requestUrl?: string | null; now?: Date; format?: SummaryFormat } = {}) {
  const items = await loadShortages(opts.now);
  const open = items.filter((i) => i.missing > 0);
  return {
    format: opts.format ?? 'volunteers',
    text: opts.format === 'commander' ? formatCommanderSummary(items) : formatShortageSummary(items, { appUrl: appUrl(opts.requestUrl) }),
    daysWithShortage: new Set(open.map((i) => i.date)).size,
    shiftsWithShortage: open.length,
    missingTotal: open.reduce((n, i) => n + i.missing, 0),
  };
}
