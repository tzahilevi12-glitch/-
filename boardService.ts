import { prisma } from '../lib/prisma.ts';
import { fromIsoDate, nowInStation, toIsoDate } from '../lib/dates.ts';
import { absoluteMinute, addDays, computeStaffing, formatInterval, isShortShift } from '../domain/registrationRules.ts';
import { countSeats, registrationInterval, shiftHeader, staffingView, windowOf } from './shiftState.ts';

/**
 * Published shifts that haven't ended yet, with staffing and who is on each shift.
 * Shared by the volunteer shift board and the read-only guest view.
 *   includeFull: also return FILLED shifts (Level B/C volunteers, and guests who just look).
 */
export async function loadBoard(includeFull: boolean) {
  const now = nowInStation();
  const nowAbs = absoluteMinute(now.date, now.minute);
  const shifts = await prisma.shift.findMany({
    where: {
      publishedAt: { not: null },
      status: includeFull ? { in: ['OPEN', 'FILLED'] } : 'OPEN',
      date: { gte: fromIsoDate(addDays(now.date, -1)) },
    },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    include: {
      registrations: {
        where: { status: { in: ['APPROVED', 'PENDING'] } },
        orderBy: { createdAt: 'asc' },
        include: { user: { select: { hasDrivingChip: true, certification: true, fullName: true } } },
      },
    },
  });

  return shifts
    .filter((s) => absoluteMinute(toIsoDate(s.date), windowOf(s).end) > nowAbs)
    .map(({ registrations, ...shift }) => {
      const onShift = registrations.filter((r) => r.status === 'APPROVED');
      const window = windowOf(shift);
      return {
        shift,
        registrations,
        view: {
          ...shiftHeader(shift),
          ...staffingView(computeStaffing(shift, countSeats(registrations))),
          registeredCount: onShift.length,
          registeredNames: onShift.map((r) => r.user.fullName),
          // Same people with their badges (qualification colour + driving chip) for the roster line.
          registeredPeople: onShift.map((r) => {
            const interval = registrationInterval(window, r);
            const hours = formatInterval(interval);
            return {
              fullName: r.user.fullName,
              certification: r.user.certification,
              hasDrivingChip: r.user.hasDrivingChip,
              opensNewCar: r.opensNewCar,
              startTime: hours.start,
              endTime: hours.end,
              // "משמרת מקוצרת": partial hours totalling less than 5 hours (shown to everyone)
              shortShift: isShortShift(interval, window),
            };
          }),
        },
      };
    });
}

/** Read-only board for guests: shifts, counts and names only — no IDs of people, no actions. */
export async function guestBoard() {
  const board = await loadBoard(true);
  return board.map(({ view }) => {
    const { seriesId: _seriesId, publishedAt: _publishedAt, ...safe } = view;
    return safe;
  });
}
