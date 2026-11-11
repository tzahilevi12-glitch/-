import { randomUUID } from 'node:crypto';
import { Prisma, type ShiftType } from '@prisma/client';
import { prisma, withSerializableTx, type Tx } from '../lib/prisma.ts';
import { ApiError } from '../lib/errors.ts';
import { WEEK_START_DAY, fromIsoDate, hhmmToTime, timeToHHMM, todayInStation } from '../lib/dates.ts';
import {
  DEFAULT_SHIFT_HOURS,
  addDays,
  checkShiftChange,
  expandRecurrence,
  ltrRange,
  shiftWindow,
  weekStartOf,
} from '../domain/registrationRules.ts';
import { rebalanceShift } from './registrationService.ts';
import { loadShift, overrideHHMM } from './shiftState.ts';

export interface ShiftFields {
  requiredDrivers?: number;
  maxVolunteers?: number;
  startTime?: string; // HH:MM; defaults to the station hours for the shift type
  endTime?: string;
  notes?: string;
}

const DEFAULTS = { requiredDrivers: 1, maxVolunteers: 3 };
const SHIFT_HE: Record<ShiftType, string> = { MORNING: 'בוקר', EVENING: 'צהריים', NIGHT: 'לילה' };
const MAX_RECURRENCE_DAYS = 366;

function resolveNewShift(shiftType: ShiftType, f: ShiftFields) {
  const startTime = f.startTime ?? DEFAULT_SHIFT_HOURS[shiftType].startTime;
  const endTime = f.endTime ?? DEFAULT_SHIFT_HOURS[shiftType].endTime;
  if (startTime === endTime) throw new ApiError(400, 'VALIDATION', 'שעת ההתחלה ושעת הסיום חייבות להיות שונות.');
  const next = {
    window: shiftWindow(startTime, endTime),
    requiredDrivers: f.requiredDrivers ?? DEFAULTS.requiredDrivers,
    maxVolunteers: f.maxVolunteers ?? DEFAULTS.maxVolunteers,
  };
  const check = checkShiftChange(next, []);
  if (!check.ok) throw new ApiError(400, 'VALIDATION', check.message);
  return {
    requiredDrivers: next.requiredDrivers,
    maxVolunteers: next.maxVolunteers,
    startTime: hhmmToTime(startTime),
    endTime: hhmmToTime(endTime),
    notes: f.notes ?? null,
  };
}

/** New shifts are drafts until the commander publishes their week. */
export async function createShift(input: ShiftFields & { date: string; shiftType: ShiftType }) {
  try {
    return await prisma.shift.create({
      data: { date: fromIsoDate(input.date), shiftType: input.shiftType, ...resolveNewShift(input.shiftType, input) },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ApiError(409, 'SHIFT_EXISTS', `כבר קיימת משמרת ${SHIFT_HE[input.shiftType]} בתאריך הזה.`);
    }
    throw err;
  }
}

/** Create draft shifts for each selected weekday in [from, to] and shift type; existing ones are skipped. */
export async function createRecurringShifts(
  input: ShiftFields & { from: string; to: string; daysOfWeek: number[]; shiftTypes: ShiftType[] },
) {
  if (input.to < input.from) throw new ApiError(400, 'VALIDATION', 'תאריך הסיום צריך להיות אחרי תאריך ההתחלה.');
  if (input.to > addDays(input.from, MAX_RECURRENCE_DAYS - 1)) {
    throw new ApiError(400, 'VALIDATION', `סדרה יכולה להימשך עד ${MAX_RECURRENCE_DAYS} ימים.`);
  }
  if ((input.startTime || input.endTime) && input.shiftTypes.length !== 1) {
    throw new ApiError(400, 'VALIDATION', 'אפשר לקבוע שעות מותאמות לסוג משמרת אחד בכל פעם.');
  }
  const dates = expandRecurrence(input.from, input.to, input.daysOfWeek);
  if (!dates.length) throw new ApiError(400, 'VALIDATION', 'אין תאריכים שמתאימים לימים שנבחרו.');

  const seriesId = randomUUID();
  const data = dates.flatMap((date) =>
    input.shiftTypes.map((shiftType) => ({ date: fromIsoDate(date), shiftType, seriesId, ...resolveNewShift(shiftType, input) })),
  );
  const { count } = await prisma.shift.createMany({ data, skipDuplicates: true });
  return { seriesId, created: count, skippedExisting: data.length - count };
}

export type ShiftPatch = ShiftFields & { status?: 'OPEN' | 'COMPLETED' };

async function updateShiftTx(tx: Tx, shiftId: string, patch: ShiftPatch) {
  const loaded = await loadShift(tx, shiftId);
  if (!loaded) throw new ApiError(404, 'SHIFT_NOT_FOUND', 'המשמרת לא נמצאה.');
  const { shift, active } = loaded;

  const startTime = patch.startTime ?? timeToHHMM(shift.startTime);
  const endTime = patch.endTime ?? timeToHHMM(shift.endTime);
  if (startTime === endTime) throw new ApiError(400, 'VALIDATION', 'שעת ההתחלה ושעת הסיום חייבות להיות שונות.');
  const next = {
    window: shiftWindow(startTime, endTime),
    requiredDrivers: patch.requiredDrivers ?? shift.requiredDrivers,
    maxVolunteers: patch.maxVolunteers ?? shift.maxVolunteers,
  };
  const check = checkShiftChange(
    next,
    active.map((r) => ({ status: r.status as 'APPROVED' | 'PENDING', ...overrideHHMM(r), opensNewCar: r.opensNewCar })),
  );
  if (!check.ok) throw new ApiError(409, 'CONFLICTS_WITH_REGISTRATIONS', check.message);

  let status = shift.status;
  if (patch.status === 'COMPLETED') status = 'COMPLETED';
  if (patch.status === 'OPEN' && shift.status === 'COMPLETED') status = 'OPEN'; // rebalance sets FILLED if needed

  await tx.shift.update({
    where: { id: shiftId },
    data: {
      startTime: hhmmToTime(startTime),
      endTime: hhmmToTime(endTime),
      requiredDrivers: next.requiredDrivers,
      maxVolunteers: next.maxVolunteers,
      notes: patch.notes ?? undefined,
      status,
    },
  });
  const staffing = await rebalanceShift(tx, shiftId);
  return { shift: await tx.shift.findUniqueOrThrow({ where: { id: shiftId } }), staffing };
}

export function updateShift(shiftId: string, patch: ShiftPatch) {
  return withSerializableTx((tx) => updateShiftTx(tx, shiftId, patch));
}

async function activeRegistrationCount(tx: Tx, shiftIds: string[]) {
  return tx.shiftRegistration.count({ where: { shiftId: { in: shiftIds }, status: { in: ['APPROVED', 'PENDING'] } } });
}

/** Delete a shift. With volunteers signed up, requires force=true. */
export async function deleteShift(shiftId: string, force: boolean) {
  return withSerializableTx(async (tx) => {
    const shift = await tx.shift.findUnique({ where: { id: shiftId } });
    if (!shift) throw new ApiError(404, 'SHIFT_NOT_FOUND', 'המשמרת לא נמצאה.');
    const active = await activeRegistrationCount(tx, [shiftId]);
    if (active > 0 && !force) {
      throw new ApiError(409, 'HAS_REGISTRATIONS', `רשומים למשמרת ${active} מתנדבים. יש לאשר כדי למחוק את המשמרת ואת ההרשמות.`);
    }
    await tx.shift.delete({ where: { id: shiftId } });
    return { deleted: 1, registrationsRemoved: active };
  });
}

async function upcomingInSeries(tx: Tx, seriesId: string) {
  const shifts = await tx.shift.findMany({
    where: { seriesId, date: { gte: fromIsoDate(todayInStation()) }, status: { not: 'COMPLETED' } },
    orderBy: { date: 'asc' },
    select: { id: true, date: true, shiftType: true },
  });
  if (!shifts.length) throw new ApiError(404, 'SERIES_NOT_FOUND', 'אין משמרות עתידיות בסדרה הזו.');
  return shifts;
}

export async function updateSeries(seriesId: string, patch: ShiftFields) {
  return withSerializableTx(async (tx) => {
    const shifts = await upcomingInSeries(tx, seriesId);
    if ((patch.startTime || patch.endTime) && new Set(shifts.map((s) => s.shiftType)).size > 1) {
      throw new ApiError(400, 'VALIDATION', 'בסדרה יש כמה סוגי משמרות. יש לשנות שעות לכל משמרת בנפרד.');
    }
    for (const s of shifts) {
      try {
        await updateShiftTx(tx, s.id, patch);
      } catch (err) {
        if (err instanceof ApiError) throw new ApiError(err.status, err.code, `${s.date.toISOString().slice(0, 10)}: ${err.message}`);
        throw err;
      }
    }
    return { updated: shifts.length };
  });
}

export async function deleteSeries(seriesId: string, force: boolean) {
  return withSerializableTx(async (tx) => {
    const ids = (await upcomingInSeries(tx, seriesId)).map((s) => s.id);
    const active = await activeRegistrationCount(tx, ids);
    if (active > 0 && !force) {
      throw new ApiError(409, 'HAS_REGISTRATIONS', `יש ${active} הרשמות בסדרה. יש לאשר כדי למחוק בכל זאת.`);
    }
    const { count } = await tx.shift.deleteMany({ where: { id: { in: ids } } });
    return { deleted: count, registrationsRemoved: active };
  });
}

// ───────────────────────── weekly publishing ─────────────────────────

export function normalizeWeekStart(date: string): string {
  return weekStartOf(date, WEEK_START_DAY);
}

const fmtDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', timeZone: 'UTC' });

/**
 * Publish every draft shift in the week starting `weekStart` and post an announcement
 * that volunteers see as a popup the next time they open the app.
 */
export async function publishWeek(weekStart: string, actorId: string) {
  const start = normalizeWeekStart(weekStart);
  const end = addDays(start, 6);
  return withSerializableTx(async (tx) => {
    const range = { gte: fromIsoDate(start), lte: fromIsoDate(end) };
    const drafts = await tx.shift.findMany({ where: { date: range, publishedAt: null }, select: { id: true } });
    if (!drafts.length) {
      throw new ApiError(409, 'NOTHING_TO_PUBLISH', 'אין טיוטות לפרסום בשבוע הזה. קודם צריך להוסיף משמרות.');
    }
    const alreadyPublished = await tx.shift.count({ where: { date: range, publishedAt: { not: null } } });
    const publishedAt = new Date();
    await tx.shift.updateMany({ where: { id: { in: drafts.map((d) => d.id) } }, data: { publishedAt } });

    const label = ltrRange(fmtDay(start), fmtDay(end));
    const announcement = await tx.announcement.create({
      data: {
        kind: alreadyPublished ? 'WEEK_UPDATED' : 'WEEK_PUBLISHED',
        weekStart: fromIsoDate(start),
        shiftCount: drafts.length,
        createdById: actorId,
        message: alreadyPublished
          ? `נוספו משמרות לשבוע ${label}. אפשר להיכנס ולהירשם.`
          : `המשמרות לשבוע ${label} פורסמו. אפשר להירשם למשמרות שמתאימות לך.`,
      },
    });
    return { weekStart: start, published: drafts.length, announcement };
  });
}
