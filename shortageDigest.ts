import { prisma } from '../lib/prisma.ts';
import { nowInStation } from '../lib/dates.ts';
import { isDigestDue } from '../domain/shortageSummary.ts';
import { sendTelegram, telegramConfig } from '../lib/telegram.ts';
import { buildShortageSummary } from './shortageService.ts';

/**
 * Automatic "ריכוז חוסרים" to the commanders' Telegram group, every 2 days from 10:00.
 *
 * Settings (Render → Environment, all optional):
 *   SHORTAGE_DIGEST=off            turn the automatic message off
 *   SHORTAGE_DIGEST_HOUR=10        first hour of the day it may be sent (station time)
 *   SHORTAGE_DIGEST_EVERY_DAYS=2   days between messages
 *
 * Two things can trigger it; both just ask "is it due?", and the database row makes sure it is
 * sent once per period even if both fire, or the server restarts:
 *   1. a check every 5 minutes while the server is awake;
 *   2. the wake-up link /api/public/cron/shortage-digest?key=CRON_SECRET, called daily by a free
 *      external scheduler (cron-job.org). Needed on Render's free plan, which sleeps when idle.
 */
const JOB = 'shortage-digest';

export function digestSettings(env: Record<string, string | undefined> = process.env) {
  const hour = Number(env.SHORTAGE_DIGEST_HOUR ?? 10);
  const everyDays = Number(env.SHORTAGE_DIGEST_EVERY_DAYS ?? 2);
  return {
    enabled: (env.SHORTAGE_DIGEST ?? 'on').toLowerCase() !== 'off',
    hour: Number.isInteger(hour) && hour >= 0 && hour <= 20 ? hour : 10,
    everyDays: Number.isInteger(everyDays) && everyDays >= 1 ? everyDays : 2,
  };
}

export type DigestResult =
  | { status: 'SENT'; shiftsWithShortage: number }
  | { status: 'NOT_DUE' | 'DISABLED' | 'NO_TELEGRAM' | 'ALREADY_CLAIMED' }
  | { status: 'SEND_FAILED' };

/** Claim today's run atomically. Returns the previous date (to undo on failure) or undefined if not claimed. */
async function claim(today: string): Promise<{ previous: string | null } | undefined> {
  const row = await prisma.scheduledJob.findUnique({ where: { name: JOB } });
  if (!row) {
    try {
      await prisma.scheduledJob.create({ data: { name: JOB, lastRunDate: today } });
      return { previous: null };
    } catch {
      return undefined; // created at the same moment by the other trigger
    }
  }
  // Only succeeds if nobody else has moved lastRunDate since we read it.
  const r = await prisma.scheduledJob.updateMany({
    where: { name: JOB, lastRunDate: row.lastRunDate },
    data: { lastRunDate: today },
  });
  return r.count === 1 ? { previous: row.lastRunDate } : undefined;
}

async function release(previous: string | null, today: string) {
  if (previous === null) await prisma.scheduledJob.deleteMany({ where: { name: JOB, lastRunDate: today } });
  else await prisma.scheduledJob.updateMany({ where: { name: JOB, lastRunDate: today }, data: { lastRunDate: previous } });
}

/** Send the summary to Telegram if it is due. Never throws. */
export async function runShortageDigestIfDue(now = new Date()): Promise<DigestResult> {
  try {
    const cfg = digestSettings();
    if (!cfg.enabled) return { status: 'DISABLED' };
    if (!telegramConfig()) return { status: 'NO_TELEGRAM' };
    const station = nowInStation(now);
    const row = await prisma.scheduledJob.findUnique({ where: { name: JOB } });
    if (!isDigestDue(row?.lastRunDate ?? null, station, cfg)) return { status: 'NOT_DUE' };

    const claimed = await claim(station.date);
    if (!claimed) return { status: 'ALREADY_CLAIMED' };

    const summary = await buildShortageSummary({ now, format: 'volunteers' });
    const ok = await sendTelegram(summary.text);
    if (!ok) {
      await release(claimed.previous, station.date); // try again at the next check
      return { status: 'SEND_FAILED' };
    }
    console.log(`[shortage-digest] sent (${summary.shiftsWithShortage} shifts with shortages)`);
    return { status: 'SENT', shiftsWithShortage: summary.shiftsWithShortage };
  } catch (err) {
    console.error(`[shortage-digest] failed: ${(err as Error).message}`);
    return { status: 'SEND_FAILED' };
  }
}

/** Check every 5 minutes while the server is awake (first check 1 minute after start). */
export function startShortageScheduler(): void {
  const cfg = digestSettings();
  if (!cfg.enabled) {
    console.log('Shortage summary to Telegram: OFF (SHORTAGE_DIGEST=off)');
    return;
  }
  console.log(`Shortage summary to Telegram: every ${cfg.everyDays} days from ${String(cfg.hour).padStart(2, '0')}:00`);
  const tick = () => void runShortageDigestIfDue();
  setTimeout(tick, 60_000).unref();
  setInterval(tick, 5 * 60_000).unref();
}
