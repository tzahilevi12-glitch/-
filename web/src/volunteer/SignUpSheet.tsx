import { useMemo, useState } from 'react';
import { api } from '../api.ts';
import type { BoardShift, Certification } from '../types.ts';
import { CERT_SHORT, SHIFT_LABEL, dayLabel, durationLabel, inWindow, isCertified, range, timeOptions, windowOf } from '../format.ts';
import { CarIcon, DutyBar, Sheet, ShiftBadge, toast } from '../ui.tsx';
import { CalendarIcon, ClockIcon, ShiftTypeIcon } from '../icons.tsx';

/**
 * mode "regular": a regular slot in the shift.
 * mode "car": an extra patrol car (שלב ב'/ג' only). It runs in parallel to the shift and never
 * takes a regular slot, so it is available even when the shift is full.
 */
export function SignUpSheet({
  shift,
  isDriver,
  certification,
  mode,
  onClose,
  onDone,
}: {
  shift: BoardShift;
  isDriver: boolean;
  certification: Certification;
  mode: 'regular' | 'car';
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
  const openCar = mode === 'car' && isCertified(certification);
  const blockedFull = !openCar && shift.seatsLeft === 0;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ message: string }>(`/shifts/${shift.id}/registrations`, {
        method: 'POST',
        body: { ...(partial ? { startTime, endTime } : {}), ...(openCar ? { opensNewCar: true } : {}) },
      });
      toast(res.message);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ההרשמה נכשלה.');
      setBusy(false);
    }
  }

  return (
    <Sheet title={openCar ? `ניידת נוספת – משמרת ${SHIFT_LABEL[shift.shiftType]}` : `משמרת ${SHIFT_LABEL[shift.shiftType]}`} onClose={onClose}>
      <div className="sheet-body">
        <div className="sheet-meta">
          <span className={`shift-icon shift-icon-sm type-icon-${shift.shiftType.toLowerCase()}`}>
            <ShiftTypeIcon type={shift.shiftType} size={18} />
          </span>
          <span className="meta-item">
            <CalendarIcon size={15} />
            {dayLabel(shift.date)}
          </span>
          <span className="meta-item">
            <ClockIcon size={15} />
            {range(shift.startTime, shift.endTime)}
          </span>
        </div>
        {openCar ? (
          <div className="car-info">
            <CarIcon size={20} />
            <div>
              <p className="car-info-title">פתיחת ניידת נוספת ({CERT_SHORT[certification]})</p>
              <p className="car-info-sub">
                הניידת פועלת במקביל למשמרת ולא תופסת אף אחד מ-{shift.maxVolunteers} המקומות הרגילים. מזין המשמרות יקבל הודעה מיוחדת על הניידת.
              </p>
            </div>
          </div>
        ) : (
          <div className="sheet-status">
            <ShiftBadge badge={shift.badge} />
            <span className="muted">
              {shift.seatsLeft > 0 ? `נותרו ${shift.seatsLeft} מתוך ${shift.maxVolunteers} מקומות` : 'כל המקומות תפוסים'}
            </span>
          </div>
        )}

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


        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="sheet-foot">
        <button className={`btn ${openCar ? "btn-car" : "btn-primary"} btn-block`} onClick={submit} disabled={busy || !valid || blockedFull}>
          {openCar && <CarIcon size={17} />}
          {busy ? 'נרשמים…' : openCar ? `פתיחת ניידת נוספת, ${range(startTime, endTime)}` : `הרשמה לשעות ${range(startTime, endTime)}`}
        </button>
      </div>
    </Sheet>
  );
}
