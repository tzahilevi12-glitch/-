import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSignUpMessage, sendTelegram, telegramConfig, type SignUpNotice } from './telegram.ts';

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
