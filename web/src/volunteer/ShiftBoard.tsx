import { useState } from 'react';
import { api } from '../api.ts';
import type { BoardShift, Certification, GuestShift } from '../types.ts';
import { SHIFT_LABEL, addDays, dayLabel, isCertified, range, todayLocal } from '../format.ts';
import { BadgeLegend, CertMark, DriverBadge, LoadState, ShiftBadge, useLoad } from '../ui.tsx';
import { CalendarIcon, CheckIcon, ClockIcon, PlusIcon, ShiftTypeIcon, UsersIcon } from '../icons.tsx';
import { SignUpSheet } from './SignUpSheet.tsx';

/** First-strong isolate: a name in Latin or Hebrew letters keeps the line's punctuation in place. */
const isolate = (name: string) => `\u2068${name}\u2069`;

function dayHeading(iso: string): string {
  const today = todayLocal();
  if (iso === today) return `היום, ${dayLabel(iso)}`;
  if (iso === addDays(today, 1)) return `מחר, ${dayLabel(iso)}`;
  return dayLabel(iso);
}

/**
 * The shift board. With readOnly (guest view) it loads the public board and shows
 * shifts, counts and names only: no sign-up buttons and nothing personal.
 */
export function ShiftBoard({
  isDriver = false,
  certification = 'NONE',
  readOnly = false,
}: {
  isDriver?: boolean;
  certification?: Certification;
  readOnly?: boolean;
}) {
  const { data, error, loading, reload } = useLoad(() =>
    readOnly
      ? api<{ shifts: GuestShift[] }>('/public/board').then((r) => ({
          shifts: r.shifts.map((s): BoardShift => ({ ...s, myRegistration: null, iHaveShiftThatDay: false })),
        }))
      : api<{ shifts: BoardShift[] }>('/shifts'),
  );
  const [selected, setSelected] = useState<BoardShift | null>(null);

  if (!data) return <LoadState error={loading ? null : error} onRetry={reload} />;

  const days = new Map<string, BoardShift[]>();
  for (const s of data.shifts) days.set(s.date, [...(days.get(s.date) ?? []), s]);

  return (
    <section className="page">
      <h1 className="page-title">לוח משמרות</h1>
      <p className="page-sub">
        {readOnly
          ? 'צפייה בלבד: המשמרות שפורסמו ומי רשום לכל משמרת. כדי להירשם צריך להיכנס כמתנדב.'
          : isCertified(certification)
          ? 'כל המשמרות שפורסמו, כולל מלאות (כמוסמך אפשר לפתוח ניידת נוספת). אפשר להירשם למשמרת אחת ביום.'
          : 'משמרות שפורסמו ויש בהן מקום. אפשר להירשם למשמרת אחת ביום.'}
      </p>
      {days.size > 0 && <BadgeLegend />}

      {days.size === 0 && (
        <div className="empty">
          <span className="empty-icon">
            <CalendarIcon size={28} />
          </span>
          <p>אין כרגע משמרות פתוחות. כשמזין המשמרות יפרסם את השבוע הבא, תופיע כאן הודעה.</p>
        </div>
      )}

      {[...days].map(([date, shifts]) => (
        <div key={date} className="day">
          <h2 className="day-head">
            <CalendarIcon size={17} />
            {dayHeading(date)}
          </h2>
          <ul className="shift-list">
            {shifts.map((s) => {
              const mine = s.myRegistration;
              const blocked = !mine && s.iHaveShiftThatDay;
              return (
                <li key={s.id} className={`shift-row type-${s.shiftType.toLowerCase()}${mine ? ' is-mine' : ''}`}>
                  <span className={`shift-icon type-icon-${s.shiftType.toLowerCase()}`}>
                    <ShiftTypeIcon type={s.shiftType} size={22} />
                  </span>
                  <div className="shift-main">
                    <div className="shift-name">
                      {SHIFT_LABEL[s.shiftType]}
                      <span className="shift-hours">
                        <ClockIcon size={14} />
                        {range(s.startTime, s.endTime)}
                      </span>
                    </div>
                    <div className="shift-meta">
                      <ShiftBadge badge={s.badge} />
                      <span className="muted small">
                        {s.seatsLeft > 0 ? `נותרו ${s.seatsLeft} מתוך ${s.maxVolunteers} מקומות` : 'כל המקומות תפוסים'}
                      </span>
                    </div>
                    <div className="shift-people">
                      <UsersIcon size={13} />
                      {s.registeredCount === 0 ? (
                        'עדיין אין רשומים'
                      ) : (
                        <>
                          <span className="shift-people-count">{s.registeredCount === 1 ? 'רשום אחד:' : `${s.registeredCount} רשומים:`}</span>
                          {s.registeredPeople ? (
                            <ul className="people-list">
                              {s.registeredPeople.map((p, i) => (
                                <li key={i} className="people-item">
                                  {p.fullName}
                                  <CertMark certification={p.certification} />
                                  {p.hasDrivingChip && <DriverBadge compact />}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            s.registeredNames.map(isolate).join(', ')
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="shift-action">
                    {readOnly ? null : mine ? (
                      <span className={`mine-tag${mine.status === 'PENDING' ? ' is-pending' : ''}`}>
                        {mine.status === 'APPROVED' && <CheckIcon size={14} strokeWidth={2.6} />}
                        {mine.status === 'PENDING' ? 'ברשימת המתנה' : `${mine.opensNewCar ? 'נרשמת עם ניידת' : 'נרשמת'}: ${range(mine.startTime, mine.endTime)}`}
                      </span>
                    ) : blocked ? (
                      <span className="muted small">יש לך משמרת ביום הזה</span>
                    ) : (
                      <button className="btn btn-primary" onClick={() => setSelected(s)}>
                        <PlusIcon size={16} strokeWidth={2.4} />
                        {s.badge === 'FULL' ? 'הרשמה (ניידת נוספת)' : 'הרשמה'}
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
          certification={certification}
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
