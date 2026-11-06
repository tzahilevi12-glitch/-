import { useState } from 'react';
import { api } from '../api.ts';
import type { BoardShift } from '../types.ts';
import { SHIFT_LABEL, addDays, dayLabel, range, todayLocal } from '../format.ts';
import { LoadState, ShiftBadge, useLoad } from '../ui.tsx';
import { SignUpSheet } from './SignUpSheet.tsx';

function dayHeading(iso: string): string {
  const today = todayLocal();
  if (iso === today) return `היום, ${dayLabel(iso)}`;
  if (iso === addDays(today, 1)) return `מחר, ${dayLabel(iso)}`;
  return dayLabel(iso);
}

export function ShiftBoard({ isDriver }: { isDriver: boolean }) {
  const { data, error, loading, reload } = useLoad(() => api<{ shifts: BoardShift[] }>('/shifts'));
  const [selected, setSelected] = useState<BoardShift | null>(null);

  if (!data) return <LoadState error={loading ? null : error} onRetry={reload} />;

  const days = new Map<string, BoardShift[]>();
  for (const s of data.shifts) days.set(s.date, [...(days.get(s.date) ?? []), s]);

  return (
    <section className="page">
      <h1 className="page-title">לוח משמרות</h1>
      <p className="page-sub">משמרות שפורסמו ויש בהן מקום. אפשר להירשם למשמרת אחת ביום.</p>

      {days.size === 0 && (
        <div className="empty">
          <p>אין כרגע משמרות פתוחות. כשמזין המשמרות יפרסם את השבוע הבא, תופיע כאן הודעה.</p>
        </div>
      )}

      {[...days].map(([date, shifts]) => (
        <div key={date} className="day">
          <h2 className="day-head">{dayHeading(date)}</h2>
          <ul className="shift-list">
            {shifts.map((s) => {
              const mine = s.myRegistration;
              const blocked = !mine && s.iHaveShiftThatDay;
              const waitlist = s.driverOnly && !isDriver;
              return (
                <li key={s.id} className={`shift-row type-${s.shiftType.toLowerCase()}${mine ? ' is-mine' : ''}`}>
                  <div className="shift-main">
                    <div className="shift-name">
                      {SHIFT_LABEL[s.shiftType]}
                      <span className="shift-hours">{range(s.startTime, s.endTime)}</span>
                    </div>
                    <div className="shift-meta">
                      <ShiftBadge badge={s.badge} driverOnly={s.driverOnly} />
                      <span className="muted small">
                        נותרו {s.seatsLeft} מתוך {s.maxVolunteers} מקומות
                      </span>
                    </div>
                  </div>
                  <div className="shift-action">
                    {mine ? (
                      <span className={`mine-tag${mine.status === 'PENDING' ? ' is-pending' : ''}`}>
                        {mine.status === 'PENDING' ? 'ברשימת המתנה' : `נרשמת: ${range(mine.startTime, mine.endTime)}`}
                      </span>
                    ) : blocked ? (
                      <span className="muted small">יש לך משמרת ביום הזה</span>
                    ) : (
                      <button className={`btn ${waitlist ? 'btn-ghost' : 'btn-primary'}`} onClick={() => setSelected(s)}>
                        {waitlist ? 'הצטרפות להמתנה' : 'הרשמה'}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {selected && (
        <SignUpSheet
          shift={selected}
          isDriver={isDriver}
          onClose={() => setSelected(null)}
          onDone={() => {
            setSelected(null);
            void reload();
          }}
        />
      )}
    </section>
  );
}
