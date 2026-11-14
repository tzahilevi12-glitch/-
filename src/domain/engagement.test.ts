import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isUrgentShift, monthRange, rankVolunteers } from './engagement.ts';

test('urgent: starts within 48 hours, not started, has open regular slots', () => {
  assert.equal(isUrgentShift(60, 2), true);
  assert.equal(isUrgentShift(48 * 60, 1), true);
  assert.equal(isUrgentShift(48 * 60 + 1, 3), false); // too far
  assert.equal(isUrgentShift(0, 3), false); // already started
  assert.equal(isUrgentShift(-30, 3), false);
  assert.equal(isUrgentShift(300, 0), false); // full
});

test('month range', () => {
  assert.deepEqual(monthRange('2026-11-14'), { from: '2026-11-01', to: '2026-12-01', month: '2026-11' });
  assert.deepEqual(monthRange('2026-12-31'), { from: '2026-12-01', to: '2027-01-01', month: '2026-12' });
});

test('leaderboard: hours first, then number of shifts, top 3', () => {
  const p = (fullName: string) => ({ fullName });
  const top = rankVolunteers([
    { userId: 'a', person: p('אבי'), minutes: 540 },
    { userId: 'a', person: p('אבי'), minutes: 450 }, // אבי 16.5h, 2 shifts
    { userId: 'b', person: p('בתיה'), minutes: 990 }, // 16.5h, 1 shift
    { userId: 'c', person: p('גלעד'), minutes: 540 },
    { userId: 'd', person: p('דנה'), minutes: 1200 },
    { userId: 'e', person: p('הדר'), minutes: 180 },
  ]);
  assert.deepEqual(top.map((t) => [t.rank, t.person.fullName, t.minutes, t.shifts]), [
    [1, 'דנה', 1200, 1],
    [2, 'אבי', 990, 2], // same hours as בתיה, more shifts
    [3, 'בתיה', 990, 1],
  ]);
  assert.deepEqual(rankVolunteers([]), []);
});
