import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysBetween, formatShortageSummary, isDigestDue, missingLabel, shiftLink, summaryDayLabel } from './shortageSummary.ts';

test('summary: exact WhatsApp format with a direct link per shift, sorted, full shifts dropped', () => {
  const text = formatShortageSummary(
    [
      { shiftId: 's3', date: '2026-11-17', shiftType: 'EVENING', startMinute: 870, missing: 1, needsDriver: false },
      { shiftId: 's2', date: '2026-11-15', shiftType: 'NIGHT', startMinute: 1290, missing: 1, needsDriver: false },
      { shiftId: 's1', date: '2026-11-15', shiftType: 'MORNING', startMinute: 360, missing: 2, needsDriver: true },
      { shiftId: 's4', date: '2026-11-16', shiftType: 'MORNING', startMinute: 360, missing: 0, needsDriver: true }, // full → dropped
    ],
    { appUrl: 'https://example.onrender.com/' },
  );
  assert.equal(
    text,
    [
      '🚔 *ריכוז חוסרים במשמרות לשבוע הקרוב:*',
      '',
      '📅 *יום ראשון (15/11):*',
      '• משמרת בוקר (חסרים 2, דרוש נהג 🚗): להרשמה מהירה לחץ כאן -> https://example.onrender.com/?shiftId=s1',
      '• משמרת לילה (חסר 1): להרשמה מהירה לחץ כאן -> https://example.onrender.com/?shiftId=s2',
      '',
      '📅 *יום שלישי (17/11):*',
      '• משמרת צהריים (חסר 1): להרשמה מהירה לחץ כאן -> https://example.onrender.com/?shiftId=s3',
    ].join('\n'),
  );
});

test('summary: without a site address, plain lines; no shortages', () => {
  const t = formatShortageSummary([{ shiftId: 'x', date: '2026-11-18', shiftType: 'MORNING', startMinute: 360, missing: 3, needsDriver: true }]);
  assert.match(t, /• משמרת בוקר: חסרים 3 מתנדבים \(דרוש נהג 🚗\)/);
  assert.doesNotMatch(t, /shiftId|להרשמה/);
  const none = formatShortageSummary([], { appUrl: 'https://x/' });
  assert.match(none, /✅ כל המשמרות לשבוע הקרוב מאוישות/);
  assert.match(none, /להרשמה מהירה לחצו כאן: https:\/\/x\//);
  assert.equal(shiftLink('https://a.b/', 'id 1'), 'https://a.b/?shiftId=id%201');
});

test('labels', () => {
  assert.equal(missingLabel(1), 'חסר מתנדב 1');
  assert.equal(missingLabel(4), 'חסרים 4 מתנדבים');
  assert.equal(summaryDayLabel('2026-11-15'), 'יום ראשון (15/11)');
  assert.equal(summaryDayLabel('2026-11-21'), 'יום שבת (21/11)');
});

test('schedule: every 2 days, from 10:00, never at night', () => {
  const o = { hour: 10, everyDays: 2 };
  assert.equal(isDigestDue(null, { date: '2026-11-14', minute: 9 * 60 + 59 }, o), false);
  assert.equal(isDigestDue(null, { date: '2026-11-14', minute: 10 * 60 }, o), true);
  assert.equal(isDigestDue('2026-11-14', { date: '2026-11-15', minute: 10 * 60 }, o), false); // 1 day later
  assert.equal(isDigestDue('2026-11-14', { date: '2026-11-16', minute: 10 * 60 + 5 }, o), true); // 2 days later
  assert.equal(isDigestDue('2026-11-14', { date: '2026-11-16', minute: 16 * 60 }, o), true); // server woke late
  assert.equal(isDigestDue('2026-11-14', { date: '2026-11-16', minute: 21 * 60 }, o), false); // too late in the day
  assert.equal(isDigestDue('2026-11-14', { date: '2026-11-19', minute: 11 * 60 }, o), true); // missed days
  assert.equal(daysBetween('2026-11-30', '2026-12-02'), 2);
});
