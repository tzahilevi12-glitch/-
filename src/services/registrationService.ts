import { prisma, withSerializableTx, type Tx } from '../lib/prisma.ts';
import { notifyCancellationBySms, type CancellationDetails } from './smsNotifier.ts';
import { ApiError, rejectionToError } from '../lib/errors.ts';
import { hhmmToTime, nowInStation, toIsoDate } from '../lib/dates.ts';
import {
  absoluteMinute,
  computeStaffing,
  decideRegistration,
  formatHHMM,
  ltrRange,
  nextShiftStatus,
  pickPromotion,
  type ShiftType,
  type Staffing,
} from '../domain/registrationRules.ts';
import { loadShift, overridesFor, registrationInterval, windowOf } from './shiftState.ts';

const toTime = (hhmm: string | null) => (hhmm ? hhmmToTime(hhmm) : null);

export const SHIFT_HE: Record<ShiftType, string> = { MORNING: 'בוקר', EVENING: 'ערב', NIGHT: 'לילה' };

/** "יום שישי, 6.11" */
export function hebrewDay(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const weekday = d.toLocaleDateString('he-IL', { weekday: 'long', timeZone: 'UTC' });
  return `${weekday}, ⁦${d.getUTCDate()}.${d.getUTCMonth() + 1}⁩`;
}

/**
 * Promote waitlisted volunteers into free seats (oldest first; drivers first while
 * the remaining seats are reserved for drivers), then sync OPEN/FILLED.
 * Call after anything that changes seats, capacity or someone's driving chip.
 */
export async function rebalanceShift(tx: Tx, shiftId: string): Promise<Staffing> {
  const loaded = await loadShift(tx, shiftId);
  if (!loaded) throw new ApiError(404, 'SHIFT_NOT_FOUND', 'המשמרת לא נמצאה.');
  const { shift, active } = loaded;
  let counts = loaded.counts;

  if (shift.status !== 'COMPLETED') {
    let waitlist: Array<{ id: string; createdAt: Date; hasDrivingChip: boolean }> = active
      .filter((r) => r.status === 'PENDING' && r.user.isActive)
      .map((r) => ({ id: r.id, createdAt: r.createdAt, hasDrivingChip: r.user.hasDrivingChip }));
    for (let next = pickPromotion(shift, counts, waitlist); next; next = pickPromotion(shift, counts, waitlist)) {
      const picked = next;
      await tx.shiftRegistration.update({ where: { id: picked.id }, data: { status: 'APPROVED' } });
      waitlist = waitlist.filter((w) => w.id !== picked.id);
      counts = {
        approvedTotal: counts.approvedTotal + 1,
        approvedDrivers: counts.approvedDrivers + (picked.hasDrivingChip ? 1 : 0),
      };
    }
  }

  const staffing = computeStaffing(shift, counts);
  const status = nextShiftStatus(shift.status, staffing);
  if (status !== shift.status) await tx.shift.update({ where: { id: shiftId }, data: { status } });
  return staffing;
}

/** Start dates of the user's other active shifts on the same date (for the one-per-day rule). */
async function otherShiftDates(tx: Tx, userId: string, date: Date, excludeRegistrationId?: string): Promise<string[]> {
  const regs = await tx.shiftRegistration.findMany({
    where: {
      userId,
      id: excludeRegistrationId ? { not: excludeRegistrationId } : undefined,
      status: { in: ['APPROVED', 'PENDING'] },
      shift: { date },
    },
    include: { shift: { select: { date: true } } },
  });
  return regs.map((r) => toIsoDate(r.shift.date));
}

export interface RequestedHours {
  startTime?: string;
  endTime?: string;
}

/**
 * Volunteer signs up for a published shift, optionally for part of it.
 * Their driving-chip status is taken from their profile at this moment.
 */
export async function registerForShift(userId: string, shiftId: string, hours: RequestedHours) {
  return withSerializableTx(async (tx) => {
    const [user, loaded, existing] = await Promise.all([
      tx.user.findUnique({ where: { id: userId }, select: { isActive: true, hasDrivingChip: true } }),
      loadShift(tx, shiftId),
      tx.shiftRegistration.findUnique({ where: { shiftId_userId: { shiftId, userId } } }),
    ]);
    if (!user) throw new ApiError(404, 'USER_NOT_FOUND', 'המשתמש לא נמצא.');
    if (!loaded) throw new ApiError(404, 'SHIFT_NOT_FOUND', 'המשמרת לא נמצאה.');
    const { shift, window } = loaded;

    const decision = decideRegistration({
      user,
      shift: { ...shift, date: toIsoDate(shift.date), published: shift.publishedAt !== null, window },
      requested: hours,
      counts: loaded.counts,
      existingStatusOnShift: existing?.status ?? null,
      otherShiftDates: await otherShiftDates(tx, userId, shift.date, existing?.id),
      now: nowInStation(),
    });
    if (decision.outcome === 'REJECTED') throw rejectionToError(decision.code, decision.message);

    const status = decision.outcome === 'APPROVED' ? 'APPROVED' : 'PENDING';
    const o = overridesFor(window, decision.interval);
    const data = { status, startTime: toTime(o.startTime), endTime: toTime(o.endTime) } as const;
    const registration = existing
      ? await tx.shiftRegistration.update({ where: { id: existing.id }, data: { ...data, createdAt: new Date() } })
      : await tx.shiftRegistration.create({ data: { ...data, shiftId, userId } });

    const staffing = await rebalanceShift(tx, shiftId);
    const range = ltrRange(formatHHMM(decision.interval.start), formatHHMM(decision.interval.end));
    return {
      registration,
      hours: { startTime: formatHHMM(decision.interval.start), endTime: formatHHMM(decision.interval.end) },
      waitlisted: decision.outcome === 'WAITLISTED',
      message:
        decision.outcome === 'WAITLISTED'
          ? "המקום האחרון שמור למתנדב עם צ'יפ נהיגה. נכנסת לרשימת ההמתנה, ותשובץ/י אוטומטית אם יתפנה מקום או אם מזין המשמרות יאשר."
          : `נרשמת למשמרת, בשעות ${range}.`,
      staffing,
    };
  });
}

/**
 * Cancel a registration.
 * - Volunteer: allowed until their hours end. The cancellation ALWAYS creates an alert for
 *   the shift scheduler in the same transaction (in-site popup), and then texts the numbers
 *   in ALERT_PHONE_NUMBERS. The SMS is sent after the transaction commits, so a retried
 *   transaction never sends duplicates, and an SMS failure never undoes the cancellation;
 *   the outcome is stored on the alert instead.
 * - Commander: any time, no alert (they made the change themselves).
 * Frees the seat and promotes the waitlist.
 */
export async function cancelRegistration(params: { shiftId: string; userId: string; actorIsAdmin: boolean }) {
  const result = await cancelRegistrationTx(params);
  let sms: Awaited<ReturnType<typeof notifyCancellationBySms>> | null = null;
  if (result.alert) {
    sms = await notifyCancellationBySms(result.alert.details);
    await prisma.staffAlert
      .update({ where: { id: result.alert.id }, data: { smsSent: sms.sent, smsError: sms.error } })
      .catch((err) => console.error('[SMS] could not record result', err));
  }
  return { registration: result.registration, staffing: result.staffing, alertSent: result.alert !== null, smsSent: sms?.sent ?? 0 };
}

async function cancelRegistrationTx(params: { shiftId: string; userId: string; actorIsAdmin: boolean }) {
  const { shiftId, userId, actorIsAdmin } = params;
  return withSerializableTx(async (tx) => {
    const reg = await tx.shiftRegistration.findUnique({
      where: { shiftId_userId: { shiftId, userId } },
      include: { shift: true, user: { select: { fullName: true } } },
    });
    if (!reg || reg.status === 'CANCELLED') throw new ApiError(404, 'NOT_REGISTERED', 'לא נרשמת למשמרת הזו.');

    const interval = registrationInterval(windowOf(reg.shift), reg);
    const date = toIsoDate(reg.shift.date);
    const now = nowInStation();
    const nowAbs = absoluteMinute(now.date, now.minute);

    if (!actorIsAdmin) {
      const ended = absoluteMinute(date, interval.end) <= nowAbs;
      if (reg.shift.status === 'COMPLETED' || ended) {
        throw new ApiError(409, 'SHIFT_LOCKED', 'המשמרת כבר הסתיימה. לשינוי יש לפנות למזין המשמרות.');
      }
    }

    const registration = await tx.shiftRegistration.update({ where: { id: reg.id }, data: { status: 'CANCELLED' } });

    let alert: { id: string; details: CancellationDetails } | null = null;
    if (!actorIsAdmin) {
      const wasSeat = reg.status === 'APPROVED';
      const range = ltrRange(formatHHMM(interval.start), formatHHMM(interval.end));
      const what = `משמרת ${SHIFT_HE[reg.shift.shiftType as ShiftType]}, ${hebrewDay(date)} (${range})`;
      const urgent = wasSeat && absoluteMinute(date, interval.start) - nowAbs < 24 * 60;
      const created = await tx.staffAlert.create({
        data: {
          kind: wasSeat ? 'VOLUNTEER_CANCELLED' : 'WAITLIST_LEFT',
          registrationId: reg.id,
          volunteerId: userId,
          message: wasSeat ? `${reg.user.fullName} ביטל/ה את ההרשמה ל${what}.` : `${reg.user.fullName} יצא/ה מרשימת ההמתנה ל${what}.`,
          urgent,
        },
      });
      alert = {
        id: created.id,
        details: {
          volunteerName: reg.user.fullName,
          shiftType: reg.shift.shiftType as ShiftType,
          date,
          startTime: formatHHMM(interval.start),
          endTime: formatHHMM(interval.end),
          urgent,
          waitlistOnly: !wasSeat,
        },
      };
    }

    const staffing = await rebalanceShift(tx, shiftId);
    return { registration, staffing, alert };
  });
}

/** Commander approves a waitlisted volunteer, overriding the driver reservation (capacity still applies). */
export async function adminApproveRegistration(registrationId: string) {
  return withSerializableTx(async (tx) => {
    const reg = await tx.shiftRegistration.findUnique({ where: { id: registrationId } });
    if (!reg) throw new ApiError(404, 'REGISTRATION_NOT_FOUND', 'ההרשמה לא נמצאה.');
    if (reg.status !== 'PENDING') throw new ApiError(409, 'NOT_PENDING', 'ההרשמה הזו לא ממתינה לאישור.');
    const loaded = await loadShift(tx, reg.shiftId);
    if (!loaded) throw new ApiError(404, 'SHIFT_NOT_FOUND', 'המשמרת לא נמצאה.');
    if (loaded.shift.status === 'COMPLETED') throw new ApiError(409, 'SHIFT_NOT_OPEN', 'המשמרת סגורה.');
    if (loaded.counts.approvedTotal >= loaded.shift.maxVolunteers) {
      throw new ApiError(409, 'SHIFT_FULL', 'המשמרת מלאה. יש להגדיל את מספר המתנדבים או להסיר מישהו קודם.');
    }
    const registration = await tx.shiftRegistration.update({ where: { id: reg.id }, data: { status: 'APPROVED' } });
    const staffing = await rebalanceShift(tx, reg.shiftId);
    return { registration, staffing };
  });
}

// ───────────────────────── scheduler alerts ─────────────────────────

/** Unacknowledged alerts, newest first — shown to commanders as a popup. */
export async function openAlerts() {
  return prisma.staffAlert.findMany({
    where: { acknowledgedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: { id: true, kind: true, message: true, urgent: true, smsSent: true, smsError: true, createdAt: true },
  });
}

export async function acknowledgeAlerts(ids: string[], actorId: string) {
  const { count } = await prisma.staffAlert.updateMany({
    where: { id: { in: ids }, acknowledgedAt: null },
    data: { acknowledgedAt: new Date(), acknowledgedById: actorId },
  });
  return { acknowledged: count };
}
