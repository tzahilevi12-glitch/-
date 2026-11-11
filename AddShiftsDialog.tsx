import { useState } from 'react';
import { api } from '../api.ts';
import type { ShiftType } from '../types.ts';
import { SHIFT_LABEL, SHIFT_TYPES, WEEKDAYS, addDays, range, shortDay } from '../format.ts';
import { Sheet, TimeSelect, toast } from '../ui.tsx';

const DEFAULT_HOURS: Record<ShiftType, [string, string]> = {
  MORNING: ['06:00', '15:00'],
  EVENING: ['14:30', '22:00'],
  NIGHT: ['21:30', '07:00'],
};

export function AddShiftsDialog({
  weekStart,
  preset,
  onClose,
  onDone,
}: {
  weekStart: string;
  preset?: { date: string; shiftType: ShiftType };
  onClose: () => void;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<'one' | 'week'>(preset ? 'one' : 'week');
  const [date, setDate] = useState(preset?.date ?? weekStart);
  const [shiftType, setShiftType] = useState<ShiftType>(preset?.shiftType ?? 'MORNING');
  const [startTime, setStartTime] = useState(DEFAULT_HOURS[preset?.shiftType ?? 'MORNING'][0]);
  const [endTime, setEndTime] = useState(DEFAULT_HOURS[preset?.shiftType ?? 'MORNING'][1]);
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [types, setTypes] = useState<ShiftType[]>([...SHIFT_TYPES]);
  const [requiredDrivers, setRequiredDrivers] = useState(1);
  const [maxVolunteers, setMaxVolunteers] = useState(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  function pickType(t: ShiftType) {
    setShiftType(t);
    setStartTime(DEFAULT_HOURS[t][0]);
    setEndTime(DEFAULT_HOURS[t][1]);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'one') {
        await api('/admin/shifts', { method: 'POST', body: { date, shiftType, startTime, endTime, requiredDrivers, maxVolunteers } });
        toast('נוספה טיוטת משמרת.');
      } else {
        const r = await api<{ created: number; skippedExisting: number }>('/admin/shifts/recurring', {
          method: 'POST',
          body: { from: weekStart, to: addDays(weekStart, 6), daysOfWeek: days, shiftTypes: types, requiredDrivers, maxVolunteers },
        });
        toast(r.skippedExisting ? `נוספו ${r.created} טיוטות. ${r.skippedExisting} משמרות כבר היו קיימות.` : `נוספו ${r.created} טיוטות.`);
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ההוספה נכשלה.');
      setBusy(false);
    }
  }

  return (
    <Sheet title="הוספת משמרות" onClose={onClose}>
      <div className="sheet-body">
        <div className="segmented" role="radiogroup" aria-label="מה להוסיף">
          <button role="radio" aria-checked={mode === 'week'} className={mode === 'week' ? 'is-on' : ''} onClick={() => setMode('week')}>
            מילוי השבוע
          </button>
          <button role="radio" aria-checked={mode === 'one'} className={mode === 'one' ? 'is-on' : ''} onClick={() => setMode('one')}>
            משמרת אחת
          </button>
        </div>

        {mode === 'week' ? (
          <>
            <fieldset className="field">
              <legend className="field-label">ימים</legend>
              <div className="toggle-row">
                {WEEKDAYS.map((d, i) => (
                  <button
                    key={d}
                    type="button"
                    className={`toggle${days.includes(i) ? ' is-on' : ''}`}
                    aria-pressed={days.includes(i)}
                    onClick={() => setDays(toggle(days, i))}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="field">
              <legend className="field-label">משמרות</legend>
              <div className="toggle-row">
                {SHIFT_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`toggle${types.includes(t) ? ' is-on' : ''}`}
                    aria-pressed={types.includes(t)}
                    onClick={() => setTypes(toggle(types, t))}
                  >
                    {SHIFT_LABEL[t]} {range(DEFAULT_HOURS[t][0], DEFAULT_HOURS[t][1])}
                  </button>
                ))}
              </div>
            </fieldset>
            <p className="muted small">משמרות שכבר קיימות בשבוע לא ישתנו.</p>
          </>
        ) : (
          <>
            <div className="time-pair">
              <label className="field">
                <span className="field-label">יום</span>
                <select className="input" value={date} onChange={(e) => setDate(e.target.value)}>
                  {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((d) => (
                    <option key={d} value={d}>
                      {shortDay(d).weekday} {shortDay(d).day}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">משמרת</span>
                <select className="input" value={shiftType} onChange={(e) => pickType(e.target.value as ShiftType)}>
                  {SHIFT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {SHIFT_LABEL[t]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="time-pair">
              <TimeSelect label="התחלה" value={startTime} onChange={setStartTime} />
              <TimeSelect label="סיום" value={endTime} onChange={setEndTime} />
            </div>
          </>
        )}

        <div className="time-pair">
          <label className="field">
            <span className="field-label">מתנדבים במשמרת</span>
            <input className="input" type="number" min={1} max={50} value={maxVolunteers} onChange={(e) => setMaxVolunteers(Number(e.target.value))} />
          </label>
          <label className="field">
            <span className="field-label">נהגים דרושים</span>
            <input className="input" type="number" min={0} max={maxVolunteers} value={requiredDrivers} onChange={(e) => setRequiredDrivers(Number(e.target.value))} />
          </label>
        </div>
        <p className="muted small">משמרות חדשות נשמרות כטיוטה. המתנדבים יראו אותן אחרי פרסום השבוע.</p>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="sheet-foot">
        <button className="btn btn-primary btn-block" onClick={submit} disabled={busy || (mode === 'week' && (!days.length || !types.length))}>
          {busy ? 'מוסיפים…' : mode === 'week' ? 'הוספת טיוטות' : 'הוספת טיוטה'}
        </button>
      </div>
    </Sheet>
  );
}
