import { prisma } from '../lib/prisma.ts';
import { fromIsoDate, todayInStation } from '../lib/dates.ts';
import { monthRange, rankVolunteers } from '../domain/engagement.ts';
import { registrationInterval, windowOf } from './shiftState.ts';

/**
 * "🏆 טופ 3 מובילים": the top 3 volunteers of the current calendar month (station time), by the
 * number of confirmed shifts in the month — done and still to come — with hours breaking ties.
 * The month is taken from today's date in Israel, so the count starts fresh at 00:00 on the 1st.
 * Counted: self sign-ups and manual registrations, regular slots and extra patrol cars.
 * Not counted: cancelled shifts, waitlist entries, commanders, paused volunteers.
 */
export async function monthlyLeaderboard(now = new Date()) {
  const { from, to, month } = monthRange(todayInStation(now));
  const regs = await prisma.shiftRegistration.findMany({
    where: {
      status: 'APPROVED',
      shift: { date: { gte: fromIsoDate(from), lt: fromIsoDate(to) }, status: { not: 'CANCELLED' } },
      user: { role: 'VOLUNTEER', isActive: true },
    },
    select: {
      userId: true,
      startTime: true,
      endTime: true,
      shift: { select: { startTime: true, endTime: true } },
      user: { select: { fullName: true, certification: true, hasDrivingChip: true } },
    },
  });
  type Person = { fullName: string; certification: string; hasDrivingChip: boolean };
  const top = rankVolunteers<Person>(
    regs.map((r) => {
      const i = registrationInterval(windowOf(r.shift), r);
      return { userId: r.userId as string, person: r.user as Person, minutes: i.end - i.start };
    }),
    3,
  );
  return {
    month,
    top: top.map((t) => ({
      rank: t.rank,
      fullName: t.person.fullName,
      certification: t.person.certification,
      hasDrivingChip: t.person.hasDrivingChip,
      minutes: t.minutes,
      shifts: t.shifts,
    })),
  };
}
