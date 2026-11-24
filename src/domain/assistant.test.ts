import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ASSISTANT_SUGGESTIONS,
  answerAvailable,
  answerFallback,
  answerLeaders,
  answerMine,
  answerRules,
  answerShortages,
  detectIntent,
  detectRange,
  detectRulesTopic,
  normalizeQuestion,
  type AssistantShift,
} from './assistant.ts';

const plain = (s: string) => s.replace(/[\u2060\u2066-\u2069]/g, '');

test('the four suggestion chips map to their intents', () => {
  assert.deepEqual(
    ASSISTANT_SUGGESTIONS.map(detectIntent),
    ['shortages', 'available', 'leaders', 'rules'],
  );
});

test('free-text Hebrew questions', () => {
  const cases: [string, string][] = [
    ['המשמרות שלי', 'mine'],
    ['כמה משמרות עשיתי החודש?', 'mine'],
    ['מתי יש לי משמרת?', 'mine'],
    ['מה פנוי ביום שלישי?', 'available'], // "שלישי" is not "שלי"
    ['יש בכלל משמרות פנויות מחר?', 'available'],
    ['איפה אפשר להשתבץ?', 'available'],
    ['מה דחוף?', 'shortages'],
    ['איפה צריך נהגים?', 'shortages'],
    ['איך מבטלים משמרת?', 'rules'],
    ['מה זה משמרת מקוצרת', 'rules'],
    ['מי יכול לפתוח ניידת נוספת?', 'rules'],
    ['מה ההבדל בין שלב א לשלב ג', 'rules'],
    ['מי מוביל החודש?', 'leaders'],
    ['שלום', 'greeting'],
    ['תודה רבה!', 'greeting'],
    ['', 'greeting'],
    ['מה מזג האוויר?', 'fallback'],
  ];
  for (const [q, intent] of cases) assert.equal(detectIntent(q), intent, q);
});

test('normalization drops niqqud, quotes and emoji', () => {
  assert.equal(normalizeQuestion('🤖 עוזרת חמ״ל — אק"מ?'), 'עוזרת חמל אקמ');
});

test('rules topic', () => {
  assert.equal(detectRulesTopic('איך מבטלים?'), 'cancel');
  assert.equal(detectRulesTopic('מה זו משמרת מקוצרת'), 'short');
  assert.equal(detectRulesTopic('ניידת נוספת'), 'car');
  assert.equal(detectRulesTopic('מה חוקי הרישום והביטול?'), 'cancel');
  assert.equal(detectRulesTopic('חוקים'), 'all');
  assert.match(answerRules('all').answer, /12 שעות/);
  assert.match(answerRules('all').answer, /מינימום 3 שעות/);
  assert.match(answerRules('short').answer, /פחות מ-5 שעות/);
});

test('date range: this week, today, tomorrow, next week', () => {
  assert.deepEqual(
    { from: detectRange('מה פנוי השבוע', '2026-11-24').from, to: detectRange('מה פנוי השבוע', '2026-11-24').to },
    { from: '2026-11-24', to: '2026-11-30' },
  );
  assert.equal(detectRange('מה פנוי היום?', '2026-11-24').to, '2026-11-24');
  assert.equal(detectRange('ומחר?', '2026-11-24').from, '2026-11-25');
  assert.equal(detectRange('בשבוע הבא', '2026-11-24').from, '2026-12-01');
});

const shift = (o: Partial<AssistantShift>): AssistantShift => ({
  id: 's', date: '2026-11-25', shiftType: 'MORNING', startTime: '06:00', endTime: '15:00',
  maxVolunteers: 3, seatsLeft: 0, needsDriver: false, driverOnly: false, urgent: false, ...o,
});
const week = detectRange('השבוע', '2026-11-24');

test('shortages list missing drivers and open places, with sign-up actions', () => {
  const a = answerShortages(
    [
      shift({ id: 'a', needsDriver: true, seatsLeft: 2, urgent: true }),
      shift({ id: 'b', date: '2026-11-26', shiftType: 'NIGHT', startTime: '21:30', endTime: '07:00', seatsLeft: 1 }),
      shift({ id: 'c', date: '2026-12-09', seatsLeft: 3 }), // outside the week
    ],
    week,
  );
  const text = plain(a.answer);
  assert.match(text, /חסר נהג \(1\)/);
  assert.match(text, /יום רביעי \(25\/11\) \| משמרת בוקר 06:00–15:00 ⏰ דחוף/);
  assert.match(text, /מקומות פתוחים \(3 בסך הכול\)/);
  assert.match(text, /משמרת לילה 21:30–07:00 – חסר מתנדב 1/);
  assert.doesNotMatch(text, /9\/12/);
  assert.deepEqual(a.actions!.map((x) => x.shiftId), ['a', 'b']);
});

test('no shortages / nothing published', () => {
  assert.match(answerShortages([shift({})], week).answer, /אין חוסרים/);
  assert.match(answerShortages([], week).answer, /עדיין לא פורסמו/);
});

test('available shifts: extra car note depends on the level', () => {
  const list = [shift({ id: 'a', seatsLeft: 2 }), shift({ id: 'f', date: '2026-11-27' })];
  const c = answerAvailable(list, week, { certification: 'LEVEL_C' });
  assert.match(c.answer, /כמוסמך\/ת שלב ב׳\/ג׳/);
  assert.match(c.answer, /\(1 מלאות/);
  assert.match(answerAvailable(list, week, { certification: 'NONE' }).answer, /מתנדבי שלב ב׳\/ג׳ יכולים/);
  assert.match(c.answer, /נותרו 2 מקומות/);
});

test('one shift per day: same-day shifts are marked and get no sign-up button', () => {
  const a = answerAvailable([shift({ id: 'm', seatsLeft: 1, mine: true }), shift({ id: 'x', shiftType: 'NIGHT', seatsLeft: 2, sameDay: true }), shift({ id: 'y', date: '2026-11-26', seatsLeft: 1 })], week);
  assert.match(a.answer, /✅ נרשמת/);
  assert.match(a.answer, /יש לך משמרת ביום הזה/);
  assert.deepEqual(a.actions!.map((x) => x.shiftId), ['y']);
});

test('my shifts: guest, commander, volunteer', () => {
  assert.equal(answerMine(null).needsLogin, true);
  assert.match(answerMine('ADMIN').answer, /אין לך משמרות אישיות/);
  const v = plain(
    answerMine({
      fullName: 'דנה לוי', month: '2026-11', monthApproved: 4, monthDone: 3, rank: 2,
      upcoming: [{ date: '2026-11-25', shiftType: 'EVENING', startTime: '14:30', endTime: '22:00', status: 'APPROVED', opensNewCar: true, partial: false }],
    }).answer,
  );
  assert.match(v, /משמרת צהריים 14:30–22:00 · 🚓 ניידת נוספת/);
  assert.match(v, /בנובמבר: 4 משמרות מאושרות \(3 כבר בוצעו\)/);
  assert.match(v, /במקום 2 בטופ 5/);
});

test('leaders and fallback', () => {
  const l = answerLeaders({ month: '2026-11', top: [{ rank: 1, fullName: 'אבי', shifts: 3 }, { rank: 2, fullName: 'דן', shifts: 1 }] });
  assert.match(l.answer, /טופ 5 מובילים החודש – נובמבר/);
  assert.match(l.answer, /🥇 אבי – 3 משמרות/);
  assert.match(l.answer, /🥈 דן – משמרת אחת/);
  assert.match(answerLeaders({ month: '2026-11', top: [] }).answer, /החודש רק התחיל/);
  assert.ok(answerFallback().suggestions.length >= 4);
});
