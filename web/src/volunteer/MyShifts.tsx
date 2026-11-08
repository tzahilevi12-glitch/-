import { useState } from 'react';
import { api } from '../api.ts';
import type { MyShift } from '../types.ts';
import { SHIFT_LABEL, dayLabel, inWindow, minutesUntil, range, windowOf } from '../format.ts';
import { DutyBar, LoadState, NewCarTag, Sheet, useLoad } from '../ui.tsx';
import { CalendarIcon, ClipboardIcon, ClockIcon, ShiftTypeIcon, XIcon } from '../icons.tsx';

/**
 * Cancelling always notifies the shift scheduler. The volunteer is told so before
 * confirming, and gets a confirmation popup afterwards.
 */
function CancelDialog({ s, onClose, onCancelled }: { s: MyShift; onClose: () => void; onCancelled: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const isWaitlist = s.status === 'PENDING';
  const startsIn = minutesUntil(s.date, inWindow(s.startTime, windowOf(s.shiftStartTime, s.shiftEndTime)));
  const lastMinute = !isWaitlist && startsIn < 24 * 60;

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await api(`/shifts/${s.shiftId}/registrations/me`, { method: 'DELETE' });
      setDone(true);
      onCancelled();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'הביטול נכשל.');
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Sheet title={isWaitlist ? 'יצאת מרשימת ההמתנה' : 'ההרשמה בוטלה'} onClose={onClose}>
        <div className="sheet-body">
          <p className="notice notice-ok">מזין המשמרות קיבל התראה על הביטול.</p>
          <p className="muted">
            משמרת {SHIFT_LABEL[s.shiftType]}, {dayLabel(s.date)}, {range(s.startTime, s.endTime)}
          </p>
        </div>
        <div className="sheet-foot">
          <button className="btn btn-primary btn-block" onClick={onClose}>
            סגירה
          </button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title={isWaitlist ? 'לצאת מרשימת ההמתנה?' : 'לבטל את המשמרת?'} onClose={onClose}>
      <div className="sheet-body">
        <p className="sheet-date">
          משמרת {SHIFT_LABEL[s.shiftType]}, {dayLabel(s.date)}, {range(s.startTime, s.endTime)}
        </p>
        <p className="notice notice-warn">הביטול מחייב התראה: מזין המשמרות יקבל הודעה עם השם שלך והמשמרת.</p>
        {lastMinute && <p className="notice notice-urgent">המשמרת מתחילה בעוד פחות מ-24 שעות.</p>}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="sheet-foot sheet-foot-split">
        <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
          לא, להשאיר
        </button>
        <button className="btn btn-danger" onClick={confirm} disabled={busy}>
          {busy ? 'מבטלים…' : 'כן, לבטל'}
        </button>
      </div>
    </Sheet>
  );
}

function ShiftCard({ s, isDriver, onCancel }: { s: MyShift; isDriver: boolean; onCancel: () => void }) {
  return (
    <li className={`my-card type-${s.shiftType.toLowerCase()}${s.status === 'PENDING' ? ' is-pending' : ''}`}>
      <div className="my-card-head">
        <span className={`shift-icon type-icon-${s.shiftType.toLowerCase()}`}>
          <ShiftTypeIcon type={s.shiftType} size={22} />
        </span>
        <div className="my-card-heading">
          <p className="my-card-title">משמרת {SHIFT_LABEL[s.shiftType]}</p>
          <p className="my-card-date">
            <span className="meta-item">
              <CalendarIcon size={14} />
              {dayLabel(s.date)}
            </span>
            <span className="meta-item">
              <ClockIcon size={14} />
              {range(s.startTime, s.endTime)}
            </span>
          </p>
        </div>
        <div className="my-card-tags">
          {s.status === 'PENDING' && <span className="mine-tag is-pending">ברשימת המתנה</span>}
          {s.opensNewCar && <NewCarTag />}
        </div>
      </div>
      <DutyBar
        start={s.shiftStartTime}
        end={s.shiftEndTime}
        lanes={[{ key: 'me', startTime: s.startTime, endTime: s.endTime, driver: isDriver, pending: s.status === 'PENDING', highlight: true }]}
      />
      {s.isPartial && <p className="muted small">חלק ממשמרת {range(s.shiftStartTime, s.shiftEndTime)}</p>}
      {s.status === 'PENDING' && <p className="info-note">ההרשמה ממתינה לשיבוץ. כשיתפנה מקום היא תאושר אוטומטית.</p>}
      <div className="my-card-foot">
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>
          <XIcon size={15} />
          {s.status === 'PENDING' ? 'יציאה מרשימת ההמתנה' : 'ביטול משמרת'}
        </button>
      </div>
    </li>
  );
}

export function MyShifts({ isDriver, name }: { isDriver: boolean; name: string }) {
  const { data, error, loading, reload } = useLoad(() => api<{ approved: MyShift[]; waitlisted: MyShift[] }>('/me/shifts'));
  const [cancelling, setCancelling] = useState<MyShift | null>(null);
  if (!data) return <LoadState error={loading ? null : error} onRetry={reload} />;
  const all = [...data.approved, ...data.waitlisted].sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  const n = data.approved.length;

  return (
    <section className="page">
      <h1 className="page-title">שלום {name.split(' ')[0]}</h1>
      <p className="page-sub">{n === 0 ? 'אין לך משמרות קרובות.' : n === 1 ? 'יש לך משמרת אחת קרובה.' : `יש לך ${n} משמרות קרובות.`}</p>
      {all.length === 0 ? (
        <div className="empty">
          <span className="empty-icon">
            <ClipboardIcon size={28} />
          </span>
          <p>אפשר לבחור משמרת בלוח המשמרות.</p>
          <a className="btn btn-primary" href="#/board">
            ללוח המשמרות
          </a>
        </div>
      ) : (
        <ul className="my-list">
          {all.map((s) => (
            <ShiftCard key={s.registrationId} s={s} isDriver={isDriver} onCancel={() => setCancelling(s)} />
          ))}
        </ul>
      )}
      {cancelling && <CancelDialog s={cancelling} onClose={() => setCancelling(null)} onCancelled={reload} />}
    </section>
  );
}
