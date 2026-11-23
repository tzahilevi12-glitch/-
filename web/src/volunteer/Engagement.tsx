import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import type { BoardShift, LeaderboardEntry } from '../types.ts';
import { SHIFT_LABEL, range, shortDay, todayLocal, addDays } from '../format.ts';
import { CertMark, DriverBadge } from '../ui.tsx';
import { CalendarIcon, ClockIcon, ShiftTypeIcon, UsersIcon } from '../icons.tsx';

/** "בעוד 5 שעות" / "בעוד יום ו-3 שעות" */
function startsIn(min: number): string {
  if (min < 60) return `בעוד ${min} דקות`;
  const h = Math.round(min / 60);
  if (h < 24) return h === 1 ? 'בעוד שעה' : h === 2 ? 'בעוד שעתיים' : `בעוד ${h} שעות`;
  const d = Math.floor(h / 24);
  const rest = h - d * 24;
  const days = d === 1 ? 'יום' : 'יומיים';
  return rest === 0 ? `בעוד ${days}` : `בעוד ${days} ו-${rest === 1 ? 'שעה' : rest === 2 ? 'שעתיים' : `${rest} שעות`}`;
}

function dayName(iso: string): string {
  const today = todayLocal();
  const d = shortDay(iso);
  if (iso === today) return `היום · ${d.day}`;
  if (iso === addDays(today, 1)) return `מחר · ${d.day}`;
  return `${d.weekday} · ${d.day}`;
}

/**
 * 🚨 Urgent shifts: start within 48 hours and still short of regular volunteers.
 * Hidden when there are none. `onBook` opens the sign-up for that shift.
 */
export function UrgentBanner({ shifts, onBook }: { shifts: BoardShift[]; onBook: (s: BoardShift) => void }) {
  if (shifts.length === 0) return null;
  return (
    <section className="urgent" aria-labelledby="urgent-title">
      <h2 id="urgent-title" className="urgent-title">
        🚨 משמרות דחופות ל-48 השעות הקרובות
        {shifts.length > 1 && <span className="urgent-count">({shifts.length})</span>}
      </h2>
      <ul className="urgent-list">
        {shifts.map((s) => (
          <li key={s.id} className={`urgent-card type-${s.shiftType.toLowerCase()}`}>
            <div className="urgent-card-top">
              <span className={`shift-icon type-icon-${s.shiftType.toLowerCase()}`}>
                <ShiftTypeIcon type={s.shiftType} size={20} />
              </span>
              <div className="urgent-card-text">
                <p className="urgent-card-title">משמרת {SHIFT_LABEL[s.shiftType]}</p>
                <p className="urgent-card-meta">
                  <span className="meta-item">
                    <CalendarIcon size={14} />
                    {dayName(s.date)}
                  </span>
                  <span className="meta-item">
                    <ClockIcon size={14} />
                    {range(s.startTime, s.endTime)}
                  </span>
                </p>
              </div>
            </div>
            <p className="urgent-missing">
              <UsersIcon size={15} />
              {s.seatsLeft === 1 ? 'חסר מתנדב 1' : `חסרים ${s.seatsLeft} מתנדבים`}
              {s.driversMissing > 0 && <span className="urgent-driver">· דרוש נהג</span>}
              {typeof s.startsInMinutes === 'number' && <span className="urgent-when">{startsIn(s.startsInMinutes)}</span>}
            </p>
            <button className="btn btn-book" onClick={() => onBook(s)}>
              שריין אותי בלחיצה
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

const MEDAL = ['🥇', '🥈', '🥉'];

export interface MonthLeadersData {
  month: string; // YYYY-MM
  top: LeaderboardEntry[];
}

/** Loads "מובילים החודש" once for the board (both layouts use the same data). */
export function useMonthLeaders(): MonthLeadersData | null {
  const [data, setData] = useState<MonthLeadersData | null>(null);
  useEffect(() => {
    api<MonthLeadersData>('/public/leaderboard')
      .then(setData)
      .catch(() => setData(null));
  }, []);
  return data;
}

function monthName(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString('he-IL', { month: 'long', timeZone: 'UTC' });
}

const shiftsLabel = (n: number) => (n === 1 ? 'משמרת אחת' : `${n} משמרות`);

function hoursText(minutes: number): string {
  const h = minutes / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} שעות`;
}

function LeadersList({ top }: { top: LeaderboardEntry[] }) {
  return (
    <ol className="leaders-list">
      {top.slice(0, 5).map((t) => (
        <li key={t.rank} className={`leaders-row rank-${t.rank}`}>
          <span className="leaders-rank">
            {t.rank <= 3 ? (
              <span className="leaders-medal" aria-hidden="true">
                {MEDAL[t.rank - 1]}
              </span>
            ) : (
              <span className="leaders-num-badge" aria-hidden="true">
                {t.rank}
              </span>
            )}
            <span className="leaders-place">מקום {t.rank}</span>
          </span>
          <span className="leaders-who">
            <span className="leaders-name">{t.fullName}</span>
            <span className="leaders-badges">
              <CertMark certification={t.certification} compact />
              {t.hasDrivingChip && <DriverBadge compact />}
            </span>
          </span>
          <span className="leaders-count" title={hoursText(t.minutes)}>
            {shiftsLabel(t.shifts)}
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * "🏆 טופ 5 מובילים החודש - <month>": the 5 volunteers with the most shifts this calendar month
 * (self sign-ups and manual registrations, regular slots and extra patrol cars). Starts fresh on
 * the 1st of every month (Israel time).
 *   variant "sidebar": compact sticky navy panel beside the board (wide screens);
 *   variant "card": the same card above the board (phones).
 */
export function MonthLeaders({ data, variant }: { data: MonthLeadersData | null; variant: 'sidebar' | 'card' }) {
  if (!data) return null;
  const id = `leaders-title-${variant}`;
  return (
    <aside className={`leaders leaders-${variant}`} aria-labelledby={id}>
      <h2 id={id} className="leaders-title">
        🏆 טופ 5 מובילים החודש - {monthName(data.month)}
      </h2>
      {data.top.length === 0 ? (
        <p className="leaders-empty">החודש רק התחיל – הירשמו למשמרת ותופיעו כאן!</p>
      ) : (
        <>
          <LeadersList top={data.top} />
          <p className="leaders-foot">לפי מספר משמרות החודש · מתאפס ב-1 לכל חודש</p>
        </>
      )}
    </aside>
  );
}
