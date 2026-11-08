/**
 * Pure business rules for shifts and registrations.
 * No database or framework imports: unit-tested in isolation and shared by the
 * API (decisions) and the UI (badges, red/green alerts).
 *
 * Time model: minutes from 00:00 of the shift's start date. A shift that crosses
 * midnight has end > 1440 (NIGHT 21:30–07:00 = 1290–1860).
 */

export type ShiftType = 'MORNING' | 'EVENING' | 'NIGHT';
export type ShiftStatus = 'OPEN' | 'FILLED' | 'COMPLETED';
export type RegistrationStatus = 'APPROVED' | 'PENDING' | 'CANCELLED';

/**
 * Volunteer qualification: standard volunteer (מתנדב אק״מ), Level A, Level B or Level C.
 * Only Level B (שלב ב') and Level C (שלב ג') may open an additional patrol car. They choose it
 * per sign-up ("מעוניין לפתוח ניידת"): a registration that opens a car can join ANY shift
 * regardless of maxVolunteers, and its place is extra (doesn't use a regular seat).
 * Without that choice they count toward the shift's capacity like everyone else.
 */
export const CERTIFICATIONS = ['NONE', 'LEVEL_A', 'LEVEL_B', 'LEVEL_C'] as const;
export type Certification = (typeof CERTIFICATIONS)[number];

/** Whether this qualification is allowed to open an additional patrol car. */
export function canOpenPatrolCar(c: Certification | null | undefined): boolean {
  return c === 'LEVEL_B' || c === 'LEVEL_C';
}

export const MINUTES_PER_DAY = 1440;

/** Station default hours. NIGHT→MORNING overlap (06:00–07:00) is the handover briefing. */
export const DEFAULT_SHIFT_HOURS: Record<ShiftType, { startTime: string; endTime: string }> = {
  MORNING: { startTime: '06:00', endTime: '15:00' },
  EVENING: { startTime: '14:30', endTime: '22:00' },
  NIGHT: { startTime: '21:30', endTime: '07:00' },
};

export interface Interval {
  start: number;
  end: number;
}

// ───────────────────────── time helpers ─────────────────────────

export function parseHHMM(s: unknown): number | null {
  if (typeof s !== 'string') return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function formatHHMM(minutes: number): string {
  const m = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** "14:30–22:00" wrapped in Unicode LTR isolates so it reads correctly inside Hebrew (RTL) text. */
export function ltrRange(start: string, end: string): string {
  return `\u2066${start}–${end}\u2069`;
}

export function formatInterval(i: Interval): { start: string; end: string } {
  return { start: formatHHMM(i.start), end: formatHHMM(i.end) };
}

/** Shift hours → interval. end <= start means the shift ends the next day. */
export function shiftWindow(startTime: string, endTime: string): Interval {
  const s = parseHHMM(startTime);
  const e = parseHHMM(endTime);
  if (s === null || e === null) throw new Error(`Invalid shift hours ${startTime}–${endTime}`);
  return { start: s, end: e <= s ? e + MINUTES_PER_DAY : e };
}

export type HoursResult = { ok: true; interval: Interval } | { ok: false; message: string };

/**
 * Resolve a volunteer's requested hours inside the shift window. Either time may be
 * omitted (defaults to the shift's start/end). Clock times earlier than the shift
 * start are read as the next day, so "02:00" inside a NIGHT shift works.
 */
export function resolveHours(window: Interval, startTime?: string | null, endTime?: string | null): HoursResult {
  const toShiftMinutes = (t: number) => (t < window.start ? t + MINUTES_PER_DAY : t);
  let start = window.start;
  let end = window.end;
  if (startTime != null) {
    const p = parseHHMM(startTime);
    if (p === null) return { ok: false, message: 'שעת ההתחלה צריכה להיות בפורמט HH:MM.' };
    start = toShiftMinutes(p);
  }
  if (endTime != null) {
    const p = parseHHMM(endTime);
    if (p === null) return { ok: false, message: 'שעת הסיום צריכה להיות בפורמט HH:MM.' };
    end = toShiftMinutes(p);
  }
  if (start < window.start || end > window.end || start >= end) {
    const w = formatInterval(window);
    return { ok: false, message: `יש לבחור שעות בתוך המשמרת (${ltrRange(w.start, w.end)}), ושעת ההתחלה לפני שעת הסיום.` };
  }
  return { ok: true, interval: { start, end } };
}

export function isWholeShift(i: Interval, window: Interval): boolean {
  return i.start === window.start && i.end === window.end;
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function absoluteMinute(isoDate: string, minute: number): number {
  return (Date.parse(`${isoDate}T00:00:00Z`) / 86_400_000) * MINUTES_PER_DAY + minute;
}

/** First day of the week containing `isoDate` (weekStartDay 0 = Sunday, the Israeli work week). */
export function weekStartOf(isoDate: string, weekStartDay = 0): string {
  const dow = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return addDays(isoDate, -((dow - weekStartDay + 7) % 7));
}

// ───────────────────────── staffing ─────────────────────────

export interface ShiftCapacity {
  requiredDrivers: number;
  maxVolunteers: number; // absolute per shift, regardless of hours
}

export interface SeatCounts {
  approvedTotal: number; // approved volunteers holding a REGULAR seat (Level B/C not included)
  approvedDrivers: number; // any approved driver counts, even for part of the shift (Level B/C included)
  approvedExtra?: number; // approved registrations that open an additional patrol car (outside maxVolunteers)
}

export interface Staffing extends SeatCounts {
  seatsLeft: number;
  driversMissing: number;
  hasQualifiedDriver: boolean; // commander: GREEN when true, RED otherwise
  isFull: boolean;
  /** Every remaining seat must go to a driver, or the shift can't meet its driver requirement. */
  remainingSeatsReservedForDrivers: boolean;
  badge: 'DRIVER_NEEDED' | 'OPEN_FOR_ALL' | 'FULL';
}

export function computeStaffing(cap: ShiftCapacity, counts: SeatCounts): Staffing {
  const seatsLeft = Math.max(0, cap.maxVolunteers - counts.approvedTotal);
  const driversMissing = Math.max(0, cap.requiredDrivers - counts.approvedDrivers);
  const isFull = seatsLeft === 0;
  return {
    ...counts,
    seatsLeft,
    driversMissing,
    hasQualifiedDriver: driversMissing === 0,
    isFull,
    remainingSeatsReservedForDrivers: !isFull && driversMissing > 0 && seatsLeft <= driversMissing,
    badge: isFull ? 'FULL' : driversMissing > 0 ? 'DRIVER_NEEDED' : 'OPEN_FOR_ALL',
  };
}

// ───────────────────────── registration decision ─────────────────────────

export type RejectionCode =
  | 'USER_INACTIVE'
  | 'NOT_PUBLISHED'
  | 'INVALID_HOURS'
  | 'SHIFT_NOT_OPEN'
  | 'SHIFT_IN_PAST'
  | 'SHIFT_FULL'
  | 'ALREADY_REGISTERED'
  | 'ONE_SHIFT_PER_DAY'
  | 'NOT_QUALIFIED_FOR_CAR';

export type RegistrationDecision =
  | { outcome: 'APPROVED'; interval: Interval }
  | { outcome: 'WAITLISTED'; interval: Interval }
  | { outcome: 'REJECTED'; code: RejectionCode; message: string };

export interface RegistrationContext {
  /** Driving chip and qualification come from the volunteer's profile at the moment they book. */
  user: { isActive: boolean; hasDrivingChip: boolean; certification?: Certification };
  shift: ShiftCapacity & { date: string; status: ShiftStatus; published: boolean; window: Interval };
  /** opensNewCar: a Level B/C volunteer opens an additional patrol car for this shift. */
  requested: { startTime?: string | null; endTime?: string | null; opensNewCar?: boolean };
  counts: SeatCounts;
  existingStatusOnShift: RegistrationStatus | null;
  /** Start dates of the user's other APPROVED/PENDING shifts. */
  otherShiftDates: string[];
  now: { date: string; minute: number }; // station local time
}

export function decideRegistration(ctx: RegistrationContext): RegistrationDecision {
  const { user, shift } = ctx;

  if (!user.isActive) return reject('USER_INACTIVE', 'החשבון שלך הושהה. יש לפנות למזין המשמרות.');
  if (ctx.existingStatusOnShift === 'APPROVED' || ctx.existingStatusOnShift === 'PENDING') {
    return reject('ALREADY_REGISTERED', 'כבר נרשמת למשמרת הזו.');
  }
  if (!shift.published) return reject('NOT_PUBLISHED', 'המשמרת עדיין לא פורסמה.');

  const hours = resolveHours(shift.window, ctx.requested.startTime, ctx.requested.endTime);
  if (!hours.ok) return reject('INVALID_HOURS', hours.message);
  const interval = hours.interval;

  if (absoluteMinute(shift.date, interval.end) <= absoluteMinute(ctx.now.date, ctx.now.minute)) {
    return reject('SHIFT_IN_PAST', 'השעות האלה כבר עברו.');
  }
  if (shift.status === 'COMPLETED') return reject('SHIFT_NOT_OPEN', 'המשמרת סגורה.');

  // One shift per calendar day (by start date). A NIGHT shift and the next day's
  // MORNING shift are different days, so the 06:00–07:00 briefing overlap is allowed.
  if (ctx.otherShiftDates.includes(shift.date)) {
    return reject('ONE_SHIFT_PER_DAY', 'כבר יש לך משמרת ביום הזה. אפשר להירשם למשמרת אחת ביום.');
  }

  // Opening an additional patrol car (Level B/C only): capacity and driver reservation don't apply.
  if (ctx.requested.opensNewCar) {
    if (!canOpenPatrolCar(user.certification)) {
      return reject('NOT_QUALIFIED_FOR_CAR', "פתיחת ניידת נוספת מותרת רק למוסמכי שלב ב' או שלב ג'.");
    }
    return { outcome: 'APPROVED', interval };
  }

  const staffing = computeStaffing(shift, ctx.counts);
  if (staffing.isFull) return reject('SHIFT_FULL', 'המשמרת מלאה.');
  if (staffing.remainingSeatsReservedForDrivers && !user.hasDrivingChip) return { outcome: 'WAITLISTED', interval };
  return { outcome: 'APPROVED', interval };
}

export function nextShiftStatus(current: ShiftStatus, staffing: Staffing): ShiftStatus {
  if (current === 'COMPLETED') return current;
  return staffing.isFull ? 'FILLED' : 'OPEN';
}

/**
 * After a seat frees up, pick which waitlisted volunteer (oldest first) may be
 * promoted, respecting the driver reservation. A registration that opens a patrol car
 * is promoted regardless of seats. Returns null if nobody qualifies.
 */
export function pickPromotion<T extends { hasDrivingChip: boolean; createdAt: Date; opensNewCar?: boolean }>(
  cap: ShiftCapacity,
  counts: SeatCounts,
  waitlist: T[],
): T | null {
  const ordered = [...waitlist].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const newCar = ordered.find((w) => w.opensNewCar);
  if (newCar) return newCar;
  const staffing = computeStaffing(cap, counts);
  if (staffing.isFull) return null;
  if (staffing.remainingSeatsReservedForDrivers) return ordered.find((w) => w.hasDrivingChip) ?? null;
  return ordered[0] ?? null;
}

// ───────────────────────── shift edits ─────────────────────────

export interface ActiveRegistration {
  status: 'APPROVED' | 'PENDING';
  startTime: string | null;
  endTime: string | null;
  opensNewCar?: boolean;
}

/** Validate a commander's change to hours/capacity against existing sign-ups. */
export function checkShiftChange(
  next: ShiftCapacity & { window: Interval },
  regs: ActiveRegistration[],
): { ok: true } | { ok: false; message: string } {
  if (next.maxVolunteers < 1) return { ok: false, message: 'מספר המתנדבים חייב להיות לפחות 1.' };
  if (next.requiredDrivers < 0 || next.requiredDrivers > next.maxVolunteers) {
    return { ok: false, message: 'מספר הנהגים הדרושים צריך להיות בין 0 למספר המתנדבים.' };
  }
  for (const r of regs) {
    if (!resolveHours(next.window, r.startTime, r.endTime).ok) {
      return { ok: false, message: `מתנדב רשום לשעות ${ltrRange(r.startTime ?? '', r.endTime ?? '')}, מחוץ לשעות החדשות.` };
    }
  }
  // Volunteers who opened an additional patrol car are extra and don't count against the maximum.
  const approved = regs.filter((r) => r.status === 'APPROVED' && !r.opensNewCar).length;
  if (approved > next.maxVolunteers) {
    return { ok: false, message: `רשומים ${approved} מתנדבים. יש להסיר חלק מהם לפני הקטנת המספר.` };
  }
  return { ok: true };
}

/** Dates in [from, to] whose weekday (0 = Sunday … 6 = Saturday) is in daysOfWeek. */
export function expandRecurrence(from: string, to: string, daysOfWeek: number[]): string[] {
  const days = new Set(daysOfWeek);
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (days.has(new Date(`${d}T00:00:00Z`).getUTCDay())) out.push(d);
  }
  return out;
}

function reject(code: RejectionCode, message: string): RegistrationDecision {
  return { outcome: 'REJECTED', code, message };
}

// ── Cancellation window ─────────────────────────────────────────────────────

/** A volunteer may cancel freely while MORE than this is left before their hours start. */
export const FREE_CANCEL_MINUTES = 12 * 60;

/** Minutes from `now` (station time) until the volunteer's own start (minute of the shift's day; may be > 1440). */
export function minutesUntilStart(date: string, startMinute: number, now: { date: string; minute: number }): number {
  return absoluteMinute(date, startMinute) - absoluteMinute(now.date, now.minute);
}

/** Minutes left in which the volunteer can still cancel without approval (0 when the window has closed). */
export function freeCancelMinutesLeft(minutesToStart: number): number {
  return Math.max(0, minutesToStart - FREE_CANCEL_MINUTES);
}

/**
 * How a volunteer may cancel their own registration.
 * - FREE: more than 12 hours before their hours start, or a waitlist entry (it holds no seat).
 * - NEEDS_APPROVAL: a confirmed seat 12 hours or less before the start; the cancel becomes a request
 *   to the commander and the seat stays taken until approved.
 */
export function volunteerCancelMode(reg: { status: string; minutesToStart: number }): 'FREE' | 'NEEDS_APPROVAL' {
  if (reg.status === 'PENDING') return 'FREE';
  return reg.minutesToStart > FREE_CANCEL_MINUTES ? 'FREE' : 'NEEDS_APPROVAL';
}
