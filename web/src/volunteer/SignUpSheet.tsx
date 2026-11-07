import { useMemo, useState } from 'react';
import { api } from '../api.ts';
import type { BoardShift, Certification } from '../types.ts';
import { CERT_LABEL, SHIFT_LABEL, dayLabel, durationLabel, inWindow, isCertified, range, timeOptions, windowOf } from '../format.ts';
import { DutyBar, Sheet, ShiftBadge, ShieldIcon, WheelIcon, toast } from '../ui.tsx';

export function SignUpSheet({
  shift,
  isDriver,
  certification,
  onClose,
  onDone,
}: {
  shift: BoardShift;
  isDriver: boolean;
  certification: Certification;
  onClose: () => void;
  onDone: () => void;
}) {
  const [partial, setPartial] = useState(false);
  const options = useMemo(() => timeOptions(shift.startTime, shift.endTime), [shift]);
  const [from, setFrom] = useState(shift.startTime);
  const [to, setTo] = useState(shift.endTime);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const w = windowOf(shift.startTime, shift.endTime);
  const startTime = partial ? from : shift.startTime;
  const endTime = partial ? to : shift.endTime;
  const valid = inWindow(startTime, w) < inWindow(endTime, w);
  const certified = isCertified(certification);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ message: string }>(`/shifts/${shift.id}/registrations`, {
        method: 'POST',
        body: partial ? { startTime, endTime } : {},
      });
      toast(res.message);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ההרשמה נכשלה.');
      setBusy(false);
    }
  }

  return (
    <Sheet title={`משמרת ${SHIFT_LABEL[shift.shiftType]}`} onClose={onClose}>
      <div className="sheet-body">
        <p className="sheet-date">
          {dayLabel(shift.date)}, {range(shift.startTime, shift.endTime)}
        </p>
        <div className="sheet-status">
          <ShiftBadge badge={shift.badge} />
          <span className="muted">
            {shift.seatsLeft > 0 ? `נותרו ${shift.seatsLeft} מתוך ${shift.maxVolunteers} מקומות` : 'כל המקומות תפוסים'}
          </span>
        </div>

        <div className="segmented" role="radiogroup" aria-label="שעות">
          <button role="radio" aria-checked={!partial} className={!partial ? 'is-on' : ''} onClick={() => setPartial(false)}>
            כל המשמרת
          </button>
          <button role="radio" aria-checked={partial} className={partial ? 'is-on' : ''} onClick={() => setPartial(true)}>
            חלק מהמשמרת
          </button>
        </div>

        {partial && (
          <div className="time-pair">
            <label className="field">
              <span className="field-label">משעה</span>
              <select className="input ltr-input" value={from} onChange={(e) => setFrom(e.target.value)}>
                {options.slice(0, -1).map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">עד שעה</span>
              <select className="input ltr-input" value={to} onChange={(e) => setTo(e.target.value)}>
                {options.slice(1).map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
          </div>
        )}

        <DutyBar
          start={shift.startTime}
          end={shift.endTime}
          lanes={[{ key: 'me', label: 'אני', startTime, endTime, driver: isDriver, highlight: true }]}
        />
        <p className="muted small">{valid ? durationLabel(startTime, endTime) : 'שעת הסיום צריכה להיות אחרי שעת ההתחלה.'}</p>

        <p className={`role-note${isDriver ? ' is-driver' : ''}`}>
          {isDriver ? (
            <>
              <WheelIcon size={16} /> ההרשמה היא כנהג.
            </>
          ) : (
            "ההרשמה היא ללא צ'יפ נהיגה. אם זה לא נכון, אפשר לעדכן בפרופיל."
          )}
        </p>
        {certified && (
          <p className="role-note is-cert">
            <ShieldIcon size={16} /> {CERT_LABEL[certification]}: אפשר להירשם לכל משמרת, גם כשהיא מלאה (ניידת נוספת).
          </p>
        )}

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="sheet-foot">
        <button className="btn btn-primary btn-block" onClick={submit} disabled={busy || !valid}>
          {busy ? 'נרשמים…' : `הרשמה לשעות ${range(startTime, endTime)}`}
        </button>
      </div>
    </Sheet>
  );
}
