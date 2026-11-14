import { prisma } from '../lib/prisma.ts';
import { fromIsoDate, todayInStation } from '../lib/dates.ts';
import { monthRange, rankVolunteers } from '../domain/engagement.ts';
import { registrationInterval, windowOf } from './shiftState.ts';

/**
 * "🏆 מצטייני החודש": the top 3 volunteers of the current calendar month (station time),
 * by total hours of their confirmed shifts in the month — done and still to come — then by
 * number of shifts. Cancelled shifts, waitlist entries and commanders are not counted.
 * Extra patrol cars count like any other shift.
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
