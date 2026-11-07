import { useState, type FormEvent } from 'react';
import { api, setSession } from '../api.ts';
import type { Certification, Me } from '../types.ts';
import { ShieldIcon, WheelIcon } from '../ui.tsx';

/** The station's day: three shifts with the handover overlaps (time runs right to left). */
function DayStrip() {
  const rows = [
    { label: 'בוקר', from: 6, to: 15 },
    { label: 'צהריים', from: 14.5, to: 22 },
    { label: 'לילה', from: 21.5, to: 31 },
  ];
  const pct = (h: number) => `${((h - 6) / 25) * 100}%`;
  return (
    <div className="daystrip" aria-hidden="true">
      {rows.map((r) => (
        <div key={r.label} className="daystrip-row">
          <span className="daystrip-bar" style={{ insetInlineStart: pct(r.from), width: `calc(${pct(r.to)} - ${pct(r.from)})` }}>
            {r.label}
          </span>
        </div>
      ))}
      <div className="daystrip-scale">
        {[6, 12, 18, 24, 30].map((h, i, all) => (
          <span key={h} className={i === 0 ? 'is-start' : i === all.length - 1 ? 'is-end' : ''} style={{ insetInlineStart: pct(h) }}>
            {String(h % 24).padStart(2, '0')}:00
          </span>
        ))}
      </div>
    </div>
  );
}

const CERT_OPTIONS: Array<{ value: Certification; title: string; sub: string }> = [
  { value: 'NONE', title: 'ללא הסמכה', sub: 'מתנדב/ת' },
  { value: 'LEVEL_B', title: "מוסמך שלב ב'", sub: 'יכול לפתוח ניידת נוספת' },
  { value: 'LEVEL_C', title: "מוסמך שלב ג'", sub: 'יכול לפתוח ניידת נוספת' },
];

export function EnterScreen() {
  const [fullName, setFullName] = useState('');
  const [chip, setChip] = useState<boolean | null>(null);
  const [certification, setCertification] = useState<Certification>('NONE');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (fullName.trim().length < 2) return setError('יש להזין שם מלא.');
    if (chip === null) return setError("יש לבחור אם יש לך צ'יפ נהיגה.");
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ token: string; user: Me }>('/public/enter', {
        method: 'POST',
        body: { fullName: fullName.trim(), hasDrivingChip: chip, certification },
        area: 'volunteer',
      });
      setSession({ token: res.token, role: res.user.role, fullName: res.user.fullName }, 'volunteer');
      location.hash = '#/board';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'הכניסה נכשלה.');
      setBusy(false);
    }
  }

  return (
    <div className="enter">
      <header className="enter-hero">
        <p className="enter-kicker">מתנדבי תחנת המשטרה</p>
        <h1>בחירת משמרות לשבוע</h1>
        <DayStrip />
      </header>
      <div className="police-band" aria-hidden="true" />

      <form className="enter-form" onSubmit={submit} noValidate>
        <label className="field">
          <span className="field-label">שם מלא</span>
          <input
            className="input"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="name"
            placeholder="שם פרטי ושם משפחה"
            maxLength={80}
          />
        </label>

        <fieldset className="field">
          <legend className="field-label field-label-icon">
            <WheelIcon size={16} />
            צ'יפ נהיגה
          </legend>
          <div className="choice-pair">
            <button
              type="button"
              className={`choice${chip === true ? ' is-selected' : ''}`}
              aria-pressed={chip === true}
              onClick={() => setChip(true)}
            >
              <span className="choice-icon is-driver" aria-hidden="true">
                <WheelIcon size={20} />
              </span>
              <span className="choice-title">יש לי צ'יפ נהיגה</span>
              <span className="choice-sub">מורשה לנהוג בניידת</span>
            </button>
            <button
              type="button"
              className={`choice${chip === false ? ' is-selected' : ''}`}
              aria-pressed={chip === false}
              onClick={() => setChip(false)}
            >
              <span className="choice-icon" aria-hidden="true">
                <span className="choice-dash" />
              </span>
              <span className="choice-title">אין לי צ'יפ נהיגה</span>
              <span className="choice-sub">מצטרף לסיור כשותף</span>
            </button>
          </div>
        </fieldset>

        <fieldset className="field">
          <legend className="field-label field-label-icon">
            <ShieldIcon size={16} />
            הסמכה
          </legend>
          <div className="cert-row" role="radiogroup" aria-label="הסמכה">
            {CERT_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={certification === o.value}
                className={`cert-option${certification === o.value ? ' is-selected' : ''}`}
                onClick={() => setCertification(o.value)}
              >
                {o.value !== 'NONE' && <ShieldIcon size={18} />}
                <span className="choice-title">{o.title}</span>
                <span className="choice-sub">{o.sub}</span>
              </button>
            ))}
          </div>
        </fieldset>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'נכנסים…' : 'כניסה'}
        </button>
        <a className="enter-commander" href="#/commander">
          כניסת מזין משמרות
        </a>
      </form>
    </div>
  );
}
