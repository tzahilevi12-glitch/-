import { useState, type ReactNode } from 'react';
import { api, ApiError } from '../api.ts';
import type { RosterPerson, RosterShift } from '../types.ts';
import { SHIFT_LABEL, dayLabel, range } from '../format.ts';
import { CertMark, DriverChip, DutyBar, NewCarTag, Sheet, TimeSelect, toast } from '../ui.tsx';

function PersonRow({ p, actions }: { p: RosterPerson; actions: ReactNode }) {
  return (
    <li className="person">
      <div className="person-main">
        <span className="person-name">
          {p.hasDrivingChip && <DriverChip small />}
          {p.fullName}
          <CertMark certification={p.certification} />
          {p.opensNewCar && <NewCarTag certification={p.certification} long />}
        </span>
        <span className="muted small">{p.isPartial ? range(p.startTime, p.endTime) : 'כל המשמרת'}</span>
      </div>
      <div className="person-actions">{actions}</div>
    </li>
  );
}

export function ShiftPanel({ shift, onClose, onChanged }: { shift: RosterShift; onClose: () => void; onChanged: () => void }) {
  const [form, setForm] = useState({
    startTime: shift.startTime,
    endTime: shift.endTime,
    requiredDrivers: shift.requiredDrivers,
    maxVolunteers: shift.maxVolunteers,
    notes: shift.notes ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const signedUp = shift.approved.length + shift.waitlist.length;

  async function run(action: () => Promise<unknown>, done: string, close = false) {
    setBusy(true);
    setError(null);
    try {
      await action();
      toast(done);
      onChanged();
      if (close) onClose();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'HAS_REGISTRATIONS') setConfirmDelete(true);
      setError(e instanceof Error ? e.message : 'משהו השתבש.');
    } finally {
      setBusy(false);
    }
  }

  const setReg = (id: string, status: 'APPROVED' | 'CANCELLED') =>
    run(() => api(`/admin/registrations/${id}`, { method: 'PATCH', body: { status } }), status === 'APPROVED' ? 'המתנדב אושר.' : 'המתנדב הוסר מהמשמרת.');

  const dirty =
    form.startTime !== shift.startTime ||
    form.endTime !== shift.endTime ||
    form.requiredDrivers !== shift.requiredDrivers ||
    form.maxVolunteers !== shift.maxVolunteers ||
    form.notes !== (shift.notes ?? '');

  const driverText =
    shift.driverAlert === 'GREEN' ? 'יש נהג' : shift.driversMissing > 1 ? `חסרים ${shift.driversMissing} נהגים` : 'עדיין אין נהג';

  return (
    <Sheet title={`${SHIFT_LABEL[shift.shiftType]}, ${dayLabel(shift.date)}`} onClose={onClose} wide>
      <div className="sheet-body">
        <div className="panel-status">
          <span className={`lamp lamp-${shift.driverAlert.toLowerCase()}`}>{driverText}</span>
          <span className="cell-ratio">
            רשומים <strong>{shift.seatsTaken + shift.extraVolunteers}</strong> / מבוקש <strong>{shift.maxVolunteers}</strong>
          </span>
          {shift.extraVolunteers > 0 && (
            <span className="muted small">
              (כולל {shift.extraVolunteers === 1 ? 'מתנדב אחד שפותח ניידת נוספת' : `${shift.extraVolunteers} מתנדבים שפותחים ניידות נוספות`})
            </span>
          )}
          <span className={`pub-tag${shift.published ? '' : ' is-draft'}`}>{shift.published ? 'פורסם' : 'טיוטה'}</span>
          {shift.status === 'COMPLETED' && <span className="pub-tag">הסתיימה</span>}
        </div>

        {shift.approved.length > 0 && (
          <DutyBar
            start={shift.startTime}
            end={shift.endTime}
            lanes={shift.approved.map((p) => ({
              key: p.registrationId,
              label: p.fullName,
              startTime: p.startTime,
              endTime: p.endTime,
              driver: p.hasDrivingChip,
            }))}
          />
        )}

        <h3 className="sub-head">במשמרת</h3>
        {shift.approved.length === 0 ? (
          <p className="muted small">עדיין אף אחד לא נרשם.</p>
        ) : (
          <ul className="people">
            {shift.approved.map((p) => (
              <PersonRow
                key={p.registrationId}
                p={p}
                actions={
                  <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setReg(p.registrationId, 'CANCELLED')}>
                    הסרה
                  </button>
                }
              />
            ))}
          </ul>
        )}

        {shift.waitlist.length > 0 && (
          <>
            <h3 className="sub-head">רשימת המתנה</h3>
            <p className="muted small">ממתינים כי המקום האחרון שמור לנהג. אישור ייתן להם את המקום בכל זאת.</p>
            <ul className="people">
              {shift.waitlist.map((p) => (
                <PersonRow
                  key={p.registrationId}
                  p={p}
                  actions={
                    <>
                      <button className="btn btn-primary btn-sm" disabled={busy || shift.seatsLeft === 0} onClick={() => setReg(p.registrationId, 'APPROVED')}>
                        אישור
                      </button>
                      <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setReg(p.registrationId, 'CANCELLED')}>
                        הסרה
                      </button>
                    </>
                  }
                />
              ))}
            </ul>
          </>
        )}

        <h3 className="sub-head">פרטי המשמרת</h3>
        <div className="form-grid">
          <TimeSelect label="התחלה" value={form.startTime} onChange={(v) => setForm({ ...form, startTime: v })} />
          <TimeSelect label="סיום" value={form.endTime} onChange={(v) => setForm({ ...form, endTime: v })} />
          <label className="field">
            <span className="field-label">מתנדבים</span>
            <input className="input" type="number" min={1} max={50} value={form.maxVolunteers} onChange={(e) => setForm({ ...form, maxVolunteers: Number(e.target.value) })} />
          </label>
          <label className="field">
            <span className="field-label">נהגים דרושים</span>
            <input className="input" type="number" min={0} max={form.maxVolunteers} value={form.requiredDrivers} onChange={(e) => setForm({ ...form, requiredDrivers: Number(e.target.value) })} />
          </label>
        </div>
        <label className="field">
          <span className="field-label">הערה למשמרת</span>
          <input className="input" value={form.notes} maxLength={500} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="לא חובה" />
        </label>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="sheet-foot sheet-foot-split">
        <div className="foot-left">
          {confirmDelete ? (
            <>
              <span className="small">{signedUp ? `למחוק את המשמרת ואת ${signedUp} ההרשמות?` : 'למחוק את המשמרת?'}</span>
              <button
                className="btn btn-danger btn-sm"
                disabled={busy}
                onClick={() => run(() => api(`/admin/shifts/${shift.id}${signedUp ? '?force=true' : ''}`, { method: 'DELETE' }), 'המשמרת נמחקה.', true)}
              >
                מחיקה
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>
                השארה
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(true)}>
                מחיקת משמרת
              </button>
              <button
                className="btn btn-ghost btn-sm"
                disabled={busy}
                onClick={() =>
                  run(
                    () => api(`/admin/shifts/${shift.id}`, { method: 'PATCH', body: { status: shift.status === 'COMPLETED' ? 'OPEN' : 'COMPLETED' } }),
                    shift.status === 'COMPLETED' ? 'המשמרת נפתחה מחדש.' : 'המשמרת סומנה כהסתיימה.',
                    true,
                  )
                }
              >
                {shift.status === 'COMPLETED' ? 'פתיחה מחדש' : 'סימון כהסתיימה'}
              </button>
            </>
          )}
        </div>
        <button
          className="btn btn-primary"
          disabled={!dirty || busy}
          onClick={() => run(() => api(`/admin/shifts/${shift.id}`, { method: 'PATCH', body: form }), 'המשמרת עודכנה.', true)}
        >
          שמירת שינויים
        </button>
      </div>
    </Sheet>
  );
}
