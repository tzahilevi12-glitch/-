import { prisma, withSerializableTx, type Tx } from '../lib/prisma.ts';
import { ApiError, rejectionToError } from '../lib/errors.ts';
import { hhmmToTime, nowInStation, toIsoDate } from '../lib/dates.ts';
import {
  absoluteMinute,
  computeStaffing,
  decideRegistration,
  formatHHMM,
  isWholeShift,
  ltrRange,
  nextShiftStatus,
  pickPromotion,
  type Certification,
  type ShiftType,
  type Staffing,
  minutesUntilStart,
  volunteerCancelMode,
} from '../domain/registrationRules.ts';
import {
  buildCancelRequestMessage,
  buildQuickCancelMessage,
  notifyCommanders,
  notifySignUp,
  type CancelNotice,
  type SignUpNotice,
} from '../lib/telegram.ts';
import { loadShift, overridesFor, registrationInterval, windowOf } from './shiftState.ts';

const toTime = (hhmm: string | null) => (hhmm ? hhmmToTime(hhmm) : null);

// Hebrew display names. The internal code stays EVENING (renaming it in the database would risk existing data).
export const SHIFT_HE: Record<ShiftType, string> = { MORNING: 'בוקר', EVENING: 'צהריים', NIGHT: 'לילה' };

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
    let waitlist: Array<{ id: string; createdAt: Date; hasDrivingChip: boolean; opensNewCar: boolean }> = active
      .filter((r) => r.status === 'PENDING' && r.user.isActive)
      .map((r) => ({ id: r.id, createdAt: r.createdAt, hasDrivingChip: r.user.hasDrivingChip, opensNewCar: r.opensNewCar }));
    for (let next = pickPromotion(shift, counts, waitlist); next; next = pickPromotion(shift, counts, waitlist)) {
      const picked = next;
      await tx.shiftRegistration.update({ where: { id: picked.id }, data: { status: 'APPROVED' } });
      waitlist = waitlist.filter((w) => w.id !== picked.id);
      const extra = picked.opensNewCar;
      counts = {
        approvedTotal: counts.approvedTotal + (extra ? 0 : 1),
        approvedDrivers: counts.approvedDrivers + (picked.hasDrivingChip ? 1 : 0),
        approvedExtra: (counts.approvedExtra ?? 0) + (extra ? 1 : 0),
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
  /** Level B/C: "מעוניין לפתוח ניידת" — opens an additional patrol car (outside maxVolunteers). */
  opensNewCar?: boolean;
}

/**
 * Volunteer signs up for a published shift, optionally for part of it.
 * Their driving-chip status is taken from their profile at this moment.
 */
export async function registerForShift(userId: string, shiftId: string, hours: RequestedHours) {
  // Filled inside the transaction; sent only after it has committed successfully.
  let notice: SignUpNotice | null = null;
  const result = await withSerializableTx(async (tx) => {
    const [user, loaded, existing] = await Promise.all([
      tx.user.findUnique({ where: { id: userId }, select: { isActive: true, hasDrivingChip: true, certification: true, fullName: true } }),
      loadShift(tx, shiftId),
      tx.shiftRegistration.findUnique({ where: { shiftId_userId: { shiftId, userId } } }),
    ]);
    if (!user) throw new ApiError(404, 'USER_NOT_FOUND', 'המשתמש לא נמצא.');
    if (!loaded) throw new ApiError(404, 'SHIFT_NOT_FOUND', 'המשמרת לא נמצאה.');
    const { shift, window } = loaded;

    const decision = decideRegistration({
      user: { ...user, certification: user.certification as Certification },
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
    const data = {
      status,
      startTime: toTime(o.startTime),
      endTime: toTime(o.endTime),
      opensNewCar: hours.opensNewCar === true,
      cancelRequestedAt: null,
      cancelRejectedAt: null,
    } as const;
    const registration = existing
      ? await tx.shiftRegistration.update({ where: { id: existing.id }, data: { ...data, createdAt: new Date() } })
      : await tx.shiftRegistration.create({ data: { ...data, shiftId, userId } });

    const staffing = await rebalanceShift(tx, shiftId);
    const range = ltrRange(formatHHMM(decision.interval.start), formatHHMM(decision.interval.end));
    notice = {
      fullName: user.fullName,
      date: toIsoDate(shift.date),
      shiftType: shift.shiftType as ShiftType,
      startTime: formatHHMM(decision.interval.start),
      endTime: formatHHMM(decision.interval.end),
      partial: !isWholeShift(decision.interval, window),
      certification: user.certification as Certification,
      hasDrivingChip: user.hasDrivingChip,
      opensNewCar: hours.opensNewCar === true,
      waitlisted: decision.outcome === 'WAITLISTED',
    };
    return {
      registration,
      hours: { startTime: formatHHMM(decision.interval.start), endTime: formatHHMM(decision.interval.end) },
      waitlisted: decision.outcome === 'WAITLISTED',
      message:
        decision.outcome === 'WAITLISTED'
          ? `נרשמת לרשימת ההמתנה למשמרת, בשעות ${range}. תשובץ/י אוטומטית כשיתפנה מקום, או כשמזין המשמרות יאשר.`
          : hours.opensNewCar
            ? `נרשמת למשמרת עם ניידת נוספת, בשעות ${range}.`
            : `נרשמת למשמרת, בשעות ${range}.`,
      staffing,
    };
  });
  // Telegram push to the commanders. Fire-and-forget: never fails or delays the sign-up.
  const toSend = notice as SignUpNotice | null; // (assigned inside the callback above)
  if (toSend) notifySignUp(toSend);
  return result;
}

/**
 * Cancel a registration.
 * - Volunteer: a confirmed seat can be cancelled freely only while more than 12 hours remain
 *   before their hours start (waitlist entries any time). Within 12 hours this throws
 *   CANCEL_NEEDS_APPROVAL and the volunteer must use requestCancellation(). A volunteer cancellation ALWAYS creates an alert for
 *   the shift scheduler in the same transaction, so it cannot happen silently. The scheduler
 *   sees it as a popup in the dashboard until they acknowledge it.
 * - Commander: any time, no alert (they made the change themselves).
 * Frees the seat and promotes the waitlist.
 */
export async function cancelRegistration(params: { shiftId: string; userId: string; actorIsAdmin: boolean }) {
  const { shiftId, userId, actorIsAdmin } = params;
  let quick: CancelNotice | null = null; // Telegram note for a free (12+ hours ahead) cancellation
  const result = await withSerializableTx(async (tx) => {
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
      if (volunteerCancelMode({ status: reg.status, minutesToStart: minutesUntilStart(date, interval.start, now) }) === 'NEEDS_APPROVAL') {
        throw new ApiError(
          409,
          'CANCEL_NEEDS_APPROVAL',
          'נותרו 12 שעות או פחות עד תחילת המשמרת, ולכן הביטול דורש אישור של מזין המשמרות. אפשר לשלוח בקשת ביטול.',
        );
      }
      if (reg.status === 'APPROVED') {
        quick = {
          fullName: reg.user.fullName,
          date,
          shiftType: reg.shift.shiftType as ShiftType,
          startTime: formatHHMM(interval.start),
          endTime: formatHHMM(interval.end),
        };
      }
    }

    const registration = await tx.shiftRegistration.update({
      where: { id: reg.id },
      data: { status: 'CANCELLED', cancelRequestedAt: null, cancelRejectedAt: null },
    });

    let alertSent = false;
    if (!actorIsAdmin) {
      const wasSeat = reg.status === 'APPROVED';
      const range = ltrRange(formatHHMM(interval.start), formatHHMM(interval.end));
      const what = `משמרת ${SHIFT_HE[reg.shift.shiftType as ShiftType]}, ${hebrewDay(date)} (${range})`;
      await tx.staffAlert.create({
        data: {
          kind: wasSeat ? 'VOLUNTEER_CANCELLED' : 'WAITLIST_LEFT',
          registrationId: reg.id,
          volunteerId: userId,
          message: wasSeat ? `${reg.user.fullName} ביטל/ה את ההרשמה ל${what}.` : `${reg.user.fullName} יצא/ה מרשימת ההמתנה ל${what}.`,
          urgent: wasSeat && absoluteMinute(date, interval.start) - nowAbs < 24 * 60,
        },
      });
      alertSent = true;
    }

    const staffing = await rebalanceShift(tx, shiftId);
    return { registration, staffing, alertSent };
  });
  // The sign-up was announced on Telegram, so a quick undo is announced too.
  const q = quick as CancelNotice | null;
  if (q) notifyCommanders(() => buildQuickCancelMessage(q));
  return result;
}

/** FREE / NEEDS_APPROVAL for a registration, by the station clock now. */
export function cancelModeOf(
  reg: { status: string; startTime: Date | null; endTime: Date | null },
  shift: Parameters<typeof windowOf>[0] & { date: Date },
): 'FREE' | 'NEEDS_APPROVAL' {
  const interval = registrationInterval(windowOf(shift), reg);
  return volunteerCancelMode({ status: reg.status, minutesToStart: minutesUntilStart(toIsoDate(shift.date), interval.start, nowInStation()) });
}

/**
 * Volunteer asks to cancel a confirmed seat 12 hours or less before their hours start.
 * The seat stays taken (status stays APPROVED) until the commander approves.
 * If more than 12 hours are in fact still left, the registration is simply cancelled.
 */
export async function requestCancellation(params: { shiftId: string; userId: string }) {
  const { shiftId, userId } = params;
  const existing = await prisma.shiftRegistration.findUnique({ where: { shiftId_userId: { shiftId, userId } }, include: { shift: true } });
  if (existing && existing.status !== 'CANCELLED' && cancelModeOf(existing, existing.shift) === 'FREE') {
    const r = await cancelRegistration({ shiftId, userId, actorIsAdmin: false });
    return { outcome: 'CANCELLED' as const, ...r };
  }

  let notice: CancelNotice | null = null;
  const result = await withSerializableTx(async (tx) => {
    const reg = await tx.shiftRegistration.findUnique({
      where: { shiftId_userId: { shiftId, userId } },
      include: { shift: true, user: { select: { fullName: true } } },
    });
    if (!reg || reg.status === 'CANCELLED') throw new ApiError(404, 'NOT_REGISTERED', 'לא נרשמת למשמרת הזו.');
    if (reg.status !== 'APPROVED') throw new ApiError(409, 'NOT_APPROVED', 'אפשר לצאת מרשימת ההמתנה ישירות, בלי בקשה.');
    if (reg.cancelRequestedAt) throw new ApiError(409, 'ALREADY_REQUESTED', 'כבר שלחת בקשת ביטול. היא ממתינה לאישור מזין המשמרות.');

    const interval = registrationInterval(windowOf(reg.shift), reg);
    const date = toIsoDate(reg.shift.date);
    const now = nowInStation();
    if (reg.shift.status === 'COMPLETED' || absoluteMinute(date, interval.end) <= absoluteMinute(now.date, now.minute)) {
      throw new ApiError(409, 'SHIFT_LOCKED', 'המשמרת כבר הסתיימה. לשינוי יש לפנות למזין המשמרות.');
    }

    const registration = await tx.shiftRegistration.update({
      where: { id: reg.id },
      data: { cancelRequestedAt: new Date(), cancelRejectedAt: null },
    });
    notice = {
      fullName: reg.user.fullName,
      date,
      shiftType: reg.shift.shiftType as ShiftType,
      startTime: formatHHMM(interval.start),
      endTime: formatHHMM(interval.end),
    };
    return { registration };
  });
  const n = notice as CancelNotice | null;
  if (n) notifyCommanders(() => buildCancelRequestMessage(n));
  return { outcome: 'REQUESTED' as const, ...result };
}

/** Open cancellation requests, oldest first (commander dashboard). */
export async function openCancelRequests() {
  const regs = await prisma.shiftRegistration.findMany({
    where: { status: 'APPROVED', cancelRequestedAt: { not: null } },
    include: { shift: true, user: { select: { fullName: true, hasDrivingChip: true, certification: true } } },
    orderBy: { cancelRequestedAt: 'asc' },
  });
  return regs.map((r: any) => {
    const interval = registrationInterval(windowOf(r.shift), r);
    return {
      registrationId: r.id as string,
      shiftId: r.shiftId as string,
      date: toIsoDate(r.shift.date),
      shiftType: r.shift.shiftType as ShiftType,
      startTime: formatHHMM(interval.start),
      endTime: formatHHMM(interval.end),
      fullName: r.user.fullName as string,
      hasDrivingChip: r.user.hasDrivingChip as boolean,
      certification: r.user.certification as Certification,
      opensNewCar: r.opensNewCar as boolean,
      registeredAt: (r.createdAt as Date).toISOString(),
      requestedAt: (r.cancelRequestedAt as Date).toISOString(),
    };
  });
}

/**
 * Commander decides on a cancellation request.
 * - approve: the registration is cancelled, the seat is freed and the waitlist is promoted.
 * - reject: the volunteer stays registered; they see "בקשת הביטול נדחתה".
 */
export async function decideCancelRequest(registrationId: string, approve: boolean) {
  return withSerializableTx(async (tx) => {
    const reg = await tx.shiftRegistration.findUnique({ where: { id: registrationId } });
    if (!reg) throw new ApiError(404, 'REGISTRATION_NOT_FOUND', 'ההרשמה לא נמצאה.');
    if (reg.status !== 'APPROVED' || !reg.cancelRequestedAt) {
      throw new ApiError(409, 'NO_CANCEL_REQUEST', 'אין בקשת ביטול פתוחה להרשמה הזו (ייתכן שכבר טופלה).');
    }
    if (!approve) {
      const registration = await tx.shiftRegistration.update({
        where: { id: reg.id },
        data: { cancelRequestedAt: null, cancelRejectedAt: new Date() },
      });
      return { registration, staffing: null };
    }
    const registration = await tx.shiftRegistration.update({
      where: { id: reg.id },
      data: { status: 'CANCELLED', cancelRequestedAt: null, cancelRejectedAt: null },
    });
    const staffing = await rebalanceShift(tx, reg.shiftId);
    return { registration, staffing };
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
    if (!reg.opensNewCar && loaded.counts.approvedTotal >= loaded.shift.maxVolunteers) {
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
    select: { id: true, kind: true, message: true, urgent: true, createdAt: true },
  });
}

export async function acknowledgeAlerts(ids: string[], actorId: string) {
  const { count } = await prisma.staffAlert.updateMany({
    where: { id: { in: ids }, acknowledgedAt: null },
    data: { acknowledgedAt: new Date(), acknowledgedById: actorId },
  });
  return { acknowledged: count };
}
