import { useState } from 'react';
import { api } from '../api.ts';
import type { RosterShift, ShiftType, Week } from '../types.ts';
import { SHIFT_LABEL, SHIFT_TYPES, addDays, range, shortDay, todayLocal, weekRangeLabel } from '../format.ts';
import { BadgeLegend, CarIcon, CertMark, DriverBadge, LoadState, Sheet, ShortShiftBadge, toast, useLoad } from '../ui.tsx';
import { AlertIcon, CalendarIcon, ChevronIcon, ClockIcon, MegaphoneIcon, PlusIcon, ShiftTypeIcon, UsersIcon, HourglassIcon } from '../icons.tsx';
import { AddShiftsDialog } from './AddShiftsDialog.tsx';
import { ShiftPanel } from './ShiftPanel.tsx';

const defaultStart: Record<ShiftType, string> = { MORNING: '06:00', EVENING: '14:30', NIGHT: '21:30' };
const defaultEnd: Record<ShiftType, string> = { MORNING: '15:00', EVENING: '22:00', NIGHT: '07:00' };

function Cell({ shift, onOpen }: { shift: RosterShift; onOpen: () => void }) {
  // Extra patrol cars run in parallel: they are listed separately and never count toward the regular slots.
  const regular = shift.approved.filter((p) => !p.opensNewCar);
  const cars = shift.approved.filter((p) => p.opensNewCar);
  const shown = regular.slice(0, 4);
  const more = regular.length - shown.length;
  const green = shift.driverAlert === 'GREEN';
  const registered = shift.seatsTaken;
  return (
    <button
      className={`cell lamp-edge-${shift.driverAlert.toLowerCase()}${shift.published ? '' : ' is-draft'}${shift.status === 'COMPLETED' ? ' is-done' : ''}`}
      onClick={onOpen}
      aria-label={`${SHIFT_LABEL[shift.shiftType]} ${shift.date}: רשומים ${registered} מתוך ${shift.maxVolunteers} מבוקשים, ${green ? 'יש נהג' : 'אין נהג'}${cars.length ? `, ${cars.length} ניידות נוספות` : ''}`}
    >
      <span className={`cell-ratio${registered >= shift.maxVolunteers ? ' is-full' : ''}`}>
        <UsersIcon size={14} />
        רשומים <strong>{registered}</strong> / מבוקש <strong>{shift.maxVolunteers}</strong>
      </span>
      <span className="ratio-bar" aria-hidden="true">
        <span style={{ width: `${Math.min(100, (registered / Math.max(1, shift.maxVolunteers)) * 100)}%` }} />
      </span>
      <span className="cell-top">
        <span className={`lamp lamp-${shift.driverAlert.toLowerCase()}`}>{green ? 'יש נהג' : 'אין נהג'}</span>
      </span>
      <span className="cell-names">
        {shown.map((p) => (
          <span key={p.registrationId} className="cell-name">
            <span className="cell-name-text">{p.fullName}</span>
            <CertMark certification={p.certification} compact />
            {p.hasDrivingChip && <DriverBadge compact />}
            {p.shortShift && <ShortShiftBadge compact startTime={p.startTime} endTime={p.endTime} />}
            {p.cancelRequestedAt && (
              <span className="req-mark" title="ביקש/ה ביטול – ממתין לאישורך" aria-label="ביקש/ה ביטול">
                <HourglassIcon size={13} />
              </span>
            )}
            {p.isPartial && <span className="cell-hours">{range(p.startTime, p.endTime)}</span>}
          </span>
        ))}
        {more > 0 && <span className="muted small">ועוד {more}</span>}
        {regular.length === 0 && <span className="muted small">עדיין אין רשומים</span>}
      </span>
      {cars.length > 0 && (
        <span className="car-group">
          <span className="car-group-head">
            <CarIcon size={13} />
            {cars.length === 1 ? 'ניידת נוספת' : `${cars.length} ניידות נוספות`}
          </span>
          {cars.map((p) => (
            <span key={p.registrationId} className="cell-name">
              <span className="cell-name-text">{p.fullName}</span>
              <CertMark certification={p.certification} compact />
              {p.hasDrivingChip && <DriverBadge compact />}
            {p.shortShift && <ShortShiftBadge compact startTime={p.startTime} endTime={p.endTime} />}
              {p.cancelRequestedAt && (
                <span className="req-mark" title="ביקש/ה ביטול – ממתין לאישורך" aria-label="ביקש/ה ביטול">
                  <HourglassIcon size={13} />
                </span>
              )}
              {p.isPartial && <span className="cell-hours">{range(p.startTime, p.endTime)}</span>}
            </span>
          ))}
        </span>
      )}
      <span className="cell-foot">
        {shift.waitlist.length > 0 && <span className="wait-tag">{shift.waitlist.length === 1 ? 'ממתין אחד' : `${shift.waitlist.length} ממתינים`}</span>}
        {!shift.published && <span className="pub-tag is-draft">טיוטה</span>}
        {shift.status === 'COMPLETED' && <span className="pub-tag">הסתיימה</span>}
        {(shift.startTime !== defaultStart[shift.shiftType] || shift.endTime !== defaultEnd[shift.shiftType]) && (
          <span className="muted small">{range(shift.startTime, shift.endTime)}</span>
        )}
      </span>
    </button>
  );
}

export function WeekView({ refreshKey, onChanged }: { refreshKey: number; onChanged?: () => void }) {
  const [anchor, setAnchor] = useState(() => addDays(todayLocal(), 7)); // the scheduler usually plans next week
  const { data: week, error, loading, reload } = useLoad(() => api<Week>(`/admin/weeks/${anchor}`), [anchor, refreshKey]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState<null | { date: string; shiftType: ShiftType } | 'week'>(null);
  const [publishing, setPublishing] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!week) return <LoadState error={loading ? null : error} onRetry={reload} />;

  const days = Array.from({ length: 7 }, (_, i) => addDays(week.weekStart, i));
  const byKey = new Map(week.shifts.map((s) => [`${s.date}|${s.shiftType}`, s]));
  const open = week.shifts.find((s) => s.id === openId) ?? null;
  const today = todayLocal();
  const upcoming = week.shifts.filter((s) => s.date >= today && s.status !== 'COMPLETED');
  const needsDriver = upcoming.filter((s) => s.driverAlert === 'RED').length;
  const waiting = upcoming.reduce((n, s) => n + s.waitlist.length, 0);
  const extraCars = week.shifts.reduce((n, s) => n + s.extraVolunteers, 0);
  const label = weekRangeLabel(week.weekStart, week.weekEnd);

  async function publish() {
    setBusy(true);
    try {
      const r = await api<{ published: number }>(`/admin/weeks/${week!.weekStart}/publish`, { method: 'POST' });
      toast(`פורסמו ${r.published} משמרות. המתנדבים יראו הודעה בכניסה הבאה לאתר.`);
      setPublishing(false);
      void reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'הפרסום נכשל.', 'error');
    } finally {
      setBusy(false);
    }
  }

  const status =
    week.shifts.length === 0
      ? 'עוד לא תוכננו משמרות לשבוע הזה.'
      : week.draftCount === 0
        ? `פורסם. ${week.publishedCount} משמרות גלויות למתנדבים.`
        : week.publishedCount === 0
          ? `${week.draftCount} טיוטות שעוד לא פורסמו.`
          : `${week.publishedCount} פורסמו, ${week.draftCount} טיוטות חדשות שעוד לא פורסמו.`;

  return (
    <section className="cmd-page">
      <div className="week-head">
        <div className="week-nav">
          <button className="icon-btn icon-btn-outline" onClick={() => setAnchor(addDays(week.weekStart, -7))} aria-label="השבוע הקודם">
            <ChevronIcon dir="right" size={20} />
          </button>
          <h1>
            <CalendarIcon size={24} />
            {label}
          </h1>
          <button className="icon-btn icon-btn-outline" onClick={() => setAnchor(addDays(week.weekStart, 7))} aria-label="השבוע הבא">
            <ChevronIcon dir="left" size={20} />
          </button>
        </div>
        <p className="week-status">
          {status}
          {needsDriver > 0 && <span className="week-alert"> {needsDriver === 1 ? 'משמרת קרובה אחת בלי נהג.' : `${needsDriver} משמרות קרובות בלי נהג.`}</span>}
          {waiting > 0 && <span> {waiting === 1 ? 'מתנדב אחד ממתין לאישור.' : `${waiting} ממתינים לאישור.`}</span>}
        </p>
        <div className="week-actions">
          <button className="btn btn-ghost" onClick={() => setAdding('week')}>
            <PlusIcon size={17} />
            הוספת משמרות
          </button>
          <button className="btn btn-primary" disabled={week.draftCount === 0} onClick={() => setPublishing(true)}>
            <MegaphoneIcon size={17} />
            {week.publishedCount > 0 && week.draftCount > 0 ? `פרסום ${week.draftCount} חדשות` : 'פרסום השבוע'}
          </button>
        </div>
      </div>

      <div className="summary-strip" aria-label="סיכום השבוע">
        <span className="summary-item">
          <span className="summary-icon">
            <CalendarIcon size={18} />
          </span>
          <span>
            <strong>{week.shifts.length}</strong> משמרות בשבוע
          </span>
        </span>
        <span className={`summary-item${needsDriver > 0 ? ' is-alert' : ''}`}>
          <span className="summary-icon">
            <AlertIcon size={18} />
          </span>
          <span>
            <strong>{needsDriver}</strong> קרובות בלי נהג
          </span>
        </span>
        <span className={`summary-item${waiting > 0 ? ' is-warn' : ''}`}>
          <span className="summary-icon">
            <UsersIcon size={18} />
          </span>
          <span>
            <strong>{waiting}</strong> ממתינים לאישור
          </span>
        </span>
        <span className="summary-item">
          <span className="summary-icon">
            <CarIcon size={18} />
          </span>
          <span>
            <strong>{extraCars}</strong> ניידות נוספות
          </span>
        </span>
      </div>

      <BadgeLegend />

      <div className="grid-scroll">
        <div className="roster" role="table" aria-label="לוח שבועי">
          <div className="roster-row roster-days" role="row">
            <span role="columnheader" />
            {days.map((d) => (
              <span key={d} role="columnheader" className={`roster-day${d === today ? ' is-today' : d < today ? ' is-past' : ''}`}>
                <strong>{shortDay(d).weekday}</strong> {shortDay(d).day}
              </span>
            ))}
          </div>
          {SHIFT_TYPES.map((t) => (
            <div key={t} className="roster-row" role="row">
              <span role="rowheader" className="roster-type">
                <span className={`shift-icon shift-icon-sm type-icon-${t.toLowerCase()}`}>
                  <ShiftTypeIcon type={t} size={18} />
                </span>
                <span className="roster-type-label">{SHIFT_LABEL[t]}</span>
                <span className="roster-type-hours">
                  <ClockIcon size={12} />
                  {range(defaultStart[t], defaultEnd[t])}
                </span>
              </span>
              {days.map((d) => {
                const s = byKey.get(`${d}|${t}`);
                return (
                  <div key={d} role="cell" className={`roster-cell${d < today ? ' is-past' : ''}`}>
                    {s ? (
                      <Cell shift={s} onOpen={() => setOpenId(s.id)} />
                    ) : (
                      <button className="cell cell-empty" onClick={() => setAdding({ date: d, shiftType: t })} aria-label={`הוספת משמרת ${SHIFT_LABEL[t]} ב-${d}`}>
                        הוספה
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <p className="legend muted small">
        <span className="lamp lamp-green">יש נהג</span> לפחות נהג אחד רשום
        <span className="lamp lamp-red">אין נהג</span> עדיין חסר נהג
        <span className="pub-tag is-draft">טיוטה</span> לא גלוי למתנדבים
      </p>

      {open && <ShiftPanel shift={open} onClose={() => setOpenId(null)} onChanged={onChanged ?? reload} />}
      {adding && (
        <AddShiftsDialog
          weekStart={week.weekStart}
          preset={adding === 'week' ? undefined : adding}
          onClose={() => setAdding(null)}
          onDone={() => {
            setAdding(null);
            void reload();
          }}
        />
      )}
      {publishing && (
        <Sheet title={`פרסום השבוע ${label}`} onClose={() => setPublishing(false)}>
          <div className="sheet-body">
            <p>
              {week.draftCount === 1 ? 'טיוטה אחת תופיע' : `${week.draftCount} טיוטות יופיעו`} בלוח המשמרות, וכל המתנדבים יראו הודעה בפעם הבאה שייכנסו לאתר.
            </p>
            {week.publishedCount > 0 && <p className="muted small">משמרות שכבר פורסמו בשבוע הזה לא ישתנו.</p>}
          </div>
          <div className="sheet-foot">
            <button className="btn btn-primary btn-block" onClick={publish} disabled={busy}>
              {busy ? 'מפרסמים…' : 'פרסום השבוע'}
            </button>
          </div>
        </Sheet>
      )}
    </section>
  );
}
