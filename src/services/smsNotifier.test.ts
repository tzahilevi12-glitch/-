import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { alertPhoneNumbers, buildCancellationSms, notifyCancellationBySms, type CancellationDetails } from './smsNotifier.ts';

const details: CancellationDetails = {
  volunteerName: 'תמר בן עמי',
  shiftType: 'NIGHT',
  date: '2026-11-07',
  startTime: '23:00',
  endTime: '03:00',
  urgent: true,
};
const THREE = '050-1234567, 052 765 4321, +972541112233';

/** Local HTTP server that records requests (stands in for Twilio / a webhook). */
async function recorder(status = 200) {
  const calls: Array<{ url: string; headers: http.IncomingHttpHeaders; body: string }> = [];
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const c of req) body += c;
    calls.push({ url: req.url!, headers: req.headers, body });
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end('{}');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { calls, url, close: () => new Promise((r) => server.close(r)) };
}

test('message has name, date and hours in Hebrew, flags urgent', () => {
  const msg = buildCancellationSms(details);
  assert.match(msg, /ביטול משמרת: תמר בן עמי/);
  assert.match(msg, /משמרת לילה 7\.11\.2026, שעות 23:00-03:00/);
  assert.match(msg, /פחות מ-24 שעות/);
  assert.doesNotMatch(msg, /[⁦-⁩]/);
  assert.match(buildCancellationSms({ ...details, urgent: false, waitlistOnly: true }), /^יציאה מהמתנה/);
});

test('phone list: normalizes Israeli formats, de-duplicates, reports invalid', () => {
  assert.deepEqual(alertPhoneNumbers({ ALERT_PHONE_NUMBERS: THREE }).numbers, ['+972501234567', '+972527654321', '+972541112233']);
  const r = alertPhoneNumbers({ ALERT_PHONE_NUMBERS: '0501234567,+972501234567,abc' });
  assert.deepEqual(r.numbers, ['+972501234567']);
  assert.deepEqual(r.invalid, ['abc']);
});

test('console provider (default) "sends" to all three without network', async () => {
  const r = await notifyCancellationBySms(details, { ALERT_PHONE_NUMBERS: THREE });
  assert.equal(r.provider, 'console');
  assert.equal(r.sent, 3);
  assert.equal(r.error, null);
});

test('no numbers configured → reported, not thrown', async () => {
  const r = await notifyCancellationBySms(details, {});
  assert.equal(r.sent, 0);
  assert.match(r.error ?? '', /ALERT_PHONE_NUMBERS/);
});

test('twilio provider posts one form-encoded message per number with basic auth', async () => {
  const rec = await recorder(201);
  try {
    const r = await notifyCancellationBySms(details, {
      ALERT_PHONE_NUMBERS: THREE,
      SMS_PROVIDER: 'twilio',
      TWILIO_ACCOUNT_SID: 'AC123',
      TWILIO_AUTH_TOKEN: 'secret',
      TWILIO_FROM: '+15005550006',
      TWILIO_API_BASE: rec.url,
    });
    assert.equal(r.sent, 3);
    assert.equal(rec.calls.length, 3);
    const call = rec.calls[0];
    assert.equal(call.url, '/2010-04-01/Accounts/AC123/Messages.json');
    assert.equal(call.headers.authorization, `Basic ${Buffer.from('AC123:secret').toString('base64')}`);
    const form = new URLSearchParams(call.body);
    assert.equal(form.get('From'), '+15005550006');
    assert.match(form.get('Body') ?? '', /תמר בן עמי/);
    assert.deepEqual(rec.calls.map((c) => new URLSearchParams(c.body).get('To')).sort(), ['+972501234567', '+972527654321', '+972541112233']);
  } finally {
    await rec.close();
  }
});

test('twilio provider without credentials → clear error', async () => {
  const r = await notifyCancellationBySms(details, { ALERT_PHONE_NUMBERS: THREE, SMS_PROVIDER: 'twilio' });
  assert.equal(r.sent, 0);
  assert.match(r.error ?? '', /TWILIO_ACCOUNT_SID/);
});

test('webhook provider posts JSON with bearer token', async () => {
  const rec = await recorder(200);
  try {
    const r = await notifyCancellationBySms(details, {
      ALERT_PHONE_NUMBERS: THREE,
      SMS_PROVIDER: 'webhook',
      SMS_WEBHOOK_URL: `${rec.url}/sms`,
      SMS_WEBHOOK_TOKEN: 'tok',
    });
    assert.equal(r.sent, 3);
    assert.equal(rec.calls[0].headers.authorization, 'Bearer tok');
    const body = JSON.parse(rec.calls[0].body);
    assert.ok(body.to.startsWith('+972'));
    assert.match(body.message, /ביטול משמרת/);
  } finally {
    await rec.close();
  }
});

test('provider failure is reported per number, never thrown', async () => {
  const rec = await recorder(500);
  try {
    const r = await notifyCancellationBySms(details, { ALERT_PHONE_NUMBERS: THREE, SMS_PROVIDER: 'webhook', SMS_WEBHOOK_URL: rec.url });
    assert.equal(r.sent, 0);
    assert.equal(r.failed.length, 3);
    assert.match(r.failed[0].error, /HTTP 500/);
    assert.ok(r.error);
  } finally {
    await rec.close();
  }
});
