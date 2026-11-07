import { Router } from 'express';
import { prisma } from '../lib/prisma.ts';
import { ApiError } from '../lib/errors.ts';
import { fromIsoDate, nowInStation, toIsoDate } from '../lib/dates.ts';
import { asBody, optBool, optEnum, optHHMM, optString } from '../lib/validate.ts';
import { absoluteMinute, addDays, bypassesCapacity, computeStaffing, formatInterval, type Certification } from '../domain/registrationRules.ts';
import { cancelRegistration, registerForShift } from '../services/registrationService.ts';
import { endSession } from '../services/sessionService.ts';
import { countSeats, registrationInterval, shiftHeader, staffingView, windowOf } from '../services/shiftState.ts';
import { markAnnouncementsSeen, unseenAnnouncements, updateMyProfile } from '../services/userService.ts';

export const shiftsRouter = Router();

const hours = (f: { start: string; end: string }) => ({ startTime: f.start, endTime: f.end });

/**
 * GET /api/shifts — volunteer shift board.
 * Published OPEN shifts that haven't ended, with a badge (DRIVER_NEEDED / OPEN_FOR_ALL),
 * seats left, and whether the caller already has a shift that day.
 * Level B/C volunteers also see FULL shifts, since they can join any shift.
 */
shiftsRouter.get('/', async (req, res) => {
  const now = nowInStation();
  const nowAbs = absoluteMinute(now.date, now.minute);
  const userId = req.user!.id;
  const certified = bypassesCapacity(req.user!.certification as Certification);

  const [shifts, mine] = await Promise.all([
    prisma.shift.findMany({
      where: { publishedAt: { not: null }, status: certified ? { in: ['OPEN', 'FILLED'] } : 'OPEN', date: { gte: fromIsoDate(addDays(now.date, -1)) } },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      include: {
        registrations: {
          where: { status: { in: ['APPROVED', 'PENDING'] } },
          include: { user: { select: { hasDrivingChip: true, certification: true } } },
        },
      },
    }),
    prisma.shiftRegistration.findMany({
      where: { userId, status: { in: ['APPROVED', 'PENDING'] }, shift: { date: { gte: fromIsoDate(addDays(now.date, -1)) } } },
      select: { shift: { select: { date: true } } },
    }),
  ]);
  const myDates = new Set(mine.map((r) => toIsoDate(r.shift.date)));

  res.json({
    shifts: shifts
      .filter((s) => absoluteMinute(toIsoDate(s.date), windowOf(s).end) > nowAbs)
      .map(({ registrations, ...shift }) => {
        const own = registrations.find((r) => r.userId === userId);
        return {
          ...shiftHeader(shift),
          ...staffingView(computeStaffing(shift, countSeats(registrations))),
          myRegistration: own
            ? { id: own.id, status: own.status, ...hours(formatInterval(registrationInterval(windowOf(shift), own))) }
            : null,
          iHaveShiftThatDay: myDates.has(toIsoDate(shift.date)),
        };
      }),
  });
});

/**
 * POST /api/shifts/:shiftId/registrations   body (optional): { "startTime": "16:00", "endTime": "20:00" }
 * 201 = on the shift, 202 = waitlisted.
 */
shiftsRouter.post('/:shiftId/registrations', async (req, res) => {
  const body = asBody(req.body);
  const result = await registerForShift(req.user!.id, req.params.shiftId, {
    startTime: optHHMM(body, 'startTime'),
    endTime: optHHMM(body, 'endTime'),
  });
  res.status(result.waitlisted ? 202 : 201).json({
    registration: { id: result.registration.id, shiftId: result.registration.shiftId, status: result.registration.status, ...result.hours },
    message: result.message,
    shift: staffingView(result.staffing),
  });
});

/**
 * DELETE /api/shifts/:shiftId/registrations/me
 * Always notifies the shift scheduler with a popup in the dashboard (alertSent: true).
 */
shiftsRouter.delete('/:shiftId/registrations/me', async (req, res) => {
  const { registration, staffing, alertSent } = await cancelRegistration({
    shiftId: req.params.shiftId,
    userId: req.user!.id,
    actorIsAdmin: false,
  });
  res.json({ registration: { id: registration.id, status: registration.status }, alertSent, shift: staffingView(staffing) });
});

export const meRouter = Router();

/** GET /api/me — profile. */
meRouter.get('/', async (req, res) => {
  res.json(req.user);
});

/** PATCH /api/me  { fullName?, hasDrivingChip?, certification? } */
meRouter.patch('/', async (req, res) => {
  const b = asBody(req.body);
  const fullName = optString(b, 'fullName', 80)?.replace(/\s+/g, ' ');
  if (fullName !== undefined && fullName.length < 2) throw new ApiError(400, 'VALIDATION', 'יש להזין שם מלא.');
  res.json(
    await updateMyProfile(req.user!.id, {
      fullName,
      hasDrivingChip: optBool(b, 'hasDrivingChip'),
      certification: optEnum(b, 'certification', ['NONE', 'LEVEL_B', 'LEVEL_C'] as const),
    }),
  );
});

/** POST /api/me/logout */
meRouter.post('/logout', async (req, res) => {
  if (req.sessionTokenHash) await endSession(req.sessionTokenHash);
  res.status(204).end();
});

/** GET /api/me/shifts — dashboard: my upcoming shifts (on the shift + waitlisted). */
meRouter.get('/shifts', async (req, res) => {
  const now = nowInStation();
  const nowAbs = absoluteMinute(now.date, now.minute);
  const regs = await prisma.shiftRegistration.findMany({
    where: {
      userId: req.user!.id,
      status: { in: ['APPROVED', 'PENDING'] },
      shift: { date: { gte: fromIsoDate(addDays(now.date, -1)) }, status: { not: 'COMPLETED' } },
    },
    include: { shift: true },
    orderBy: [{ shift: { date: 'asc' } }, { shift: { startTime: 'asc' } }],
  });
  const view = regs
    .map((r) => {
      const window = windowOf(r.shift);
      const interval = registrationInterval(window, r);
      return {
        registrationId: r.id,
        shiftId: r.shiftId,
        status: r.status,
        date: toIsoDate(r.shift.date),
        shiftType: r.shift.shiftType,
        shiftStartTime: formatInterval(window).start,
        shiftEndTime: formatInterval(window).end,
        ...hours(formatInterval(interval)),
        isPartial: interval.start !== window.start || interval.end !== window.end,
        endsAt: absoluteMinute(toIsoDate(r.shift.date), interval.end),
      };
    })
    .filter((r) => r.endsAt > nowAbs)
    .map(({ endsAt: _endsAt, ...r }) => r);
  res.json({
    approved: view.filter((r) => r.status === 'APPROVED'),
    waitlisted: view.filter((r) => r.status === 'PENDING'),
  });
});

/** GET /api/me/notifications — "new shifts published" popups not yet dismissed. */
meRouter.get('/notifications', async (req, res) => {
  res.json({ notifications: await unseenAnnouncements(req.user!.id) });
});

/** POST /api/me/notifications/seen — dismiss the popup. */
meRouter.post('/notifications/seen', async (req, res) => {
  await markAnnouncementsSeen(req.user!.id);
  res.status(204).end();
});
