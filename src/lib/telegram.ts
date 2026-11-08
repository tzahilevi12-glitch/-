/**
 * Telegram push notifications for the commanders.
 *
 * Configuration (Render → Environment):
 *   TELEGRAM_BOT_TOKEN  the token BotFather gave you, e.g. 123456789:AAH...
 *   TELEGRAM_CHAT_ID    the commanders' group chat id, e.g. -1001234567890
 *                       (several ids separated by commas are also accepted)
 *
 * Safety rules:
 *   - If either variable is missing, notifications are simply skipped.
 *   - Sending never throws and never delays the volunteer: callers fire it AFTER the
 *     registration is saved and do not wait for it. Failures are only written to the log.
 *   - The token is never written to the log.
 */

export type Certification = 'NONE' | 'LEVEL_A' | 'LEVEL_B' | 'LEVEL_C';
export type ShiftType = 'MORNING' | 'EVENING' | 'NIGHT';

const SHIFT_NAME: Record<ShiftType, string> = { MORNING: 'בוקר', EVENING: 'צהריים', NIGHT: 'לילה' };
const CERT_NAME: Record<Certification, string> = {
  NONE: 'אק״מ',
  LEVEL_A: 'שלב א׳',
  LEVEL_B: 'שלב ב׳',
  LEVEL_C: 'שלב ג׳',
};

export interface SignUpNotice {
  fullName: string;
  /** YYYY-MM-DD */
  date: string;
  shiftType: ShiftType;
  /** "06:00" */
  startTime: string;
  endTime: string;
  /** true when the volunteer chose only part of the shift */
  partial: boolean;
  certification: Certification;
  hasDrivingChip: boolean;
  opensNewCar: boolean;
  waitlisted: boolean;
}

/** "יום ראשון, 8.11.2026" */
export function hebrewDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const weekday = d.toLocaleDateString('he-IL', { weekday: 'long', timeZone: 'UTC' });
  return `${weekday}, ${d.getUTCDate()}.${d.getUTCMonth() + 1}.${d.getUTCFullYear()}`;
}

/** The Hebrew message text (plain text — no Markdown, so names can never break the formatting). */
export function buildSignUpMessage(n: SignUpNotice): string {
  const lines = [
    n.waitlisted ? '🚨 הרשמה חדשה למשמרת! (רשימת המתנה)' : '🚨 הרשמה חדשה למשמרת!',
    '',
    `👤 מתנדב: ${n.fullName}`,
    `📅 תאריך: ${hebrewDate(n.date)}`,
    `⏰ משמרת: ${SHIFT_NAME[n.shiftType]} (${n.startTime}–${n.endTime}${n.partial ? ', שעות חלקיות' : ''})`,
    `🎓 הסמכה: ${CERT_NAME[n.certification]}`,
    `🔑 צ'יפ נהיגה: ${n.hasDrivingChip ? 'יש' : 'אין'}`,
  ];
  // Only Level B/C volunteers can open a patrol car, so the line is shown only for them.
  if (n.certification === 'LEVEL_B' || n.certification === 'LEVEL_C') {
    lines.push(`🚓 פתיחת ניידת: ${n.opensNewCar ? 'כן' : 'לא'}`);
  }
  if (n.waitlisted) {
    lines.push('', '⏳ הסטטוס: ממתין/ה לשיבוץ (המשמרת מלאה או שהמקום שמור לנהג).');
  }
  return lines.join('\n');
}

export function telegramConfig(env: Record<string, string | undefined> = process.env): { token: string; chatIds: string[] } | null {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const chatIds = (env.TELEGRAM_CHAT_ID ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!token || chatIds.length === 0) return null;
  return { token, chatIds };
}

let warnedMissing = false;

/** Send a text to the commanders. Resolves to true if every chat got it. Never throws. */
export async function sendTelegram(text: string, env: Record<string, string | undefined> = process.env): Promise<boolean> {
  try {
    const cfg = telegramConfig(env);
    if (!cfg) {
      if (!warnedMissing) {
        console.warn('[telegram] TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set — notifications are off.');
        warnedMissing = true;
      }
      return false;
    }
    const results = await Promise.all(
      cfg.chatIds.map(async (chatId) => {
        try {
          const res = await fetch(`https://api.telegram.org/bot${cfg.token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
            signal: AbortSignal.timeout(10_000),
          });
          if (!res.ok) {
            const body = await res.text().catch(() => '');
            console.error(`[telegram] send to chat ${chatId} failed: HTTP ${res.status} ${body.slice(0, 300)}`);
            return false;
          }
          return true;
        } catch (err) {
          console.error(`[telegram] send to chat ${chatId} failed: ${(err as Error).message}`);
          return false;
        }
      }),
    );
    return results.every(Boolean);
  } catch (err) {
    console.error(`[telegram] unexpected error: ${(err as Error).message}`);
    return false;
  }
}

/** Fire-and-forget: used right after a sign-up is saved. */
export function notifySignUp(n: SignUpNotice): void {
  let text: string;
  try {
    text = buildSignUpMessage(n);
  } catch (err) {
    console.error(`[telegram] could not build message: ${(err as Error).message}`);
    return;
  }
  void sendTelegram(text);
}
