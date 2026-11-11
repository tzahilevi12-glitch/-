import { randomUUID } from 'node:crypto';
import { PrismaClient, type ShiftType } from '@prisma/client';
import { DEFAULT_SHIFT_HOURS, addDays, weekStartOf } from '../src/domain/registrationRules.ts';
import { fromIsoDate, hhmmToTime, todayInStation } from '../src/lib/dates.ts';

const prisma = new PrismaClient();

/**
 * Demo data: a few volunteers, this week's shifts published, next week's as drafts
 * (so you can try "Publish week" as commander). Sign in as commander with COMMANDER_PIN.
 */
async function main() {
  const volunteers = [
    { fullName: 'Yossi Cohen', hasDrivingChip: true },
    { fullName: 'Miri Shalom', hasDrivingChip: true },
    { fullName: 'Avi Peretz', hasDrivingChip: false },
    { fullName: 'Noa Friedman', hasDrivingChip: false },
  ];
  for (const v of volunteers) {
    const exists = await prisma.user.findFirst({ where: { fullName: v.fullName } });
    if (!exists) await prisma.user.create({ data: v });
  }

  const types: ShiftType[] = ['MORNING', 'EVENING', 'NIGHT'];
  const thisWeek = weekStartOf(todayInStation());
  const now = new Date();
  for (const [weekStart, publishedAt] of [[thisWeek, now], [addDays(thisWeek, 7), null]] as const) {
    const seriesId = randomUUID();
    const data = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).flatMap((date) =>
      types.map((shiftType) => ({
        date: fromIsoDate(date),
        shiftType,
        seriesId,
        publishedAt,
        startTime: hhmmToTime(DEFAULT_SHIFT_HOURS[shiftType].startTime),
        endTime: hhmmToTime(DEFAULT_SHIFT_HOURS[shiftType].endTime),
        requiredDrivers: 1,
        maxVolunteers: shiftType === 'NIGHT' ? 2 : 3,
      })),
    );
    const { count } = await prisma.shift.createMany({ data, skipDuplicates: true });
    console.log(`Week of ${weekStart}: ${count} shifts ${publishedAt ? 'published' : 'as drafts'}.`);
  }
  await prisma.announcement.create({
    data: { kind: 'WEEK_PUBLISHED', weekStart: fromIsoDate(thisWeek), shiftCount: 21, message: 'Shifts for this week are published. Sign up for the ones that suit you.' },
  });
}

main().finally(() => prisma.$disconnect());
