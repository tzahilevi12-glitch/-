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

function hoursLabel(minutes: number): string {
  const h = minutes / 60;
  const text = Number.isInteger(h) ? String(h) : h.toFixed(1).replace(/\.0$/, '');
  return `${text} שעות`;
}

/** 🏆 Top 3 volunteers this calendar month (by hours, then shifts). Hidden when nobody has hours yet. */
export function Leaderboard() {
  const [data, setData] = useState<{ month: string; top: LeaderboardEntry[] } | null>(null);
  useEffect(() => {
    api<{ month: string; top: LeaderboardEntry[] }>('/public/leaderboard')
      .then(setData)
      .catch(() => setData(null));
  }, []);
  if (!data || data.top.length === 0) return null;
  const monthName = new Date(`${data.month}-01T00:00:00Z`).toLocaleDateString('he-IL', { month: 'long', timeZone: 'UTC' });
  return (
    <section className="leaderboard" aria-labelledby="lb-title">
      <div className="leaderboard-head">
        <h2 id="lb-title">🏆 מצטייני החודש</h2>
        <p className="muted small">חודש {monthName} · לפי שעות משמרת (שבוצעו ומתוכננות)</p>
      </div>
      <ol className="leaderboard-list">
        {data.top.map((t) => (
          <li key={t.rank} className={`leader rank-${t.rank}`}>
            <span className="leader-medal" aria-label={`מקום ${t.rank}`}>
              {MEDAL[t.rank - 1]}
            </span>
            <span className="leader-name">
              <span className="leader-name-text">{t.fullName}</span>
              <span className="leader-badges">
                <CertMark certification={t.certification} />
                {t.hasDrivingChip && <DriverBadge compact />}
              </span>
            </span>
            <span className="leader-score">
              <strong>{hoursLabel(t.minutes)}</strong>
              <span className="muted small">{t.shifts === 1 ? 'משמרת אחת' : `${t.shifts} משמרות`}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="leaderboard-foot">כל הכבוד ותודה על ההתנדבות! 💙</p>
    </section>
  );
}
