import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SHIFT_HOURS,
  checkShiftChange,
  computeStaffing,
  decideRegistration,
  expandRecurrence,
  formatInterval,
  pickPromotion,
  resolveHours,
  shiftWindow,
  weekStartOf,
  type RegistrationContext,
} from './registrationRules.ts';

const W = (t: keyof typeof DEFAULT_SHIFT_HOURS) => shiftWindow(DEFAULT_SHIFT_HOURS[t].startTime, DEFAULT_SHIFT_HOURS[t].endTime);
const EVENING = W('EVENING');
const NIGHT = W('NIGHT');
const at = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

const evening = {
  window: EVENING,
  requiredDrivers: 1,
  maxVolunteers: 3,
  date: '2026-11-10',
  status: 'OPEN' as const,
  published: true,
};

function ctx(o: Partial<RegistrationContext> = {}): RegistrationContext {
  return {
    user: { isActive: true, hasDrivingChip: false },
    shift: evening,
    requested: {},
    counts: { approvedTotal: 0, approvedDrivers: 0 },
    existingStatusOnShift: null,
    otherShiftDates: [],
    now: { date: '2026-11-06', minute: at('20:00') },
    ...o,
  };
}
const code = (d: ReturnType<typeof decideRegistration>) => (d.outcome === 'REJECTED' ? d.code : d.outcome);

test('station hours', () => {
  assert.deepEqual(formatInterval(W('MORNING')), { start: '06:00', end: '15:00' });
  assert.deepEqual(formatInterval(EVENING), { start: '14:30', end: '22:00' });
  assert.deepEqual(formatInterval(NIGHT), { start: '21:30', end: '07:00' });
});

test('partial hours: inside window ok, outside or reversed rejected, night after midnight ok', () => {
  assert.equal(resolveHours(EVENING, '16:00', '20:00').ok, true);
  assert.equal(resolveHours(EVENING, '13:00', '20:00').ok, false);
  assert.equal(resolveHours(EVENING, '20:00', '16:00').ok, false);
  assert.equal(resolveHours(NIGHT, '23:00', '03:00').ok, true);
  assert.equal(code(decideRegistration(ctx({ requested: { startTime: '12:00' } }))), 'INVALID_HOURS');
});

test('whole shift by default; partial hours accepted', () => {
  assert.deepEqual(decideRegistration(ctx()), { outcome: 'APPROVED', interval: EVENING });
  assert.equal(code(decideRegistration(ctx({ requested: { startTime: '16:00', endTime: '20:00' } }))), 'APPROVED');
});

test('capacity is absolute per shift, regardless of hours', () => {
  // max 2; A 16–20 and B 18–22 → full even though hours differ
  const d = decideRegistration(ctx({
    shift: { ...evening, maxVolunteers: 2 },
    counts: { approvedTotal: 2, approvedDrivers: 1 },
    requested: { startTime: '14:30', endTime: '16:00' },
  }));
  assert.equal(code(d), 'SHIFT_FULL');
});

test('driver priority: last seat without a driver waitlists a non-driver, approves a driver', () => {
  const counts = { approvedTotal: 2, approvedDrivers: 0 };
  assert.equal(code(decideRegistration(ctx({ counts }))), 'WAITLISTED');
  assert.equal(code(decideRegistration(ctx({ counts, user: { isActive: true, hasDrivingChip: true } }))), 'APPROVED');
  assert.equal(code(decideRegistration(ctx({ counts: { approvedTotal: 1, approvedDrivers: 0 } }))), 'APPROVED');
});

test('driver coverage: any approved driver, even partial, turns the shift green', () => {
  const s = computeStaffing(evening, { approvedTotal: 1, approvedDrivers: 1 });
  assert.equal(s.hasQualifiedDriver, true);
  assert.equal(s.badge, 'OPEN_FOR_ALL');
  assert.equal(computeStaffing(evening, { approvedTotal: 2, approvedDrivers: 0 }).badge, 'DRIVER_NEEDED');
  assert.equal(computeStaffing(evening, { approvedTotal: 3, approvedDrivers: 0 }).badge, 'FULL');
});

test('one shift per day', () => {
  assert.equal(code(decideRegistration(ctx({ otherShiftDates: ['2026-11-10'] }))), 'ONE_SHIFT_PER_DAY');
});

test('night shift then next-day morning is allowed (briefing overlap)', () => {
  const morning = { ...evening, date: '2026-11-11', window: W('MORNING') };
  assert.equal(code(decideRegistration(ctx({ shift: morning, otherShiftDates: ['2026-11-10'] }))), 'APPROVED');
});

test('unpublished shifts cannot be booked', () => {
  assert.equal(code(decideRegistration(ctx({ shift: { ...evening, published: false } }))), 'NOT_PUBLISHED');
});

test('past hours rejected; remaining hours of a running shift allowed', () => {
  const now = { date: '2026-11-10', minute: at('19:00') };
  assert.equal(code(decideRegistration(ctx({ now, requested: { endTime: '18:00' } }))), 'SHIFT_IN_PAST');
  assert.equal(code(decideRegistration(ctx({ now, requested: { startTime: '19:30' } }))), 'APPROVED');
});

test('duplicates, cancelled re-registration, paused users', () => {
  assert.equal(code(decideRegistration(ctx({ existingStatusOnShift: 'APPROVED' }))), 'ALREADY_REGISTERED');
  assert.equal(code(decideRegistration(ctx({ existingStatusOnShift: 'PENDING' }))), 'ALREADY_REGISTERED');
  assert.equal(code(decideRegistration(ctx({ existingStatusOnShift: 'CANCELLED' }))), 'APPROVED');
  assert.equal(code(decideRegistration(ctx({ user: { isActive: false, hasDrivingChip: true } }))), 'USER_INACTIVE');
});

test('promotion: reserved seat goes to the oldest driver; otherwise oldest first', () => {
  const a = { name: 'a', hasDrivingChip: false, createdAt: new Date(1) };
  const b = { name: 'b', hasDrivingChip: true, createdAt: new Date(2) };
  assert.equal(pickPromotion(evening, { approvedTotal: 2, approvedDrivers: 0 }, [a, b])?.name, 'b');
  assert.equal(pickPromotion(evening, { approvedTotal: 1, approvedDrivers: 1 }, [b, a])?.name, 'a');
  assert.equal(pickPromotion(evening, { approvedTotal: 2, approvedDrivers: 0 }, [a]), null);
});

test('shift change validation', () => {
  const regs = [
    { status: 'APPROVED' as const, startTime: '20:00', endTime: '22:00' },
    { status: 'APPROVED' as const, startTime: null, endTime: null },
  ];
  assert.equal(checkShiftChange({ ...evening, window: shiftWindow('14:30', '21:00') }, regs).ok, false);
  assert.equal(checkShiftChange({ ...evening, window: shiftWindow('14:00', '22:30') }, regs).ok, true);
  assert.equal(checkShiftChange({ ...evening, maxVolunteers: 1, requiredDrivers: 1 }, regs).ok, false);
  assert.equal(checkShiftChange({ ...evening, maxVolunteers: 2 }, regs).ok, true);
});

test('weeks start on Sunday; recurrence', () => {
  assert.equal(weekStartOf('2026-11-06'), '2026-11-01'); // Friday → previous Sunday
  assert.equal(weekStartOf('2026-11-08'), '2026-11-08'); // Sunday
  assert.equal(expandRecurrence('2026-11-08', '2026-11-21', [0, 1, 2, 3, 4]).length, 10);
});

// ── Level B / Level C: opening an additional patrol car ──

const levelC = { isActive: true, hasDrivingChip: false, certification: 'LEVEL_C' as const };
const levelB = { isActive: true, hasDrivingChip: false, certification: 'LEVEL_B' as const };

test('Level B/C who OPEN a patrol car join a FULL shift (bypass maxVolunteers)', () => {
  const counts = { approvedTotal: 3, approvedDrivers: 1 };
  for (const user of [levelB, levelC]) {
    assert.equal(code(decideRegistration(ctx({ counts, user, requested: { opensNewCar: true } }))), 'APPROVED');
  }
});

test('Level B/C who do NOT open a car count toward capacity like everyone else', () => {
  assert.equal(code(decideRegistration(ctx({ counts: { approvedTotal: 3, approvedDrivers: 1 }, user: levelC }))), 'SHIFT_FULL');
  assert.equal(code(decideRegistration(ctx({ counts: { approvedTotal: 2, approvedDrivers: 0 }, user: levelB }))), 'WAITLISTED');
  assert.equal(code(decideRegistration(ctx({ user: levelC }))), 'APPROVED');
});

test('opening a car skips the driver reservation', () => {
  assert.equal(code(decideRegistration(ctx({ counts: { approvedTotal: 2, approvedDrivers: 0 }, user: levelB, requested: { opensNewCar: true } }))), 'APPROVED');
});

test('only Level B/C may open a car', () => {
  for (const certification of ['NONE', 'LEVEL_A'] as const) {
    const user = { isActive: true, hasDrivingChip: true, certification };
    assert.equal(code(decideRegistration(ctx({ user, requested: { opensNewCar: true } }))), 'NOT_QUALIFIED_FOR_CAR');
  }
});

test('opening a car still follows the other rules', () => {
  const requested = { opensNewCar: true };
  assert.equal(code(decideRegistration(ctx({ user: levelC, requested, otherShiftDates: ['2026-11-10'] }))), 'ONE_SHIFT_PER_DAY');
  assert.equal(code(decideRegistration(ctx({ user: levelC, requested, shift: { ...evening, published: false } }))), 'NOT_PUBLISHED');
  assert.equal(code(decideRegistration(ctx({ user: levelC, requested, shift: { ...evening, status: 'COMPLETED' } }))), 'SHIFT_NOT_OPEN');
  assert.equal(code(decideRegistration(ctx({ user: levelC, requested, existingStatusOnShift: 'APPROVED' }))), 'ALREADY_REGISTERED');
  assert.equal(code(decideRegistration(ctx({ user: { ...levelC, isActive: false }, requested }))), 'USER_INACTIVE');
});

test('a waitlisted registration that opens a car is promoted even when the shift is full', () => {
  const a = { name: 'a', hasDrivingChip: false, createdAt: new Date(1) };
  const c = { name: 'c', hasDrivingChip: false, createdAt: new Date(5), opensNewCar: true };
  assert.equal(pickPromotion(evening, { approvedTotal: 3, approvedDrivers: 1 }, [a, c])?.name, 'c');
});

test('registrations that open a car do not block editing the shift', () => {
  const regs = [
    { status: 'APPROVED' as const, startTime: null, endTime: null },
    { status: 'APPROVED' as const, startTime: null, endTime: null },
    { status: 'APPROVED' as const, startTime: null, endTime: null },
    { status: 'APPROVED' as const, startTime: null, endTime: null, opensNewCar: true },
  ];
  assert.equal(checkShiftChange({ ...evening, maxVolunteers: 3 }, regs).ok, true);
  assert.equal(checkShiftChange({ ...evening, maxVolunteers: 2 }, regs).ok, false);
});

test('Level A follows the normal rules (no capacity bypass)', () => {
  const user = { isActive: true, hasDrivingChip: false, certification: 'LEVEL_A' as const };
  assert.equal(code(decideRegistration(ctx({ user, counts: { approvedTotal: 3, approvedDrivers: 1 } }))), 'SHIFT_FULL');
  assert.equal(code(decideRegistration(ctx({ user, counts: { approvedTotal: 2, approvedDrivers: 0 } }))), 'WAITLISTED');
  assert.equal(code(decideRegistration(ctx({ user }))), 'APPROVED');
});
