import { prisma, withSerializableTx, type Tx } from '../lib/prisma.ts';
import { ApiError } from '../lib/errors.ts';
import { addDays, type Certification } from '../domain/registrationRules.ts';
import { fromIsoDate, todayInStation } from '../lib/dates.ts';
import { rebalanceShift } from './registrationService.ts';

const USER_VIEW = { id: true, fullName: true, role: true, hasDrivingChip: true, certification: true, isActive: true, createdAt: true } as const;

/** Upcoming = from yesterday (a NIGHT shift may still be running) and not completed. */
const upcomingShift = () => ({ date: { gte: fromIsoDate(addDays(todayInStation(), -1)) }, status: { not: 'COMPLETED' as const } });

async function rebalanceUserShifts(tx: Tx, userId: string) {
  const regs = await tx.shiftRegistration.findMany({
    where: { userId, status: { in: ['APPROVED', 'PENDING'] }, shift: upcomingShift() },
    select: { shiftId: true },
  });
  const ids = [...new Set<string>(regs.map((r) => r.shiftId))];
  for (const id of ids) await rebalanceShift(tx, id);
  return ids.length;
}

type Before = { hasDrivingChip: boolean; certification: string };
const qualificationChanged = (before: Before, patch: { hasDrivingChip?: boolean; certification?: Certification }) =>
  (patch.hasDrivingChip !== undefined && patch.hasDrivingChip !== before.hasDrivingChip) ||
  (patch.certification !== undefined && patch.certification !== before.certification);

/** A volunteer edits their own name, driving chip or Level B/C qualification. Their upcoming shifts are re-checked. */
export async function updateMyProfile(userId: string, patch: { fullName?: string; hasDrivingChip?: boolean; certification?: Certification }) {
  return withSerializableTx(async (tx) => {
    const before = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { hasDrivingChip: true, certification: true } });
    const user = await tx.user.update({ where: { id: userId }, data: patch, select: USER_VIEW });
    if (qualificationChanged(before, patch)) await rebalanceUserShifts(tx, userId);
    return user;
  });
}

export async function listVolunteers(opts: { search?: string }) {
  const users = await prisma.user.findMany({
    where: {
      role: 'VOLUNTEER',
      ...(opts.search && { fullName: { contains: opts.search, mode: 'insensitive' as const } }),
    },
    select: {
      ...USER_VIEW,
      _count: { select: { registrations: { where: { status: 'APPROVED', shift: upcomingShift() } } } },
    },
    orderBy: [{ isActive: 'desc' }, { fullName: 'asc' }],
  });
  return users.map(({ _count, ...u }) => ({ ...u, upcomingShifts: _count.registrations }));
}

/**
 * Commander corrects a volunteer's driving chip or pauses them.
 * Pausing cancels their upcoming sign-ups and refills those seats from the waitlist.
 */
export async function adminUpdateUser(
  actorId: string,
  userId: string,
  patch: { hasDrivingChip?: boolean; certification?: Certification; isActive?: boolean; fullName?: string },
) {
  if (actorId === userId && patch.isActive === false) {
    throw new ApiError(409, 'SELF_LOCKOUT', 'אי אפשר להשהות את החשבון שלך.');
  }
  return withSerializableTx(async (tx) => {
    const before = await tx.user.findUnique({ where: { id: userId } });
    if (!before) throw new ApiError(404, 'USER_NOT_FOUND', 'המתנדב לא נמצא.');
    const user = await tx.user.update({ where: { id: userId }, data: patch, select: USER_VIEW });

    let cancelled = 0;
    if (patch.isActive === false && before.isActive) {
      const regs = await tx.shiftRegistration.findMany({
        where: { userId, status: { in: ['APPROVED', 'PENDING'] }, shift: upcomingShift() },
        select: { id: true, shiftId: true },
      });
      await tx.shiftRegistration.updateMany({ where: { id: { in: regs.map((r) => r.id) } }, data: { status: 'CANCELLED' } });
      await tx.session.deleteMany({ where: { userId } });
      for (const id of new Set<string>(regs.map((r) => r.shiftId))) await rebalanceShift(tx, id);
      cancelled = regs.length;
    } else if (qualificationChanged(before, patch)) {
      await rebalanceUserShifts(tx, userId);
    }
    return { user, cancelledRegistrations: cancelled };
  });
}

// ───────────────────────── notifications ─────────────────────────

const LOOKBACK_DAYS = 7;

/** Announcements the user hasn't dismissed. New users see the last week's announcements. */
export async function unseenAnnouncements(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { notificationsSeenAt: true } });
  const floor = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);
  const since = user.notificationsSeenAt && user.notificationsSeenAt > floor ? user.notificationsSeenAt : floor;
  return prisma.announcement.findMany({
    where: { createdAt: { gt: since } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, kind: true, message: true, shiftCount: true, weekStart: true, createdAt: true },
  });
}

export async function markAnnouncementsSeen(userId: string) {
  await prisma.user.update({ where: { id: userId }, data: { notificationsSeenAt: new Date() } });
}
