import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { bookShift, takePendingShift } from '../deepLink.ts';
import { MonthLeaders, UrgentBanner, useMonthLeaders } from './Engagement.tsx';
import { api } from '../api.ts';
import type { BoardShift, Certification, GuestShift } from '../types.ts';
import { SHIFT_LABEL, addDays, dayLabel, isCertified, range, todayLocal } from '../format.ts';
import { BadgeLegend, CarIcon, CertMark, DriverBadge, LoadState, ShiftBadge, ShortShiftBadge, toast, useLoad } from '../ui.tsx';
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
  const [selected, setSelected] = useState<{ shift: BoardShift; mode: 'regular' | 'car' } | null>(null);
  const canOpenCar = isCertified(certification); // שלב ב' / שלב ג'
  const leaders = useMonthLeaders();

  /** Scroll to a shift and open its sign-up (from the urgent banner or a direct link). */
  const openShift = useCallback(
    (s: BoardShift) => {
      document.getElementById(`shift-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (s.myRegistration) return toast('כבר נרשמת למשמרת הזו.');
      if (s.iHaveShiftThatDay) return toast('כבר יש לך משמרת ביום הזה. אפשר להירשם למשמרת אחת ביום.', 'error');
      if (s.seatsLeft === 0) {
        if (canOpenCar) return setSelected({ shift: s, mode: 'car' });
        return toast('המשמרת כבר התמלאה. תודה על הרצון לעזור!', 'error');
      }
      setSelected({ shift: s, mode: 'regular' });
    },
    [canOpenCar],
  );

  // Direct link (/?shiftId=…): open that shift once the board has loaded.
  useEffect(() => {
    if (readOnly || !data) return;
    const handle = () => {
      const id = takePendingShift();
      if (!id) return;
      const s = data.shifts.find((x) => x.id === id);
      if (s) openShift(s);
      else toast('המשמרת מהקישור כבר לא פתוחה להרשמה (ייתכן שהתמלאה, התחילה או עוד לא פורסמה). הנה כל המשמרות הפתוחות.', 'error');
    };
    handle();
    window.addEventListener('pv:pending-shift', handle);
    return () => window.removeEventListener('pv:pending-shift', handle);
  }, [data, readOnly, openShift]);

  if (!data) return <LoadState error={loading ? null : error} onRetry={reload} />;

  const urgent = data.shifts.filter((s) => s.urgent && (readOnly || (!s.myRegistration && !s.iHaveShiftThatDay)));

  const days = new Map<string, BoardShift[]>();
  for (const s of data.shifts) days.set(s.date, [...(days.get(s.date) ?? []), s]);

  return (
    <section className="page board-layout">
      <div className="board-main">
      <UrgentBanner shifts={urgent} onBook={(s) => (readOnly ? bookShift(s.id) : openShift(s))} />
      <MonthLeaders data={leaders} variant="card" />
      <h1 className="page-title">לוח משמרות</h1>
      <p className="page-sub">
        {readOnly
          ? 'צפייה בלבד: המשמרות שפורסמו ומי רשום לכל משמרת. כדי להירשם צריך להיכנס כמתנדב.'
          : isCertified(certification)
          ? 'כל המשמרות שפורסמו, כולל מלאות. כמוסמך/ת אפשר להירשם גם כ״ניידת נוספת״ – במקביל למשמרת, בלי לתפוס מקום רגיל. אפשר להירשם למשמרת אחת ביום.'
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

      {[...days].map(([date, shifts], dayIndex) => (
        <div key={date} className="day" style={{ '--i': Math.min(dayIndex, 8) } as CSSProperties}>
          <h2 className="day-head">
            <CalendarIcon size={17} />
            {dayHeading(date)}
          </h2>
          <ul className="shift-list">
            {shifts.map((s) => {
              const mine = s.myRegistration;
              const blocked = !mine && s.iHaveShiftThatDay;
              // Extra patrol cars are listed apart from the regular roster and don't count toward its slots.
              const regularPeople = (s.registeredPeople ?? []).filter((p) => !p.opensNewCar);
              const carPeople = (s.registeredPeople ?? []).filter((p) => p.opensNewCar);
              const regularCount = s.registeredPeople ? regularPeople.length : s.registeredCount;
              const full = s.seatsLeft === 0;
              // Pulse only what is really urgent (next 48 h, short of volunteers or of a driver);
              // a driver gap further ahead gets a steady crimson outline instead.
              const soon = typeof s.startsInMinutes === 'number' && s.startsInMinutes > 0 && s.startsInMinutes <= 48 * 60;
              const alert = s.urgent || (soon && s.driverAlert === 'RED') ? ' is-urgent' : s.driverAlert === 'RED' && !full ? ' has-driver-gap' : '';
              return (
                <li key={s.id} id={`shift-${s.id}`} className={`shift-row type-${s.shiftType.toLowerCase()}${mine ? ' is-mine' : ''}${alert}`}>
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
                          <span className="shift-people-count">{regularCount === 1 ? 'רשום אחד:' : `${regularCount} רשומים:`}</span>
                          {s.registeredPeople ? (
                            <ul className="people-list">
                              {regularPeople.length === 0 && <li className="muted">אין עדיין רשומים למקומות הרגילים</li>}
                              {regularPeople.map((p, i) => (
                                <li key={i} className="people-item">
                                  {p.fullName}
                                  <CertMark certification={p.certification} />
                                  {p.hasDrivingChip && <DriverBadge compact />}
                              {p.shortShift && <ShortShiftBadge startTime={p.startTime} endTime={p.endTime} />}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            s.registeredNames.map(isolate).join(', ')
                          )}
                        </>
                      )}
                    </div>
                    {carPeople.length > 0 && (
                      <div className="shift-cars">
                        <span className="shift-cars-head">
                          <CarIcon size={14} />
                          {carPeople.length === 1 ? 'ניידת נוספת:' : `${carPeople.length} ניידות נוספות:`}
                        </span>
                        <ul className="people-list">
                          {carPeople.map((p, i) => (
                            <li key={i} className="people-item">
                              {p.fullName}
                              <CertMark certification={p.certification} />
                              {p.hasDrivingChip && <DriverBadge compact />}
                              {p.shortShift && <ShortShiftBadge startTime={p.startTime} endTime={p.endTime} />}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  <div className="shift-action">
                    {readOnly ? null : mine ? (
                      <span className={`mine-tag${mine.status === 'PENDING' ? ' is-pending' : ''}`}>
                        {mine.status === 'APPROVED' && <CheckIcon size={14} strokeWidth={2.6} />}
                        {mine.opensNewCar && <CarIcon size={14} />}
                        {mine.status === 'PENDING' ? 'ברשימת המתנה' : `${mine.opensNewCar ? 'ניידת נוספת' : 'נרשמת'}: ${range(mine.startTime, mine.endTime)}`}
                      </span>
                    ) : blocked ? (
                      <span className="muted small">יש לך משמרת ביום הזה</span>
                    ) : (
                      <div className="shift-buttons">
                        {full ? (
                          <span className="muted small">המשמרת מלאה</span>
                        ) : (
                          <button className="btn btn-primary" onClick={() => setSelected({ shift: s, mode: 'regular' })}>
                            <PlusIcon size={16} strokeWidth={2.4} />
                            הרשמה
                          </button>
                        )}
                        {/* Separate extra-car slot: shown only to שלב ב'/ג' (the server enforces it too). */}
                        {canOpenCar && (
                          <button className="btn btn-car" onClick={() => setSelected({ shift: s, mode: 'car' })}>
                            <CarIcon size={16} />
                            ניידת נוספת
                          </button>
                        )}
                      </div>
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
          shift={selected.shift}
          mode={selected.mode}
          isDriver={isDriver}
          certification={certification}
          onClose={() => setSelected(null)}
          onDone={() => {
            setSelected(null);
            void reload();
          }}
        />
      )}
      </div>
      <MonthLeaders data={leaders} variant="sidebar" />
    </section>
  );
}
