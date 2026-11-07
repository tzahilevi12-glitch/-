import { Router } from 'express';
import { prisma } from '../lib/prisma.ts';
import { ApiError } from '../lib/errors.ts';
import { fromIsoDate, isIsoDate, todayInStation } from '../lib/dates.ts';
import { asBody, optBool, optEnum, optHHMM, optInt, optString, reqDate, reqEnum } from '../lib/validate.ts';
import { CERTIFICATIONS, addDays, computeStaffing, formatInterval } from '../domain/registrationRules.ts';
import { acknowledgeAlerts, adminApproveRegistration, cancelRegistration, openAlerts } from '../services/registrationService.ts';
import {
  createRecurringShifts,
  createShift,
  deleteSeries,
  deleteShift,
  normalizeWeekStart,
  publishWeek,
  updateSeries,
  updateShift,
  type ShiftFields,
} from '../services/shiftAdminService.ts';
import { adminUpdateUser, listVolunteers } from '../services/userService.ts';
import { countSeats, registrationInterval, shiftHeader, staffingView, windowOf } from '../services/shiftState.ts';

export const adminRouter = Router();

const SHIFT_TYPES = ['MORNING', 'EVENING', 'NIGHT'] as const;

function shiftFields(b: Record<string, unknown>): ShiftFields {
  return {
    requiredDrivers: optInt(b, 'requiredDrivers', 0, 20),
    maxVolunteers: optInt(b, 'maxVolunteers', 1, 50),
    startTime: optHHMM(b, 'startTime'),
    endTime: optHHMM(b, 'endTime'),
    notes: optString(b, 'notes'),
  };
}

const force = (q: unknown) => q === 'true' || q === '1';

// ───────────────────────── week roster & publishing ─────────────────────────

/**
 * GET /api/admin/weeks/:weekStart   (any date in the week; "current" = this week)
 * The week's shifts (drafts included) with who's on them, the waitlist,
 * a RED/GREEN driver alert, and the publication state of the week.
 */
adminRouter.get('/weeks/:date', async (req, res) => {
  const date = req.params.date === 'current' ? todayInStation() : req.params.date;
  if (!isIsoDate(date)) throw new ApiError(400, 'VALIDATION', 'יש לבחור תאריך בשבוע.');
  const weekStart = normalizeWeekStart(date);
  const weekEnd = addDays(weekStart, 6);

  const [shifts, lastAnnouncement] = await Promise.all([
    prisma.shift.findMany({
      where: { date: { gte: fromIsoDate(weekStart), lte: fromIsoDate(weekEnd) } },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      include: {
        registrations: {
          where: { status: { in: ['APPROVED', 'PENDING'] } },
          orderBy: { createdAt: 'asc' },
          include: { user: { select: { id: true, fullName: true, hasDrivingChip: true, certification: true } } },
        },
      },
    }),
    prisma.announcement.findFirst({ where: { weekStart: fromIsoDate(weekStart) }, orderBy: { createdAt: 'desc' } }),
  ]);

  res.json({
    weekStart,
    weekEnd,
    draftCount: shifts.filter((s) => !s.publishedAt).length,
    publishedCount: shifts.filter((s) => s.publishedAt).length,
    lastPublishedAt: lastAnnouncement?.createdAt ?? null,
    shifts: shifts.map(({ registrations, ...shift }) => {
      const window = windowOf(shift);
      const person = (r: (typeof registrations)[number]) => {
        const interval = registrationInterval(window, r);
        const f = formatInterval(interval);
        return {
          registrationId: r.id,
          userId: r.user.id,
          fullName: r.user.fullName,
          hasDrivingChip: r.user.hasDrivingChip,
          certification: r.user.certification,
          startTime: f.start,
          endTime: f.end,
          isPartial: interval.start !== window.start || interval.end !== window.end,
          signedUpAt: r.createdAt,
        };
      };
      return {
        ...shiftHeader(shift),
        ...staffingView(computeStaffing(shift, countSeats(registrations))),
        approved: registrations.filter((r) => r.status === 'APPROVED').map(person),
        waitlist: registrations.filter((r) => r.status === 'PENDING').map(person),
      };
    }),
  });
});

/** POST /api/admin/weeks/:weekStart/publish — publish the week's drafts and notify volunteers. */
adminRouter.post('/weeks/:date/publish', async (req, res) => {
  if (!isIsoDate(req.params.date)) throw new ApiError(400, 'VALIDATION', 'יש לבחור תאריך בשבוע.');
  res.json(await publishWeek(req.params.date, req.user!.id));
});

/** PATCH /api/admin/registrations/:id  { "status": "APPROVED" | "CANCELLED" } */
adminRouter.patch('/registrations/:id', async (req, res) => {
  const status = reqEnum(asBody(req.body), 'status', ['APPROVED', 'CANCELLED'] as const);
  if (status === 'APPROVED') {
    const { registration, staffing } = await adminApproveRegistration(req.params.id);
    res.json({ registration, shift: staffingView(staffing) });
    return;
  }
  const reg = await prisma.shiftRegistration.findUnique({ where: { id: req.params.id } });
  if (!reg) throw new ApiError(404, 'REGISTRATION_NOT_FOUND', 'ההרשמה לא נמצאה.');
  const { registration, staffing } = await cancelRegistration({ shiftId: reg.shiftId, userId: reg.userId, actorIsAdmin: true });
  res.json({ registration, shift: staffingView(staffing) });
});

// ───────────────────────── scheduler alerts ─────────────────────────

/** GET /api/admin/alerts — cancellations not yet acknowledged (shown as a popup). */
adminRouter.get('/alerts', async (_req, res) => {
  res.json({ alerts: await openAlerts() });
});

/** POST /api/admin/alerts/ack  { ids: [...] } */
adminRouter.post('/alerts/ack', async (req, res) => {
  const ids = asBody(req.body).ids;
  if (!Array.isArray(ids) || !ids.every((i) => typeof i === 'string')) throw new ApiError(400, 'VALIDATION', 'בקשה לא תקינה.');
  res.json(await acknowledgeAlerts(ids as string[], req.user!.id));
});

// ───────────────────────── shifts ─────────────────────────

/** POST /api/admin/shifts  { date, shiftType, requiredDrivers?, maxVolunteers?, startTime?, endTime?, notes? } — draft */
adminRouter.post('/shifts', async (req, res) => {
  const b = asBody(req.body);
  const shift = await createShift({ date: reqDate(b, 'date'), shiftType: reqEnum(b, 'shiftType', SHIFT_TYPES), ...shiftFields(b) });
  res.status(201).json(shiftHeader(shift));
});

/** POST /api/admin/shifts/recurring  { from, to, daysOfWeek: [0..6], shiftTypes: [...], ...fields } — drafts */
adminRouter.post('/shifts/recurring', async (req, res) => {
  const b = asBody(req.body);
  const days = b.daysOfWeek;
  const types = b.shiftTypes;
  if (!Array.isArray(days) || !days.length || !days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
    throw new ApiError(400, 'VALIDATION', 'יש לבחור לפחות יום אחד.');
  }
  if (!Array.isArray(types) || !types.length || !types.every((t) => (SHIFT_TYPES as readonly unknown[]).includes(t))) {
    throw new ApiError(400, 'VALIDATION', 'יש לבחור לפחות סוג משמרת אחד.');
  }
  res.status(201).json(
    await createRecurringShifts({
      from: reqDate(b, 'from'),
      to: reqDate(b, 'to'),
      daysOfWeek: [...new Set(days as number[])],
      shiftTypes: [...new Set(types as (typeof SHIFT_TYPES)[number][])],
      ...shiftFields(b),
    }),
  );
});

/** PATCH /api/admin/shifts/:id  { requiredDrivers?, maxVolunteers?, startTime?, endTime?, notes?, status?: "COMPLETED" | "OPEN" } */
adminRouter.patch('/shifts/:id', async (req, res) => {
  const b = asBody(req.body);
  const { shift, staffing } = await updateShift(req.params.id, { ...shiftFields(b), status: optEnum(b, 'status', ['OPEN', 'COMPLETED'] as const) });
  res.json({ ...shiftHeader(shift), ...staffingView(staffing) });
});

/** DELETE /api/admin/shifts/:id?force=true */
adminRouter.delete('/shifts/:id', async (req, res) => {
  res.json(await deleteShift(req.params.id, force(req.query.force)));
});

adminRouter.patch('/shift-series/:seriesId', async (req, res) => {
  res.json(await updateSeries(req.params.seriesId, shiftFields(asBody(req.body))));
});

adminRouter.delete('/shift-series/:seriesId', async (req, res) => {
  res.json(await deleteSeries(req.params.seriesId, force(req.query.force)));
});

// ───────────────────────── volunteers ─────────────────────────

/** GET /api/admin/users?q=search */
adminRouter.get('/users', async (req, res) => {
  const q = typeof req.query.q === 'string' && req.query.q.trim() ? req.query.q.trim().slice(0, 80) : undefined;
  res.json({ users: await listVolunteers({ search: q }) });
});

/** PATCH /api/admin/users/:id  { hasDrivingChip?, certification?, isActive?, fullName? } */
adminRouter.patch('/users/:id', async (req, res) => {
  const b = asBody(req.body);
  res.json(
    await adminUpdateUser(req.user!.id, req.params.id, {
      hasDrivingChip: optBool(b, 'hasDrivingChip'),
      certification: optEnum(b, 'certification', CERTIFICATIONS),
      isActive: optBool(b, 'isActive'),
      fullName: optString(b, 'fullName', 80),
    }),
  );
});
