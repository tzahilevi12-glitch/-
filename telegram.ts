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
  /** "משמרת מקוצרת": partial hours totalling less than 5 hours */
  short?: boolean;
  /** Length of the volunteer's own hours, in minutes */
  durationMinutes?: number;
  /** The full shift's hours, e.g. "14:30" – "22:00" (for comparison in short-shift alerts) */
  shiftStartTime?: string;
  shiftEndTime?: string;
  /** Length of the full shift, in minutes */
  shiftDurationMinutes?: number;
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

/** "3 שעות וחצי", "4 שעות ורבע", "שעתיים", "4 שעות ו-10 דקות" */
export function hebrewDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hours = h === 0 ? '' : h === 1 ? 'שעה' : h === 2 ? 'שעתיים' : `${h} שעות`;
  if (m === 0) return hours;
  if (!hours) return `${m} דקות`;
  if (m === 30) return `${hours} וחצי`;
  if (m === 15) return `${hours} ורבע`;
  return `${hours} ו-${m} דקות`;
}

/** The Hebrew message text (plain text — no Markdown, so names can never break the formatting). */
export function buildSignUpMessage(n: SignUpNotice): string {
  const car = n.opensNewCar && (n.certification === 'LEVEL_B' || n.certification === 'LEVEL_C');
  const short = n.short === true && typeof n.durationMinutes === 'number';
  const lines: string[] = [];
  // Short shift: a loud banner on top, so commanders see at once that the shift is not fully covered.
  if (short) {
    lines.push('⚠️⚠️ שים לב: רישום למשמרת מקוצרת! ⚠️⚠️', `⏱️ ${hebrewDuration(n.durationMinutes!)} בלבד – לא משמרת מלאה`, '━━━━━━━━━━━━━━━');
  }
  lines.push(
    car
      ? '🚓🚓 ניידת נוספת למשמרת! 🚓🚓'
      : n.waitlisted
        ? '🚨 הרשמה חדשה למשמרת! (רשימת המתנה)'
        : '🚨 הרשמה חדשה למשמרת!',
    '',
    `👤 מתנדב: ${n.fullName}`,
    `📅 תאריך: ${hebrewDate(n.date)}`,
  );
  if (short) {
    const full = n.shiftStartTime && n.shiftEndTime ? ` (${n.shiftStartTime}–${n.shiftEndTime})` : '';
    lines.push(`⏰ משמרת: ${SHIFT_NAME[n.shiftType]}${full}`);
    lines.push(`⏱️ שעות המתנדב: ${n.startTime}–${n.endTime} בלבד`);
    lines.push(
      typeof n.shiftDurationMinutes === 'number'
        ? `⌛ משך: ${hebrewDuration(n.durationMinutes!)} מתוך ${hebrewDuration(n.shiftDurationMinutes)} של המשמרת`
        : `⌛ משך: ${hebrewDuration(n.durationMinutes!)}`,
    );
  } else {
    lines.push(`⏰ משמרת: ${SHIFT_NAME[n.shiftType]} (${n.startTime}–${n.endTime}${n.partial ? ', שעות חלקיות' : ''})`);
  }
  lines.push(`🎓 הסמכה: ${CERT_NAME[n.certification]}`, `🔑 צ'יפ נהיגה: ${n.hasDrivingChip ? 'יש' : 'אין'}`);
  // Only Level B/C volunteers can open a patrol car, so the line is shown only for them.
  if (car) {
    lines.push('🚓 פתיחת ניידת: כן – ניידת נוספת');
    lines.push('', '➕ הניידת פועלת במקביל למשמרת ולא תופסת מקום רגיל.');
  } else if (n.certification === 'LEVEL_B' || n.certification === 'LEVEL_C') {
    lines.push('🚓 פתיחת ניידת: לא (מקום רגיל במשמרת)');
  }
  if (n.waitlisted) {
    lines.push('', '⏳ הסטטוס: ממתין/ה לשיבוץ (המשמרת מלאה או שהמקום שמור לנהג).');
  }
  if (short) {
    lines.push('', '❗ המתנדב/ת לא מכסה את כל שעות המשמרת – יש לוודא כיסוי לשאר השעות.');
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

export interface CancelNotice {
  fullName: string;
  date: string;
  shiftType: ShiftType;
  startTime: string;
  endTime: string;
}

function shiftLine(n: CancelNotice): string {
  return `⏰ משמרת: ${SHIFT_NAME[n.shiftType]} (${n.startTime}–${n.endTime})`;
}

/** 12 hours or less before the shift: the volunteer asks to cancel; the seat stays taken until approved. */
export function buildCancelRequestMessage(n: CancelNotice): string {
  return [
    '⚠️ בקשת ביטול משמרת – ממתינה לאישור',
    '',
    `👤 מתנדב: ${n.fullName}`,
    `📅 תאריך: ${hebrewDate(n.date)}`,
    shiftLine(n),
    '',
    'המקום נשאר תפוס עד לאישור. לאישור או דחייה: לוח מזין המשמרות ← בקשות ביטול.',
  ].join('\n');
}

/** More than 12 hours before the shift: the volunteer cancelled on their own. */
export function buildQuickCancelMessage(n: CancelNotice): string {
  return ['↩️ הרשמה בוטלה (יותר מ-12 שעות לפני המשמרת)', '', `👤 מתנדב: ${n.fullName}`, `📅 תאריך: ${hebrewDate(n.date)}`, shiftLine(n)].join('\n');
}

/** Fire-and-forget send of a prepared message. Never throws. */
export function notifyCommanders(build: () => string): void {
  try {
    void sendTelegram(build());
  } catch (err) {
    console.error(`[telegram] could not build message: ${(err as Error).message}`);
  }
}
