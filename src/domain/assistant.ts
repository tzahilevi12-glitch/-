/**
 * "🤖 עוזרת חמ"ל" — the built-in shift assistant. Pure functions only (no database, no AI service):
 * Hebrew intent detection by keywords, and the Hebrew answer texts. The service feeds them live
 * data from the database (see services/assistantService.ts).
 */
import {
  FREE_CANCEL_MINUTES,
  MIN_REGISTRATION_MINUTES,
  SHORT_SHIFT_MINUTES,
  addDays,
  ltrRange,
} from './registrationRules.ts';
import { summaryDayLabel, weekRangeText } from './shortageSummary.ts';

export type AssistantIntent = 'shortages' | 'available' | 'mine' | 'leaders' | 'rules' | 'greeting' | 'fallback';
export type RulesTopic = 'cancel' | 'short' | 'car' | 'levels' | 'minimum' | 'all';
export type AssistantShiftType = 'MORNING' | 'EVENING' | 'NIGHT';
export type AssistantCert = 'NONE' | 'LEVEL_A' | 'LEVEL_B' | 'LEVEL_C';

export const ASSISTANT_GREETING = 'שלום! אני עוזרת החמ"ל של יחידת המתנדבים. במה אוכל לעזור?';

/** The quick-tap chips (also offered after a question that wasn't understood). */
export const ASSISTANT_SUGGESTIONS = [
  '🚨 איפה חסר נהג השבוע?',
  '📅 אילו משמרות פנויות השבוע?',
  '🏆 מי בטופ 5 החודש?',
  '📋 מה חוקי הרישום והביטול?',
] as const;

export const MAX_QUESTION_LENGTH = 300;

const SHIFT_NAME: Record<AssistantShiftType, string> = { MORNING: 'בוקר', EVENING: 'צהריים', NIGHT: 'לילה' };
const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

/** Lower-case, no niqqud, no quote marks (חמ״ל → חמל, אק"מ → אקמ), no emoji/punctuation. */
export function normalizeQuestion(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[֑-ׇ]/g, '') // niqqud / cantillation
    .replace(/["'`״׳“”‘’]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** keyword (substring of the normalized question) → weight */
/** A string matches anywhere in the question; a RegExp is for words that hide inside other words. */
const KEYWORDS: Record<Exclude<AssistantIntent, 'greeting' | 'fallback'>, [string | RegExp, number][]> = {
  mine: [
    [/(^|\s)(ו|ה)?שלי(\s|$)/, 3], ['עשיתי', 3], ['ביצעתי', 3], ['אני רשום', 3], ['אני רשומה', 3], ['נרשמתי', 3],
    ['הסטטיסטיקה', 2], ['כמה משמרות היו לי', 3], ['יש לי', 2], ['לי משמרת', 3],
  ],
  leaders: [
    ['טופ', 3], ['מובילים', 3], ['מובילות', 3], ['מוביל', 2], ['דירוג', 3], ['מצטיינ', 3], ['טבלת', 2],
    ['מקום ראשון', 3], ['הכי הרבה משמרות', 3],
  ],
  shortages: [
    ['נהג', 2], ['דחוף', 2], ['דחופ', 2], ['חוסר', 2], ['חסר', 2], ['מצוקה', 2], ['צריך עזרה', 2], ['צריכים עזרה', 2],
    ['תגבור', 2],
  ],
  rules: [
    [/(^|\s)(ה|ו|ב)?חוק/, 2], [/(^|\s)(ה|ו)?כלל/, 2], ['נוהל', 2], ['נהלים', 2], ['ביטול', 2], ['לבטל', 2], ['מבטל', 2], ['מקוצר', 2],
    ['שלב', 2], ['הסמכ', 2], ['אקמ', 2], ['מינימום', 2], ['כמה שעות', 2], ['ניידת', 2], ['12 שעות', 2],
    ['שאלות נפוצות', 2], ['איך נרשמים', 2], ['איך להירשם', 2], ['איך נרשמ', 2], ['רישום', 1], ['המתנה', 2],
    ['מותר', 1], ['אפשר לה', 1],
  ],
  available: [
    ['פנוי', 3], ['פנויות', 3], ['פתוח', 2], ['שיבוץ', 2], ['להשתבץ', 2], ['משתבצ', 2], ['להירשם', 1], ['מקום', 1],
    ['זמינ', 2], ['משמרות', 1], ['משמרת', 0.5], ['לשריין', 2], ['איפה אפשר', 1],
  ],
};

/** Order breaks ties: "my shifts" beats "available shifts", the leaderboard beats everything else. */
const PRIORITY: Exclude<AssistantIntent, 'greeting' | 'fallback'>[] = ['mine', 'leaders', 'shortages', 'rules', 'available'];

const GREETING_RE = /(^|\s)(שלום|היי|הי|הלו|אהלן|בוקר טוב|צהריים טובים|ערב טוב|לילה טוב|תודה|תודה רבה|מה נשמע|מה שלומך)(\s|$)/;

export function detectIntent(question: string): AssistantIntent {
  const q = normalizeQuestion(question);
  if (!q) return 'greeting';
  let best: AssistantIntent | null = null;
  let bestScore = 0;
  for (const intent of PRIORITY) {
    const score = KEYWORDS[intent].reduce((sum, [kw, w]) => ((typeof kw === 'string' ? q.includes(kw) : kw.test(q)) ? sum + w : sum), 0);
    if (score > bestScore) {
      best = intent;
      bestScore = score;
    }
  }
  if (best) return best;
  return GREETING_RE.test(q) ? 'greeting' : 'fallback';
}

export function detectRulesTopic(question: string): RulesTopic {
  const q = normalizeQuestion(question);
  const topics: RulesTopic[] = [];
  if (/ביטול|לבטל|מבטל|12 שעות/.test(q)) topics.push('cancel');
  if (/מקוצר/.test(q)) topics.push('short');
  if (/ניידת/.test(q)) topics.push('car');
  if (/שלב|הסמכ|אקמ|דרג/.test(q)) topics.push('levels');
  if (/מינימום|כמה שעות|3 שעות|שלוש שעות/.test(q)) topics.push('minimum');
  return topics.length === 1 ? topics[0] : 'all';
}

export interface DateRange {
  from: string;
  to: string;
  /** "ב-7 הימים הקרובים (24/11–30/11)" */
  label: string;
}

/** "היום" / "מחר" / "שבוע הבא"; otherwise the 7 days starting today ("השבוע"). */
export function detectRange(question: string, today: string): DateRange {
  const q = normalizeQuestion(question);
  if (/(^|\s)(ה|ל|ב)?היום(\s|$)/.test(q)) return { from: today, to: today, label: `היום (${weekRangeText({ from: today, to: today }).split('–')[0]})` };
  if (/(^|\s)(ו|ל|ב)?מחר(\s|$)/.test(q)) {
    const t = addDays(today, 1);
    return { from: t, to: t, label: `מחר (${weekRangeText({ from: t, to: t }).split('–')[0]})` };
  }
  if (/שבוע הבא|בשבוע הבא|לשבוע הבא/.test(q)) {
    const range = { from: addDays(today, 7), to: addDays(today, 13) };
    return { ...range, label: `בשבוע הבא (${weekRangeText(range)})` };
  }
  const range = { from: today, to: addDays(today, 6) };
  return { ...range, label: `ב-7 הימים הקרובים (${weekRangeText(range)})` };
}

export interface AssistantShift {
  id: string;
  date: string;
  shiftType: AssistantShiftType;
  startTime: string;
  endTime: string;
  maxVolunteers: number;
  seatsLeft: number;
  /** no qualified driver on the shift yet */
  needsDriver: boolean;
  /** the remaining places are kept for volunteers with a driving chip */
  driverOnly: boolean;
  /** starts within 48 hours and still short */
  urgent: boolean;
  /** the asking volunteer is already on it (or on its waitlist) */
  mine?: boolean;
  /** the asking volunteer already has another shift that day (one shift per day) */
  sameDay?: boolean;
}

export interface AssistantAction {
  shiftId: string;
  label: string;
}

export interface AssistantAnswer {
  intent: AssistantIntent;
  answer: string;
  suggestions: string[];
  /** quick sign-up buttons (opens the shift's sign-up on the board) */
  actions?: AssistantAction[];
  /** the question needs a signed-in volunteer */
  needsLogin?: boolean;
}

const MAX_LINES = 12;

function sortShifts(list: AssistantShift[]): AssistantShift[] {
  const order: Record<AssistantShiftType, number> = { MORNING: 0, EVENING: 1, NIGHT: 2 };
  return [...list].sort((a, b) => (a.date === b.date ? order[a.shiftType] - order[b.shiftType] : a.date < b.date ? -1 : 1));
}

/** "יום רביעי (25/11) | משמרת בוקר 06:00–15:00" */
export function shiftLine(s: Pick<AssistantShift, 'date' | 'shiftType' | 'startTime' | 'endTime'>): string {
  // word joiners keep "06:00–15:00" on one line in the chat bubble
  return `${summaryDayLabel(s.date)} | משמרת ${SHIFT_NAME[s.shiftType]} ${ltrRange(s.startTime, s.endTime).replace('–', '\u2060–\u2060')}`;
}

function missingText(n: number): string {
  return n === 1 ? 'חסר מתנדב 1' : `חסרים ${n} מתנדבים`;
}

function capped(lines: string[]): string[] {
  if (lines.length <= MAX_LINES) return lines;
  return [...lines.slice(0, MAX_LINES), `…ועוד ${lines.length - MAX_LINES} – הרשימה המלאה בלוח המשמרות.`];
}

function bookActions(list: AssistantShift[]): AssistantAction[] {
  return sortShifts(list)
    .filter((s) => s.seatsLeft > 0 && !s.mine && !s.sameDay)
    .slice(0, 3)
    .map((s) => ({ shiftId: s.id, label: `שריין: ${summaryDayLabel(s.date)} · ${SHIFT_NAME[s.shiftType]}` }));
}

const others = (intent: AssistantIntent) => ASSISTANT_SUGGESTIONS.filter((_, i) => !(
  (intent === 'shortages' && i === 0) || (intent === 'available' && i === 1) || (intent === 'leaders' && i === 2) || (intent === 'rules' && i === 3)
));

/** 🚨 missing drivers and open regular places in the range. */
export function answerShortages(shifts: AssistantShift[], range: DateRange): AssistantAnswer {
  const inRange = sortShifts(shifts.filter((s) => s.date >= range.from && s.date <= range.to));
  const noDriver = inRange.filter((s) => s.needsDriver);
  const open = inRange.filter((s) => s.seatsLeft > 0);
  const base = { intent: 'shortages' as const, suggestions: [...others('shortages')] };
  if (inRange.length === 0) {
    return { ...base, answer: `עדיין לא פורסמו משמרות ${range.label}. כשמזין המשמרות יפרסם, אפשר לשאול אותי שוב.` };
  }
  if (noDriver.length === 0 && open.length === 0) {
    return { ...base, answer: `✅ אין חוסרים ${range.label}: כל המשמרות שפורסמו מאוישות ויש בהן נהג. תודה לכולם!` };
  }
  const lines: string[] = [`🚨 חוסרים ${range.label}:`];
  lines.push('');
  if (noDriver.length) {
    lines.push(`🚗 חסר נהג (${noDriver.length}):`);
    lines.push(...capped(noDriver.map((s) => `• ${shiftLine(s)}${s.urgent ? ' ⏰ דחוף' : ''}`)));
  } else {
    lines.push('🚗 בכל המשמרות יש נהג ✅');
  }
  lines.push('');
  if (open.length) {
    const total = open.reduce((n, s) => n + s.seatsLeft, 0);
    lines.push(`👥 מקומות פתוחים (${total} בסך הכול):`);
    lines.push(
      ...capped(
        open.map((s) => `• ${shiftLine(s)} – ${missingText(s.seatsLeft)}${s.driverOnly ? ' (לבעלי צ׳יפ נהיגה)' : ''}${s.urgent ? ' ⏰ דחוף' : ''}`),
      ),
    );
  } else {
    lines.push('👥 כל המקומות הרגילים מאוישים ✅');
  }
  if (noDriver.length) {
    lines.push('');
    lines.push('יש לך צ׳יפ נהיגה? ההרשמה שלך יכולה להוציא ניידת לסיור 🙏');
  }
  return { ...base, answer: lines.join('\n'), actions: bookActions(open) };
}

/** 📅 published shifts with open places, plus the extra-patrol-car note. */
export function answerAvailable(shifts: AssistantShift[], range: DateRange, viewer: { certification?: AssistantCert | null } = {}): AssistantAnswer {
  const inRange = sortShifts(shifts.filter((s) => s.date >= range.from && s.date <= range.to));
  const open = inRange.filter((s) => s.seatsLeft > 0);
  const full = inRange.filter((s) => s.seatsLeft <= 0);
  const certified = viewer.certification === 'LEVEL_B' || viewer.certification === 'LEVEL_C';
  const base = { intent: 'available' as const, suggestions: [...others('available')] };
  if (inRange.length === 0) {
    return { ...base, answer: `עדיין לא פורסמו משמרות ${range.label}. כשמזין המשמרות יפרסם את השבוע, הן יופיעו בלוח המשמרות.` };
  }
  const lines: string[] = [];
  if (open.length === 0) {
    lines.push(`כל המשמרות ${range.label} מלאות 💪`);
  } else {
    lines.push(`📅 משמרות פנויות ${range.label} (${open.length}):`);
    lines.push('');
    lines.push(
      ...capped(
        open.map(
          (s) =>
            `• ${shiftLine(s)} – ${s.seatsLeft === 1 ? 'נותר מקום 1' : `נותרו ${s.seatsLeft} מקומות`}` +
            `${s.needsDriver ? ' · 🚗 דרוש נהג' : ''}${s.driverOnly ? ' (לבעלי צ׳יפ נהיגה)' : ''}` +
            `${s.mine ? ' · ✅ נרשמת' : s.sameDay ? ' · יש לך משמרת ביום הזה' : ''}`,
        ),
      ),
    );
  }
  lines.push('');
  if (certified) {
    lines.push(`🚓 כמוסמך/ת שלב ב׳/ג׳ אפשר לפתוח "ניידת נוספת" בכל משמרת שפורסמה – גם במלאות${full.length ? ` (${full.length} מלאות ${range.label})` : ''}. היא לא תופסת מקום רגיל.`);
  } else {
    lines.push('🚓 מתנדבי שלב ב׳/ג׳ יכולים לפתוח "ניידת נוספת" בכל משמרת שפורסמה, גם במשמרת מלאה, בלי לתפוס מקום רגיל.');
  }
  lines.push('להרשמה: לוח המשמרות ← "הרשמה". אפשר להירשם למשמרת אחת ביום.');
  return { ...base, answer: lines.join('\n'), actions: bookActions(open) };
}

export interface MyShiftsData {
  fullName: string;
  upcoming: { date: string; shiftType: AssistantShiftType; startTime: string; endTime: string; status: 'APPROVED' | 'PENDING'; opensNewCar: boolean; partial: boolean }[];
  monthApproved: number;
  monthDone: number;
  /** YYYY-MM */
  month: string;
  /** place in this month's top 5, if any */
  rank?: number | null;
}

export function monthName(month: string): string {
  return MONTHS[Number(month.split('-')[1]) - 1] ?? '';
}

/** 👤 my shifts. viewer: null = guest, 'ADMIN' = commander, otherwise the volunteer's data. */
export function answerMine(data: MyShiftsData | null | 'ADMIN'): AssistantAnswer {
  const suggestions = [...ASSISTANT_SUGGESTIONS];
  if (data === null) {
    return {
      intent: 'mine',
      needsLogin: true,
      suggestions,
      answer: 'כדי לראות את המשמרות שלך צריך להיכנס כמתנדב/ת: שם מלא + צ׳יפ נהיגה במסך הכניסה. אחרי הכניסה אפשר לשאול אותי שוב 🙂',
    };
  }
  if (data === 'ADMIN') {
    return {
      intent: 'mine',
      suggestions,
      answer: 'כמזין/ת משמרות אין לך משמרות אישיות במערכת. אפשר לשאול אותי על חוסרים, נהגים, משמרות פנויות או הטופ 5 של החודש.',
    };
  }
  const lines: string[] = [];
  const m = monthName(data.month);
  lines.push(`👤 ${data.fullName}, הנה הסיכום שלך:`);
  lines.push('');
  if (data.upcoming.length === 0) {
    lines.push('אין לך כרגע משמרות קרובות. רוצה לבדוק מה פנוי? 📅');
  } else {
    lines.push(`📌 המשמרות הקרובות שלך (${data.upcoming.length}):`);
    lines.push(
      ...capped(
        data.upcoming.map(
          (u) =>
            `• ${shiftLine(u)}${u.opensNewCar ? ' · 🚓 ניידת נוספת' : ''}${u.partial ? ' · שעות חלקיות' : ''}${u.status === 'PENDING' ? ' · ⏳ ברשימת המתנה' : ''}`,
        ),
      ),
    );
  }
  lines.push('');
  if (data.monthApproved === 0) {
    lines.push(`📊 ב${m} עדיין אין לך משמרות מאושרות.`);
  } else {
    const n = data.monthApproved === 1 ? 'משמרת מאושרת אחת' : `${data.monthApproved} משמרות מאושרות`;
    const done = data.monthDone === 0 ? 'אף אחת עוד לא הסתיימה' : data.monthDone === 1 ? 'אחת כבר בוצעה' : `${data.monthDone} כבר בוצעו`;
    lines.push(`📊 ב${m}: ${n} (${done}).`);
  }
  if (data.rank) lines.push(`🏆 את/ה במקום ${data.rank} בטופ 5 של החודש – כל הכבוד!`);
  return { intent: 'mine', suggestions, answer: lines.join('\n') };
}

export interface LeadersData {
  month: string;
  top: { rank: number; fullName: string; shifts: number }[];
}

const MEDALS = ['🥇', '🥈', '🥉'];

export function answerLeaders(data: LeadersData): AssistantAnswer {
  const m = monthName(data.month);
  const base = { intent: 'leaders' as const, suggestions: [...others('leaders')] };
  if (data.top.length === 0) {
    return { ...base, answer: `🏆 טופ 5 מובילים החודש – ${m}\n\nהחודש רק התחיל – עדיין אין משמרות מאושרות. הירשמו למשמרת ותופיעו כאן!` };
  }
  const lines = [`🏆 טופ 5 מובילים החודש – ${m}`, ''];
  for (const t of data.top.slice(0, 5)) {
    const badge = MEDALS[t.rank - 1] ?? `${t.rank}.`;
    lines.push(`${badge} ${t.fullName} – ${t.shifts === 1 ? 'משמרת אחת' : `${t.shifts} משמרות`}`);
  }
  lines.push('');
  lines.push('הדירוג לפי מספר המשמרות המאושרות בחודש, ומתאפס ב-1 לכל חודש.');
  return { ...base, answer: lines.join('\n') };
}

const hours = (min: number) => (min % 60 === 0 ? `${min / 60}` : `${(min / 60).toFixed(1)}`);

const RULES: Record<Exclude<RulesTopic, 'all'>, string[]> = {
  levels: [
    '🎖️ דרגות הסמכה:',
    '• מתנדב אק״מ / שלב א׳ – הרשמה למשמרות רגילות.',
    '• שלב ב׳ / שלב ג׳ – בנוסף אפשר לפתוח "ניידת נוספת".',
    '• צ׳יפ נהיגה מסומן בנפרד (🚗). כשחסר נהג, המקומות האחרונים נשמרים לבעלי צ׳יפ.',
  ],
  minimum: [
    '⏱️ שעות:',
    `• אפשר להירשם לכל המשמרת או לחלק ממנה, במינימום ${hours(MIN_REGISTRATION_MINUTES)} שעות (גם לניידת נוספת).`,
    '• משמרת אחת ביום לכל מתנדב/ת.',
  ],
  short: [
    '🟣 משמרת מקוצרת:',
    `• רישום לחלק מהמשמרת שאורכו פחות מ-${hours(SHORT_SHIFT_MINUTES)} שעות מסומן "משמרת מקוצרת" (תג סגול) – גלוי לכולם ולמזין המשמרות.`,
    `• המינימום הוא ${hours(MIN_REGISTRATION_MINUTES)} שעות, כך שמשמרת מקוצרת היא ${hours(MIN_REGISTRATION_MINUTES)}–${hours(SHORT_SHIFT_MINUTES)} שעות.`,
  ],
  cancel: [
    '❌ ביטול:',
    `• עד ${hours(FREE_CANCEL_MINUTES)} שעות לפני תחילת המשמרת – ביטול עצמי חופשי מ"המשמרות שלי".`,
    `• פחות מ-${hours(FREE_CANCEL_MINUTES)} שעות לפני – נשלחת בקשת ביטול למזין המשמרות. המקום נשאר תפוס עד שיאשר או ידחה.`,
    '• אם המשמרת מלאה אפשר להצטרף לרשימת המתנה, ומי שממתין עולה כשמתפנה מקום.',
  ],
  car: [
    '🚓 ניידת נוספת:',
    '• פתוחה למוסמכי שלב ב׳ ושלב ג׳ בלבד.',
    '• פועלת במקביל למשמרת ולא תופסת מקום רגיל – אפשר לפתוח גם כשהמשמרת מלאה.',
    `• אותם חוקים: מינימום ${hours(MIN_REGISTRATION_MINUTES)} שעות ומשמרת אחת ביום. מזין המשמרות מקבל הודעה מיוחדת.`,
  ],
};

export function answerRules(topic: RulesTopic): AssistantAnswer {
  const base = { intent: 'rules' as const, suggestions: [...others('rules')] };
  if (topic !== 'all') return { ...base, answer: RULES[topic].join('\n') };
  const order: Exclude<RulesTopic, 'all'>[] = ['minimum', 'cancel', 'short', 'levels', 'car'];
  return { ...base, answer: ['📋 חוקי הרישום והביטול', '', ...order.flatMap((t, i) => (i ? ['', ...RULES[t]] : RULES[t]))].join('\n') };
}

export function answerGreeting(): AssistantAnswer {
  return { intent: 'greeting', answer: ASSISTANT_GREETING, suggestions: [...ASSISTANT_SUGGESTIONS] };
}

export function answerFallback(): AssistantAnswer {
  return {
    intent: 'fallback',
    suggestions: [...ASSISTANT_SUGGESTIONS, '👤 המשמרות שלי'],
    answer: [
      'לא בטוחה שהבנתי 🙂 אני יכולה לעזור עם:',
      '• 🚨 חוסרים ומשמרות שחסר בהן נהג',
      '• 📅 משמרות פנויות (השבוע, היום, מחר או בשבוע הבא)',
      '• 👤 המשמרות שלך וכמה עשית החודש',
      '• 🏆 הטופ 5 של החודש',
      '• 📋 חוקי רישום, ביטול, משמרת מקוצרת, ניידת נוספת ודרגות',
      '',
      'אפשר ללחוץ על אחת ההצעות או לכתוב שאלה.',
    ].join('\n'),
  };
}
