import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.ts';
import type { Certification, RosterShift, Volunteer } from '../types.ts';
import {
  CERT_LABEL,
  CERTIFICATIONS,
  MIN_DURATION_MESSAGE,
  MIN_REGISTRATION_MINUTES,
  SHIFT_LABEL,
  durationLabel,
  inWindow,
  isCertified,
  range,
  shortDay,
  timeOptions,
  windowOf,
} from '../format.ts';
import { Avatar, CertMark, DriverBadge, Sheet, toast } from '../ui.tsx';
import { AlertIcon, CarIcon, CarFrontIcon, SearchIcon, UserIcon, UsersIcon } from '../icons.tsx';

type Mode = 'existing' | 'new';

function shiftOptionLabel(s: RosterShift): string {
  const d = shortDay(s.date);
  const draft = s.published ? '' : ' · טיוטה';
  return `${d.weekday} ${d.day} · ${SHIFT_LABEL[s.shiftType]} (${s.startTime}–${s.endTime}) · רשומים ${s.seatsTaken}/${s.maxVolunteers}${draft}`;
}

/**
 * "רישום מתנדב ידני": the commander puts a volunteer on a shift: someone already in the list, or a
 * new volunteer without a smartphone (saved, so they appear in future searches, on the board and
 * in "מצטייני החודש"). Whole shift or part of it (3 hours minimum), regular slot or extra patrol car.
 */
export function ManualRegisterDialog({
  shifts,
  initialShiftId,
  onClose,
  onDone,
}: {
  shifts: RosterShift[];
  initialShiftId?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const options = useMemo(
    () => [...shifts].sort((a, b) => (a.date === b.date ? (a.startTime < b.startTime ? -1 : 1) : a.date < b.date ? -1 : 1)),
    [shifts],
  );
  const [shiftId, setShiftId] = useState(initialShiftId ?? options[0]?.id ?? '');
  const shift = options.find((s) => s.id === shiftId) ?? null;

  const [mode, setMode] = useState<Mode>('existing');
  const [volunteers, setVolunteers] = useState<Volunteer[] | null>(null);
  const [search, setSearch] = useState('');
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [fresh, setFresh] = useState({ fullName: '', phoneNumber: '', certification: 'NONE' as Certification, hasDrivingChip: false });

  const [partial, setPartial] = useState(false);
  const [from, setFrom] = useState(shift?.startTime ?? '');
  const [to, setTo] = useState(shift?.endTime ?? '');
  const [car, setCar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ users: Volunteer[] }>('/admin/users')
      .then((r) => setVolunteers(r.users))
      .catch(() => setVolunteers([]));
  }, []);

  // A different shift → back to its full hours.
  useEffect(() => {
    if (!shift) return;
    setFrom(shift.startTime);
    setTo(shift.endTime);
    setPartial(false);
    setError(null);
  }, [shiftId]); // eslint-disable-line react-hooks/exhaustive-deps

  const onShift = useMemo(() => new Set(shift ? [...shift.approved, ...shift.waitlist].map((p) => p.userId) : []), [shift]);
  const picked = volunteers?.find((v) => v.id === pickedId) ?? null;
  const person = mode === 'existing' ? picked : { ...fresh, isActive: true };
  const certification: Certification = person?.certification ?? 'NONE';
  const canCar = isCertified(certification);
  useEffect(() => {
    if (!canCar) setCar(false);
  }, [canCar]);

  const results = useMemo(() => {
    if (!volunteers) return [];
    const q = search.trim();
    const list = q ? volunteers.filter((v) => v.fullName.includes(q) || (v.phoneNumber ?? '').replace(/\D/g, '').includes(q.replace(/\D/g, '') || '§')) : volunteers;
    return list.slice(0, 8);
  }, [volunteers, search]);
  const sameName = mode === 'new' && fresh.fullName.trim().length > 1 ? volunteers?.find((v) => v.fullName.trim() === fresh.fullName.trim()) : undefined;

  // hours (same rule as the server: at least 3 hours, or the whole shift if it is shorter)
  const w = shift ? windowOf(shift.startTime, shift.endTime) : null;
  const startTime = partial ? from : shift?.startTime ?? '';
  const endTime = partial ? to : shift?.endTime ?? '';
  const ordered = !!w && inWindow(startTime, w) < inWindow(endTime, w);
  const tooShort = !!w && ordered && inWindow(endTime, w) - inWindow(startTime, w) < Math.min(MIN_REGISTRATION_MINUTES, w.end - w.start);
  const full = !!shift && shift.seatsLeft === 0 && !car;

  const personReady =
    mode === 'existing' ? !!picked && picked.isActive && !onShift.has(picked.id) : fresh.fullName.trim().replace(/\s+/g, ' ').length >= 2;
  const ready = !!shift && personReady && ordered && !tooShort && !full && !busy;

  async function submit() {
    if (!shift || !ready) return;
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { shiftId: shift.id, opensNewCar: car };
      if (partial) Object.assign(body, { startTime: from, endTime: to });
      if (mode === 'existing') body.userId = pickedId;
      else body.newVolunteer = { ...fresh, fullName: fresh.fullName.trim(), phoneNumber: fresh.phoneNumber.trim() || undefined };
      await api('/admin/registrations/manual', { method: 'POST', body });
      const name = mode === 'existing' ? picked!.fullName : fresh.fullName.trim();
      toast(`${name} נרשם/ה למשמרת ${SHIFT_LABEL[shift.shiftType]} ${shortDay(shift.date).day}${car ? ' (ניידת נוספת)' : ''}.`);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'הרישום נכשל.');
      setBusy(false);
    }
  }

  const hourOptions = shift ? timeOptions(shift.startTime, shift.endTime) : [];

  return (
    <Sheet title="רישום מתנדב ידני" onClose={onClose} wide>
      <div className="sheet-body manual">
        <p className="muted small">למתנדבים בלי טלפון חכם או גישה לאינטרנט. הרישום מופיע מיד בלוח, נספר ב״מצטייני החודש״ ונשלחת הודעת טלגרם כרגיל.</p>

        {/* 1. shift */}
        <label className="field">
          <span className="field-label">משמרת</span>
          {options.length === 0 ? (
            <p className="muted">אין משמרות בשבוע הזה. אפשר לעבור שבוע בחצים או להוסיף משמרות.</p>
          ) : (
            <select className="input" value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
              {options.map((s) => (
                <option key={s.id} value={s.id}>
                  {shiftOptionLabel(s)}
                </option>
              ))}
            </select>
          )}
        </label>
        {shift && !shift.published && <p className="info-note">המשמרת עדיין טיוטה – המתנדב ייראה בלוח אחרי הפרסום.</p>}

        {/* 2. volunteer */}
        <div className="field">
          <span className="field-label">מתנדב</span>
          <div className="segmented" role="radiogroup" aria-label="בחירת מתנדב">
            <button role="radio" aria-checked={mode === 'existing'} className={mode === 'existing' ? 'is-on' : ''} onClick={() => setMode('existing')}>
              <UsersIcon size={15} /> מתנדב קיים
            </button>
            <button role="radio" aria-checked={mode === 'new'} className={mode === 'new' ? 'is-on' : ''} onClick={() => setMode('new')}>
              <UserIcon size={15} /> מתנדב חדש / ללא סמארטפון
            </button>
          </div>
        </div>

        {mode === 'existing' ? (
          <div className="picker">
            <span className="input-wrap">
              <SearchIcon size={17} />
              <input
                className="input has-icon"
                placeholder="חיפוש לפי שם או טלפון"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="חיפוש מתנדב"
              />
            </span>
            {volunteers === null ? (
              <p className="muted small">טוען מתנדבים…</p>
            ) : results.length === 0 ? (
              <p className="muted small">
                לא נמצא מתנדב.{' '}
                <button className="link-btn" onClick={() => { setMode('new'); setFresh((f) => ({ ...f, fullName: search.trim() })); }}>
                  לרשום כמתנדב חדש
                </button>
              </p>
            ) : (
              <ul className="picker-list" role="listbox" aria-label="מתנדבים">
                {results.map((v) => {
                  const taken = onShift.has(v.id);
                  const disabled = taken || !v.isActive;
                  return (
                    <li key={v.id}>
                      <button
                        role="option"
                        aria-selected={pickedId === v.id}
                        className={`picker-item${pickedId === v.id ? ' is-on' : ''}`}
                        disabled={disabled}
                        onClick={() => setPickedId(v.id)}
                      >
                        <Avatar name={v.fullName} size="sm" />
                        <span className="picker-name">{v.fullName}</span>
                        <CertMark certification={v.certification} />
                        {v.hasDrivingChip && <DriverBadge compact />}
                        {v.phoneNumber && <span className="picker-phone ltr-text">{v.phoneNumber}</span>}
                        {taken && <span className="muted small">כבר במשמרת</span>}
                        {!v.isActive && <span className="muted small">מושהה</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : (
          <div className="new-volunteer">
            <div className="field-row">
              <label className="field">
                <span className="field-label">שם מלא</span>
                <input className="input" value={fresh.fullName} onChange={(e) => setFresh({ ...fresh, fullName: e.target.value })} maxLength={80} autoComplete="off" />
              </label>
              <label className="field">
                <span className="field-label">טלפון (לא חובה)</span>
                <input
                  className="input ltr-input"
                  inputMode="tel"
                  value={fresh.phoneNumber}
                  onChange={(e) => setFresh({ ...fresh, phoneNumber: e.target.value })}
                  maxLength={20}
                  placeholder="050-0000000"
                />
              </label>
            </div>
            {sameName && (
              <p className="info-note">
                כבר יש ברשימה מתנדב בשם הזה.{' '}
                <button className="link-btn" onClick={() => { setMode('existing'); setSearch(sameName.fullName); setPickedId(sameName.id); }}>
                  לבחור אותו
                </button>
              </p>
            )}
            <div className="field-row">
              <label className="field">
                <span className="field-label">הסמכה</span>
                <select className="input" value={fresh.certification} onChange={(e) => setFresh({ ...fresh, certification: e.target.value as Certification })}>
                  {CERTIFICATIONS.map((c) => (
                    <option key={c} value={c}>
                      {CERT_LABEL[c]}
                    </option>
                  ))}
                </select>
              </label>
              <label className={`check-tile${fresh.hasDrivingChip ? ' is-on' : ''}`}>
                <input type="checkbox" checked={fresh.hasDrivingChip} onChange={(e) => setFresh({ ...fresh, hasDrivingChip: e.target.checked })} />
                <CarFrontIcon size={18} />
                יש צ'יפ נהיגה
              </label>
            </div>
            <p className="muted small">המתנדב יישמר ברשימת המתנדבים ויופיע בחיפוש בפעם הבאה.</p>
          </div>
        )}

        {/* 3. hours */}
        {shift && (
          <div className="field">
            <span className="field-label">שעות</span>
            <div className="segmented" role="radiogroup" aria-label="שעות">
              <button role="radio" aria-checked={!partial} className={!partial ? 'is-on' : ''} onClick={() => setPartial(false)}>
                כל המשמרת ({range(shift.startTime, shift.endTime)})
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
                    {hourOptions.slice(0, -1).map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">עד שעה</span>
                  <select className="input ltr-input" value={to} onChange={(e) => setTo(e.target.value)}>
                    {hourOptions.slice(1).map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            {partial &&
              (tooShort ? (
                <div className="min-error" role="alert">
                  <AlertIcon size={18} />
                  <div>
                    <p className="min-error-title">{MIN_DURATION_MESSAGE}</p>
                    <p className="min-error-sub">נבחרו {durationLabel(startTime, endTime)}. יש לבחור טווח של 3 שעות לפחות.</p>
                  </div>
                </div>
              ) : (
                <p className="muted small">{ordered ? durationLabel(startTime, endTime) : 'שעת הסיום צריכה להיות אחרי שעת ההתחלה.'}</p>
              ))}
          </div>
        )}

        {/* 4. regular slot or extra patrol car */}
        <div className="field">
          <span className="field-label">סוג שיבוץ</span>
          <div className="segmented" role="radiogroup" aria-label="סוג שיבוץ">
            <button role="radio" aria-checked={!car} className={!car ? 'is-on' : ''} onClick={() => setCar(false)}>
              מקום רגיל במשמרת
            </button>
            <button role="radio" aria-checked={car} className={car ? 'is-on' : ''} disabled={!canCar} onClick={() => setCar(true)}>
              <CarIcon size={15} /> ניידת נוספת
            </button>
          </div>
          {!canCar && <p className="muted small">ניידת נוספת – רק למוסמכי שלב ב' או שלב ג'.</p>}
        </div>

        {full && shift && (
          <p className="notice notice-warn">
            המשמרת מלאה ({shift.seatsTaken}/{shift.maxVolunteers}). {canCar ? 'אפשר לרשום כניידת נוספת, ' : ''}או להגדיל את מספר המקומות בחלון המשמרת.
          </p>
        )}
        {mode === 'existing' && picked && onShift.has(picked.id) && <p className="notice notice-warn">המתנדב כבר רשום למשמרת הזו.</p>}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="sheet-foot">
        <button className={`btn ${car ? 'btn-car' : 'btn-primary'} btn-block`} disabled={!ready} onClick={submit}>
          {busy ? 'רושמים…' : shift ? `רישום ל${SHIFT_LABEL[shift.shiftType]} ${shortDay(shift.date).day}${partial && ordered ? `, ${range(startTime, endTime)}` : ''}` : 'רישום'}
        </button>
      </div>
    </Sheet>
  );
}
