import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../api.ts';
import type { MyShift } from '../types.ts';
import { SHIFT_LABEL, addDays, dayLabel, inWindow, ltr, minutesUntil, range, shortDay, windowOf } from '../format.ts';
import { DutyBar, LoadState, NewCarTag, Sheet, useLoad } from '../ui.tsx';
import { CalendarIcon, ClipboardIcon, ClockIcon, HourglassIcon, SendIcon, ShiftTypeIcon, TimerIcon, XIcon } from '../icons.tsx';

const FREE_CANCEL_MINUTES = 12 * 60;

/** "יום א׳ 8.11 בשעה 18:00": the last moment the volunteer can cancel without approval. */
function freeCancelDeadline(s: MyShift): string {
  const abs = inWindow(s.startTime, windowOf(s.shiftStartTime, s.shiftEndTime)) - FREE_CANCEL_MINUTES;
  const dayOffset = Math.floor(abs / 1440);
  const m = abs - dayOffset * 1440;
  const hhmm = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const day = shortDay(addDays(s.date, dayOffset));
  return `${day.weekday} ${day.day} בשעה ${ltr(hhmm)}`;
}

type CancelKind = 'cancel' | 'request';

/**
 * More than 12 hours before the start (or on the waitlist) the volunteer cancels directly.
 * From 12 hours before, the button becomes "בקשת ביטול": the commander must approve, and until
 * then the volunteer keeps the seat. Either way the volunteer is told what happens before confirming.
 */
function CancelDialog({ s, kind: initialKind, onClose, onChanged }: { s: MyShift; kind: CancelKind; onClose: () => void; onChanged: () => void }) {
  const [kind, setKind] = useState<CancelKind>(initialKind);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | 'cancelled' | 'requested'>(null);
  const isWaitlist = s.status === 'PENDING';
  const startsIn = minutesUntil(s.date, inWindow(s.startTime, windowOf(s.shiftStartTime, s.shiftEndTime)));
  const lastMinute = !isWaitlist && startsIn < 24 * 60;
  const what = (
    <>
      משמרת {SHIFT_LABEL[s.shiftType]}, {dayLabel(s.date)}, {range(s.startTime, s.endTime)}
    </>
  );

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      if (kind === 'cancel') {
        await api(`/shifts/${s.shiftId}/registrations/me`, { method: 'DELETE' });
        setDone('cancelled');
      } else {
        const r = await api<{ outcome: 'REQUESTED' | 'CANCELLED' }>(`/shifts/${s.shiftId}/registrations/me/cancel-request`, { method: 'POST' });
        setDone(r.outcome === 'CANCELLED' ? 'cancelled' : 'requested');
      }
      onChanged();
    } catch (e) {
      // The 12-hour mark passed while the dialog was open: offer the request instead.
      if (e instanceof ApiError && e.code === 'CANCEL_NEEDS_APPROVAL') {
        setKind('request');
        onChanged();
      }
      setError(e instanceof Error ? e.message : 'הפעולה נכשלה.');
      setBusy(false);
    }
  }

  if (done) {
    const requested = done === 'requested';
    return (
      <Sheet title={requested ? 'בקשת הביטול נשלחה' : isWaitlist ? 'יצאת מרשימת ההמתנה' : 'ההרשמה בוטלה'} onClose={onClose}>
        <div className="sheet-body">
          <p className={`notice ${requested ? 'notice-warn' : 'notice-ok'}`}>
            {requested
              ? 'מזין המשמרות יאשר או ידחה את הבקשה. עד לאישור את/ה עדיין רשום/ה למשמרת ונספר/ת בה.'
              : 'מזין המשמרות קיבל התראה על הביטול.'}
          </p>
          <p className="muted">{what}</p>
        </div>
        <div className="sheet-foot">
          <button className="btn btn-primary btn-block" onClick={onClose}>
            סגירה
          </button>
        </div>
      </Sheet>
    );
  }

  const request = kind === 'request';
  return (
    <Sheet title={request ? 'לשלוח בקשת ביטול?' : isWaitlist ? 'לצאת מרשימת ההמתנה?' : 'לבטל את המשמרת?'} onClose={onClose}>
      <div className="sheet-body">
        <p className="sheet-date">{what}</p>
        {request ? (
          <p className="notice notice-warn">
            נותרו 12 שעות או פחות עד תחילת המשמרת, ולכן הביטול דורש אישור של מזין המשמרות. עד שהבקשה תאושר את/ה נשאר/ת רשום/ה והמקום שלך נשמר.
          </p>
        ) : (
          <p className="notice notice-warn">הביטול מחייב התראה: מזין המשמרות יקבל הודעה עם השם שלך והמשמרת.</p>
        )}
        {lastMinute && <p className="notice notice-urgent">המשמרת מתחילה בעוד פחות מ-24 שעות.</p>}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="sheet-foot sheet-foot-split">
        <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
          {request ? 'לא, ביטול' : 'לא, להשאיר'}
        </button>
        <button className="btn btn-danger" onClick={confirm} disabled={busy}>
          {busy ? (request ? 'שולחים…' : 'מבטלים…') : request ? 'כן, לשלוח בקשה' : 'כן, לבטל'}
        </button>
      </div>
    </Sheet>
  );
}

function ShiftCard({
  s,
  isDriver,
  graceUntil,
  now,
  onCancel,
}: {
  s: MyShift;
  isDriver: boolean;
  /** Local clock time when free cancellation ends. */
  graceUntil: number;
  now: number;
  onCancel: (kind: CancelKind) => void;
}) {
  const waitlist = s.status === 'PENDING';
  const requested = !waitlist && s.cancelRequestedAt !== null;
  const graceLeft = waitlist ? 0 : graceUntil - now;
  const free = waitlist || graceLeft > 0;

  return (
    <li className={`my-card type-${s.shiftType.toLowerCase()}${waitlist ? ' is-pending' : ''}${requested ? ' is-cancel-requested' : ''}`}>
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
          {waitlist && <span className="mine-tag is-pending">ברשימת המתנה</span>}
          {requested && (
            <span className="mine-tag is-requested">
              <HourglassIcon size={13} />
              ממתין לאישור ביטול
            </span>
          )}
          {s.opensNewCar && <NewCarTag />}
        </div>
      </div>
      <DutyBar
        start={s.shiftStartTime}
        end={s.shiftEndTime}
        lanes={[{ key: 'me', startTime: s.startTime, endTime: s.endTime, driver: isDriver, pending: waitlist, highlight: true }]}
      />
      {s.isPartial && <p className="muted small">חלק ממשמרת {range(s.shiftStartTime, s.shiftEndTime)}</p>}
      {waitlist && <p className="info-note">ההרשמה ממתינה לשיבוץ. כשיתפנה מקום היא תאושר אוטומטית.</p>}
      {requested && <p className="info-note info-note-warn">שלחת בקשת ביטול. עד שמזין המשמרות יאשר אותה, את/ה עדיין רשום/ה למשמרת.</p>}
      {!requested && !waitlist && s.cancelRejectedAt && (
        <p className="info-note info-note-danger">מזין המשמרות דחה את בקשת הביטול. את/ה נשאר/ת רשום/ה למשמרת.</p>
      )}
      <div className="my-card-foot">
        {!waitlist && free && (
          <span className="grace-timer">
            <TimerIcon size={14} />
            ביטול חופשי עד {freeCancelDeadline(s)}
          </span>
        )}
        {!waitlist && !free && !requested && (
          <span className="grace-timer is-closed">
            <HourglassIcon size={14} />
            פחות מ-12 שעות – ביטול באישור בלבד
          </span>
        )}
        {requested ? (
          <button className="btn btn-ghost btn-sm" disabled>
            <HourglassIcon size={15} />
            הבקשה נשלחה
          </button>
        ) : free ? (
          <button className="btn btn-ghost btn-sm" onClick={() => onCancel('cancel')}>
            <XIcon size={15} />
            {waitlist ? 'יציאה מרשימת ההמתנה' : 'ביטול משמרת'}
          </button>
        ) : (
          <button className="btn btn-ghost btn-sm btn-request" onClick={() => onCancel('request')}>
            <SendIcon size={15} />
            בקשת ביטול
          </button>
        )}
      </div>
    </li>
  );
}

export function MyShifts({ isDriver, name }: { isDriver: boolean; name: string }) {
  const { data, error, loading, reload } = useLoad(() => api<{ approved: MyShift[]; waitlisted: MyShift[] }>('/me/shifts'));
  const [cancelling, setCancelling] = useState<{ s: MyShift; kind: CancelKind } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // 12-hour marks on the local clock, from the server's "minutes left" at load time.
  const { graceUntil, loadedAt } = useMemo(() => {
    const at = Date.now();
    const m = new Map<string, number>();
    for (const s of data?.approved ?? []) {
      // The server has the final word: once it says approval is needed, there is no countdown.
      m.set(s.registrationId, s.cancelMode === 'FREE' && s.freeCancelMinutesLeft > 0 ? at + s.freeCancelMinutesLeft * 60_000 : 0);
    }
    return { graceUntil: m, loadedAt: at };
  }, [data]);
  // "now" never earlier than the moment the data arrived (the ticking clock may be older).
  const clock = Math.max(now, loadedAt);
  const anyGrace = [...graceUntil.values()].some((t) => t > clock);
  const anyRequest = (data?.approved ?? []).some((s) => s.cancelRequestedAt);

  // When the next 12-hour mark arrives, re-render so that card's button flips to "בקשת ביטול".
  const nextFlip = Math.min(...[...graceUntil.values()].filter((t) => t > clock));
  useEffect(() => {
    if (!anyGrace || !Number.isFinite(nextFlip)) return;
    const t = setTimeout(() => setNow(Date.now()), Math.min(nextFlip - Date.now() + 250, 60 * 60_000));
    return () => clearTimeout(t);
  }, [anyGrace, nextFlip, now]);

  // While a request is waiting, check every 30 s for the commander's answer.
  useEffect(() => {
    if (!anyRequest) return;
    const t = setInterval(() => void reload(), 30_000);
    return () => clearInterval(t);
  }, [anyRequest, reload]);

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
            <ShiftCard
              key={s.registrationId}
              s={s}
              isDriver={isDriver}
              graceUntil={graceUntil.get(s.registrationId) ?? 0}
              now={clock}
              onCancel={(kind) => setCancelling({ s, kind })}
            />
          ))}
        </ul>
      )}
      {cancelling && <CancelDialog s={cancelling.s} kind={cancelling.kind} onClose={() => setCancelling(null)} onChanged={reload} />}
    </section>
  );
}
