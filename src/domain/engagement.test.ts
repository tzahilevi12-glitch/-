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

test('leaderboard: most shifts first, hours break ties, top 10', () => {
  const p = (fullName: string) => ({ fullName });
  const e = (userId: string, name: string, minutes: number) => ({ userId, person: p(name), minutes });
  const top = rankVolunteers([
    e('a', 'אבי', 540), e('a', 'אבי', 450), e('a', 'אבי', 300), // 3 shifts, 21.5h
    e('b', 'בתיה', 990), e('b', 'בתיה', 570), // 2 shifts, 26h
    e('c', 'גלעד', 540), e('c', 'גלעד', 540), // 2 shifts, 18h
    e('d', 'דנה', 1200), // 1 shift
  ]);
  assert.deepEqual(top.map((t) => [t.rank, t.person.fullName, t.shifts]), [
    [1, 'אבי', 3],
    [2, 'בתיה', 2], // same count as גלעד, more hours
    [3, 'גלעד', 2],
    [4, 'דנה', 1],
  ]);
  const many = Array.from({ length: 14 }, (_, i) => e(`u${i}`, `מתנדב ${i}`, 300 + i));
  assert.equal(rankVolunteers(many).length, 10);
  assert.equal(rankVolunteers(many, 3).length, 3); // the board shows the top 3
  assert.deepEqual(rankVolunteers([]), []);
});

test('month boundary: November counts reset on December 1st', () => {
  assert.deepEqual(monthRange('2026-11-30'), { from: '2026-11-01', to: '2026-12-01', month: '2026-11' });
  assert.deepEqual(monthRange('2026-12-01'), { from: '2026-12-01', to: '2027-01-01', month: '2026-12' });
});
