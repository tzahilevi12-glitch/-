/**
 * "🤖 עוזרת חמ"ל": answers a Hebrew question from live database data.
 * No external AI service — intent detection and texts are in domain/assistant.ts.
 */
import { prisma } from '../lib/prisma.ts';
import { fromIsoDate, nowInStation, toIsoDate } from '../lib/dates.ts';
import { absoluteMinute, addDays, formatInterval, isWholeShift } from '../domain/registrationRules.ts';
import { URGENT_WINDOW_MINUTES, monthRange } from '../domain/engagement.ts';
import {
  answerAvailable,
  answerFallback,
  answerGreeting,
  answerLeaders,
  answerMine,
  answerRules,
  answerShortages,
  detectIntent,
  detectRange,
  detectRulesTopic,
  type AssistantAnswer,
  type AssistantCert,
  type AssistantShift,
  type MyShiftsData,
} from '../domain/assistant.ts';
import { loadBoard } from './boardService.ts';
import { monthlyLeaderboard } from './leaderboardService.ts';
import { registrationInterval, windowOf } from './shiftState.ts';

export interface AssistantViewer {
  id: string;
  fullName: string;
  role: string;
  certification: string | null;
  hasDrivingChip: boolean;
}

/** Published shifts that haven't ended (status OPEN or FILLED only — valid ShiftStatus values). */
async function boardShifts(viewer: AssistantViewer | null): Promise<AssistantShift[]> {
  const board = await loadBoard(true);
  let mine = new Set<string>();
  let myDays = new Set<string>();
  if (viewer && viewer.role === 'VOLUNTEER') {
    const regs = await prisma.shiftRegistration.findMany({
      where: {
        userId: viewer.id,
        status: { in: ['APPROVED', 'PENDING'] },
        shift: { date: { gte: fromIsoDate(addDays(nowInStation().date, -1)) } },
      },
      select: { shiftId: true, shift: { select: { date: true } } },
    });
    mine = new Set(regs.map((r) => r.shiftId));
    myDays = new Set(regs.map((r) => toIsoDate(r.shift.date)));
  }
  return board.map(({ view }) => {
    const soon = view.startsInMinutes > 0 && view.startsInMinutes <= URGENT_WINDOW_MINUTES;
    return {
      id: view.id,
      date: view.date,
      shiftType: view.shiftType,
      startTime: view.startTime,
      endTime: view.endTime,
      maxVolunteers: view.maxVolunteers,
      seatsLeft: Math.max(0, view.seatsLeft),
      needsDriver: view.driverAlert === 'RED',
      driverOnly: Boolean(view.driverOnly),
      urgent: view.urgent || (soon && view.driverAlert === 'RED'),
      mine: mine.has(view.id),
      sameDay: !mine.has(view.id) && myDays.has(view.date),
    };
  });
}

async function myShifts(viewer: AssistantViewer): Promise<MyShiftsData> {
  const now = nowInStation();
  const nowAbs = absoluteMinute(now.date, now.minute);
  const { from, to, month } = monthRange(now.date);

  const [upcomingRegs, monthRegs, leaders] = await Promise.all([
    prisma.shiftRegistration.findMany({
      where: {
        userId: viewer.id,
        status: { in: ['APPROVED', 'PENDING'] },
        shift: { date: { gte: fromIsoDate(addDays(now.date, -1)) }, status: { not: 'COMPLETED' } },
      },
      include: { shift: true },
      orderBy: [{ shift: { date: 'asc' } }, { shift: { startTime: 'asc' } }],
    }),
    prisma.shiftRegistration.findMany({
      where: { userId: viewer.id, status: 'APPROVED', shift: { date: { gte: fromIsoDate(from), lt: fromIsoDate(to) } } },
      include: { shift: true },
    }),
    monthlyLeaderboard(),
  ]);

  const upcoming = upcomingRegs
    .map((r) => {
      const window = windowOf(r.shift);
      const interval = registrationInterval(window, r);
      const date = toIsoDate(r.shift.date);
      const hours = formatInterval(interval);
      return {
        endsAt: absoluteMinute(date, interval.end),
        date,
        shiftType: r.shift.shiftType,
        startTime: hours.start,
        endTime: hours.end,
        status: r.status as 'APPROVED' | 'PENDING',
        opensNewCar: r.opensNewCar,
        partial: !isWholeShift(interval, window),
      };
    })
    .filter((u) => u.endsAt > nowAbs)
    .map(({ endsAt: _endsAt, ...u }) => u);

  const monthDone = monthRegs.filter((r) => {
    if (r.shift.status === 'COMPLETED') return true;
    const interval = registrationInterval(windowOf(r.shift), r);
    return absoluteMinute(toIsoDate(r.shift.date), interval.end) <= nowAbs;
  }).length;

  const me = leaders.top.find(
    (t) => t.fullName === viewer.fullName && t.certification === (viewer.certification ?? 'NONE') && t.hasDrivingChip === viewer.hasDrivingChip,
  );

  return { fullName: viewer.fullName, upcoming, monthApproved: monthRegs.length, monthDone, month, rank: me?.rank ?? null };
}

export async function askAssistant(question: string, viewer: AssistantViewer | null): Promise<AssistantAnswer> {
  const intent = detectIntent(question);
  const today = nowInStation().date;
  switch (intent) {
    case 'shortages':
      return answerShortages(await boardShifts(viewer), detectRange(question, today));
    case 'available':
      return answerAvailable(await boardShifts(viewer), detectRange(question, today), {
        certification: (viewer?.role === 'VOLUNTEER' ? viewer.certification : null) as AssistantCert | null,
      });
    case 'mine':
      if (!viewer) return answerMine(null);
      if (viewer.role === 'ADMIN') return answerMine('ADMIN');
      return answerMine(await myShifts(viewer));
    case 'leaders': {
      const board = await monthlyLeaderboard();
      return answerLeaders({ month: board.month, top: board.top });
    }
    case 'rules':
      return answerRules(detectRulesTopic(question));
    case 'greeting':
      return answerGreeting();
    default:
      return answerFallback();
  }
}
