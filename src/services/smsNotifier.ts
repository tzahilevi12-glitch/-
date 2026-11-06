/**
 * External SMS alerts for the shift scheduler.
 *
 * When a volunteer cancels, a text goes to every number in ALERT_PHONE_NUMBERS
 * (comma-separated, e.g. "050-1234567,052-7654321,054-1112233").
 *
 * SMS_PROVIDER chooses how it is sent:
 *   console  (default) — only writes the message to the server log. Safe for trying things out.
 *   twilio   — Twilio REST API. Needs TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM
 *              (a Twilio phone number or an approved sender name).
 *   webhook  — POSTs JSON { to, message } to SMS_WEBHOOK_URL for each number, with
 *              "Authorization: Bearer <SMS_WEBHOOK_TOKEN>" if a token is set. Use this to plug in
 *              an Israeli SMS provider or an automation tool (Make, Zapier, n8n) that sends the SMS.
 *
 * No database or framework imports, so it can be tested on its own.
 */
import { normalizePhone } from '../lib/phone.ts';

type Env = Record<string, string | undefined>;

const TIMEOUT_MS = 8_000;
const SHIFT_HE = { MORNING: 'בוקר', EVENING: 'ערב', NIGHT: 'לילה' } as const;

export interface CancellationDetails {
  volunteerName: string;
  shiftType: keyof typeof SHIFT_HE;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  urgent: boolean; // shift starts within 24 hours
  waitlistOnly?: boolean; // they were on the waitlist, not holding a seat
}

/** Plain-text Hebrew SMS (no Unicode direction marks, which some phones show as boxes). */
export function buildCancellationSms(d: CancellationDetails): string {
  const [y, m, day] = d.date.split('-').map(Number);
  const date = `${day}.${m}.${y}`;
  const what = `משמרת ${SHIFT_HE[d.shiftType]} ${date}, שעות ${d.startTime}-${d.endTime}`;
  const head = d.waitlistOnly ? 'יציאה מהמתנה' : 'ביטול משמרת';
  const action = d.waitlistOnly ? 'יצא/ה מרשימת ההמתנה ל' : 'ביטל/ה את ההרשמה ל';
  return `${head}: ${d.volunteerName} ${action}${what}.${d.urgent ? ' שימו לב: פחות מ-24 שעות לפני המשמרת.' : ''}`;
}

/** Valid numbers from ALERT_PHONE_NUMBERS, normalized to +972…; invalid entries are reported. */
export function alertPhoneNumbers(env: Env = process.env): { numbers: string[]; invalid: string[] } {
  const raw = (env.ALERT_PHONE_NUMBERS ?? '').split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  const numbers: string[] = [];
  const invalid: string[] = [];
  for (const r of raw) {
    const n = normalizePhone(r);
    if (n && !numbers.includes(n)) numbers.push(n);
    else if (!n) invalid.push(r);
  }
  return { numbers, invalid };
}

export interface SmsResult {
  provider: string;
  sent: number;
  failed: Array<{ to: string; error: string }>;
  /** Short summary for the scheduler's alert when something went wrong; null if all sent. */
  error: string | null;
}

async function postOrThrow(url: string, init: RequestInit): Promise<void> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) {
    const text = (await res.text().catch(() => '')).slice(0, 200);
    throw new Error(`HTTP ${res.status}${text ? `: ${text}` : ''}`);
  }
}

function senderFor(provider: string, env: Env): ((to: string, body: string) => Promise<void>) | string {
  if (provider === 'console') {
    return async (to, body) => {
      console.log(`[SMS → ${to}] ${body}`);
    };
  }
  if (provider === 'twilio') {
    const sid = env.TWILIO_ACCOUNT_SID;
    const token = env.TWILIO_AUTH_TOKEN;
    const from = env.TWILIO_FROM;
    if (!sid || !token || !from) return 'חסרות הגדרות Twilio (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM).';
    const base = env.TWILIO_API_BASE ?? 'https://api.twilio.com';
    const auth = `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`;
    return (to, body) =>
      postOrThrow(`${base}/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
      });
  }
  if (provider === 'webhook') {
    const url = env.SMS_WEBHOOK_URL;
    if (!url) return 'חסרה הגדרת SMS_WEBHOOK_URL.';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (env.SMS_WEBHOOK_TOKEN) headers.Authorization = `Bearer ${env.SMS_WEBHOOK_TOKEN}`;
    return (to, body) => postOrThrow(url, { method: 'POST', headers, body: JSON.stringify({ to, message: body }) });
  }
  return `ספק SMS לא מוכר: ${provider}. האפשרויות: console, twilio, webhook.`;
}

/**
 * Send one SMS to each configured number, in parallel. Never throws: a failed SMS
 * must not undo the cancellation, so failures are returned (and logged) instead.
 */
export async function sendSmsToAlertNumbers(body: string, env: Env = process.env): Promise<SmsResult> {
  const provider = (env.SMS_PROVIDER ?? 'console').trim().toLowerCase();
  const { numbers, invalid } = alertPhoneNumbers(env);
  const problems: string[] = invalid.length ? [`מספרים לא תקינים: ${invalid.join(', ')}`] : [];

  if (!numbers.length) {
    const error = [...problems, 'לא הוגדרו מספרי טלפון להתראות (ALERT_PHONE_NUMBERS).'].join(' ');
    console.warn(`[SMS] ${error}`);
    return { provider, sent: 0, failed: [], error };
  }

  const send = senderFor(provider, env);
  if (typeof send === 'string') {
    console.warn(`[SMS] ${send}`);
    return { provider, sent: 0, failed: numbers.map((to) => ({ to, error: send })), error: [...problems, send].join(' ') };
  }

  const results = await Promise.allSettled(numbers.map((to) => send(to, body)));
  const failed = results.flatMap((r, i) =>
    r.status === 'rejected' ? [{ to: numbers[i], error: r.reason instanceof Error ? r.reason.message : String(r.reason) }] : [],
  );
  for (const f of failed) console.error(`[SMS] sending to ${f.to} failed: ${f.error}`);
  if (failed.length) problems.push(`השליחה נכשלה ל-${failed.map((f) => f.to).join(', ')}.`);
  return { provider, sent: numbers.length - failed.length, failed, error: problems.length ? problems.join(' ') : null };
}

export async function notifyCancellationBySms(d: CancellationDetails, env: Env = process.env): Promise<SmsResult> {
  return sendSmsToAlertNumbers(buildCancellationSms(d), env);
}
