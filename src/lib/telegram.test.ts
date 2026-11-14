import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSignUpMessage, hebrewDuration, sendTelegram, telegramConfig, type SignUpNotice } from './telegram.ts';

const base: SignUpNotice = {
  fullName: 'דנה כהן',
  date: '2026-11-08',
  shiftType: 'EVENING',
  startTime: '14:30',
  endTime: '22:00',
  partial: false,
  certification: 'NONE',
  hasDrivingChip: true,
  opensNewCar: false,
  waitlisted: false,
};

test('message: basic Hebrew format, afternoon is צהריים, no car line for אק״מ', () => {
  const m = buildSignUpMessage(base);
  assert.match(m, /^🚨 הרשמה חדשה למשמרת!/);
  assert.match(m, /👤 מתנדב: דנה כהן/);
  assert.match(m, /📅 תאריך: יום ראשון, 8\.11\.2026/);
  assert.match(m, /⏰ משמרת: צהריים \(14:30–22:00\)/);
  assert.match(m, /🎓 הסמכה: אק״מ/);
  assert.match(m, /🔑 צ'יפ נהיגה: יש/);
  assert.doesNotMatch(m, /ניידת/);
  assert.doesNotMatch(m, /ערב/);
});

test('message: Level A has no car line; Level B/C always show it', () => {
  assert.doesNotMatch(buildSignUpMessage({ ...base, certification: 'LEVEL_A' }), /ניידת/);
  const car = buildSignUpMessage({ ...base, certification: 'LEVEL_B', opensNewCar: true });
  assert.match(car, /^🚓🚓 ניידת נוספת למשמרת! 🚓🚓/);
  assert.match(car, /🎓 הסמכה: שלב ב׳[\s\S]*🚓 פתיחת ניידת: כן – ניידת נוספת/);
  assert.match(car, /לא תופסת מקום רגיל/);
  const regularC = buildSignUpMessage({ ...base, certification: 'LEVEL_C', opensNewCar: false });
  assert.match(regularC, /^🚨 הרשמה חדשה למשמרת!/);
  assert.match(regularC, /🚓 פתיחת ניידת: לא \(מקום רגיל במשמרת\)/);
});

test('message: partial hours, no chip, waitlist', () => {
  const m = buildSignUpMessage({ ...base, shiftType: 'NIGHT', startTime: '23:00', endTime: '03:00', partial: true, hasDrivingChip: false, waitlisted: true });
  assert.match(m, /רשימת המתנה/);
  assert.match(m, /⏰ משמרת: לילה \(23:00–03:00, שעות חלקיות\)/);
  assert.match(m, /🔑 צ'יפ נהיגה: אין/);
});

test('config: missing variables → off; comma-separated chat ids accepted', () => {
  assert.equal(telegramConfig({}), null);
  assert.equal(telegramConfig({ TELEGRAM_BOT_TOKEN: 'x' }), null);
  assert.equal(telegramConfig({ TELEGRAM_CHAT_ID: '-100' }), null);
  assert.deepEqual(telegramConfig({ TELEGRAM_BOT_TOKEN: ' t ', TELEGRAM_CHAT_ID: '-1001, 222 ,' }), { token: 't', chatIds: ['-1001', '222'] });
});

test('send: posts JSON to the Telegram API', async () => {
  const calls: { url: string; body: any }[] = [];
  const orig = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: any) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return new Response('{"ok":true}', { status: 200 });
  }) as typeof fetch;
  try {
    const ok = await sendTelegram('שלום', { TELEGRAM_BOT_TOKEN: 'TOK', TELEGRAM_CHAT_ID: '-42' });
    assert.equal(ok, true);
    assert.equal(calls[0].url, 'https://api.telegram.org/botTOK/sendMessage');
    assert.deepEqual(calls[0].body, { chat_id: '-42', text: 'שלום', disable_web_page_preview: true });
  } finally {
    globalThis.fetch = orig;
  }
});

test('send: never throws — missing config, HTTP error, network error', async () => {
  const orig = globalThis.fetch;
  const origErr = console.error;
  const origWarn = console.warn;
  console.error = () => {};
  console.warn = () => {};
  try {
    assert.equal(await sendTelegram('x', {}), false);
    globalThis.fetch = (async () => new Response('{"ok":false,"description":"chat not found"}', { status: 400 })) as typeof fetch;
    assert.equal(await sendTelegram('x', { TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '1' }), false);
    globalThis.fetch = (async () => {
      throw new Error('ECONNRESET');
    }) as typeof fetch;
    assert.equal(await sendTelegram('x', { TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '1' }), false);
  } finally {
    globalThis.fetch = orig;
    console.error = origErr;
    console.warn = origWarn;
  }
});

test('short shift (under 5 hours): loud banner on top, exact hours and duration', () => {
  const m = buildSignUpMessage({
    ...base,
    startTime: '18:30',
    endTime: '22:00',
    partial: true,
    short: true,
    durationMinutes: 210,
    shiftStartTime: '14:30',
    shiftEndTime: '22:00',
    shiftDurationMinutes: 450,
  });
  const lines = m.split('\n');
  assert.equal(lines[0], '⚠️⚠️ שים לב: רישום למשמרת מקוצרת! ⚠️⚠️');
  assert.equal(lines[1], '⏱️ 3 שעות וחצי בלבד – לא משמרת מלאה');
  assert.match(m, /🚨 הרשמה חדשה למשמרת!/);
  assert.match(m, /⏰ משמרת: צהריים \(14:30–22:00\)/);
  assert.match(m, /⏱️ שעות המתנדב: 18:30–22:00 בלבד/);
  assert.match(m, /⌛ משך: 3 שעות וחצי מתוך 7 שעות וחצי של המשמרת/);
  assert.match(m, /❗ המתנדב\/ת לא מכסה את כל שעות המשמרת/);
});

test('short shift also highlighted for an extra patrol car; 5+ hours partial is not', () => {
  const car = buildSignUpMessage({ ...base, certification: 'LEVEL_C', opensNewCar: true, startTime: '06:00', endTime: '10:00', partial: true, short: true, durationMinutes: 240, shiftStartTime: '06:00', shiftEndTime: '15:00', shiftDurationMinutes: 540, shiftType: 'MORNING' });
  assert.match(car, /^⚠️⚠️ שים לב: רישום למשמרת מקוצרת!/);
  assert.match(car, /🚓🚓 ניידת נוספת למשמרת!/);
  assert.match(car, /4 שעות מתוך 9 שעות/);
  const five = buildSignUpMessage({ ...base, startTime: '17:00', endTime: '22:00', partial: true, short: false, durationMinutes: 300 });
  assert.match(five, /^🚨 הרשמה חדשה למשמרת!/);
  assert.doesNotMatch(five, /מקוצרת/);
  assert.match(five, /צהריים \(17:00–22:00, שעות חלקיות\)/);
});

test('hebrewDuration', () => {
  assert.equal(hebrewDuration(180), '3 שעות');
  assert.equal(hebrewDuration(210), '3 שעות וחצי');
  assert.equal(hebrewDuration(255), '4 שעות ורבע');
  assert.equal(hebrewDuration(250), '4 שעות ו-10 דקות');
  assert.equal(hebrewDuration(120), 'שעתיים');
  assert.equal(hebrewDuration(570), '9 שעות וחצי');
});

test('manual registration: marked with the commander who did it', () => {
  const m = buildSignUpMessage({ ...base, addedBy: 'רס״ב כהן' });
  const lines = m.split('\n');
  assert.equal(lines[0], '🚨 הרשמה חדשה למשמרת!');
  assert.equal(lines[1], '📝 רישום ידני ע״י מזין המשמרות: רס״ב כהן');
  assert.match(m, /👤 מתנדב: דנה כהן/);
  const short = buildSignUpMessage({ ...base, addedBy: 'רס״ב כהן', startTime: '18:30', endTime: '22:00', partial: true, short: true, durationMinutes: 210, shiftStartTime: '14:30', shiftEndTime: '22:00', shiftDurationMinutes: 450 });
  assert.match(short, /^⚠️⚠️ שים לב: רישום למשמרת מקוצרת!/);
  assert.match(short, /📝 רישום ידני ע״י מזין המשמרות: רס״ב כהן/);
});
