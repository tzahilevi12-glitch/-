/**
 * Bridges database rows and the pure rules: converts Prisma Time/Date columns
 * into the minute-based model and loads what a decision needs.
 */
import type { Shift, ShiftRegistration } from '@prisma/client';
import type { Tx } from '../lib/prisma.ts';
import { timeToHHMM, toIsoDate } from '../lib/dates.ts';
import {
  formatInterval,
  isWholeShift,
  resolveHours,
  shiftWindow,
  type Interval,
  type SeatCounts,
  type Staffing,
} from '../domain/registrationRules.ts';

export function windowOf(shift: Pick<Shift, 'startTime' | 'endTime'>): Interval {
  return shiftWindow(timeToHHMM(shift.startTime), timeToHHMM(shift.endTime));
}

export function overrideHHMM(reg: Pick<ShiftRegistration, 'startTime' | 'endTime'>) {
  return {
    startTime: reg.startTime ? timeToHHMM(reg.startTime) : null,
    endTime: reg.endTime ? timeToHHMM(reg.endTime) : null,
  };
}

/** Effective hours of a registration (null overrides = whole shift). */
export function registrationInterval(window: Interval, reg: Pick<ShiftRegistration, 'startTime' | 'endTime'>): Interval {
  const o = overrideHHMM(reg);
  const r = resolveHours(window, o.startTime, o.endTime);
  return r.ok ? r.interval : window; // overrides are validated on every write; fallback only for hand-edited data
}

/** Store overrides only when they differ from the whole shift. */
export function overridesFor(window: Interval, interval: Interval) {
  if (isWholeShift(interval, window)) return { startTime: null, endTime: null };
  const f = formatInterval(interval);
  return { startTime: f.start, endTime: f.end };
}

export function countSeats(regs: Array<{ status: string; user: { hasDrivingChip: boolean } }>): SeatCounts {
  const approved = regs.filter((r) => r.status === 'APPROVED');
  return { approvedTotal: approved.length, approvedDrivers: approved.filter((r) => r.user.hasDrivingChip).length };
}

export async function loadShift(tx: Tx, shiftId: string) {
  const shift = await tx.shift.findUnique({
    where: { id: shiftId },
    include: {
      registrations: {
        where: { status: { in: ['APPROVED', 'PENDING'] } },
        include: { user: { select: { hasDrivingChip: true, isActive: true } } },
      },
    },
  });
  if (!shift) return null;
  const { registrations, ...row } = shift;
  return { shift: row, window: windowOf(row), active: registrations, counts: countSeats(registrations) };
}

export function staffingView(s: Staffing) {
  return {
    badge: s.badge,
    driverAlert: s.hasQualifiedDriver ? ('GREEN' as const) : ('RED' as const),
    seatsTaken: s.approvedTotal,
    seatsLeft: s.seatsLeft,
    driversMissing: s.driversMissing,
    driverOnly: s.remainingSeatsReservedForDrivers,
  };
}

export function shiftHeader(shift: Shift) {
  return {
    id: shift.id,
    date: toIsoDate(shift.date),
    shiftType: shift.shiftType,
    startTime: timeToHHMM(shift.startTime),
    endTime: timeToHHMM(shift.endTime),
    status: shift.status,
    requiredDrivers: shift.requiredDrivers,
    maxVolunteers: shift.maxVolunteers,
    published: shift.publishedAt !== null,
    publishedAt: shift.publishedAt,
    seriesId: shift.seriesId,
    notes: shift.notes,
  };
}
