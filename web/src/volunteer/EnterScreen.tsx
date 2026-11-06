import { useState, type FormEvent } from 'react';
import { api, setSession } from '../api.ts';
import type { Me } from '../types.ts';
import { WheelIcon } from '../ui.tsx';

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

export function EnterScreen() {
  const [fullName, setFullName] = useState('');
  const [chip, setChip] = useState<boolean | null>(null);
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
        body: { fullName: fullName.trim(), hasDrivingChip: chip },
      });
      setSession({ token: res.token, role: res.user.role, fullName: res.user.fullName });
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
          <legend className="field-label">צ'יפ נהיגה</legend>
          <div className="choice-pair">
            <button
              type="button"
              className={`choice${chip === true ? ' is-selected' : ''}`}
              aria-pressed={chip === true}
              onClick={() => setChip(true)}
            >
              <WheelIcon size={22} />
              <span className="choice-title">יש לי צ'יפ נהיגה</span>
              <span className="choice-sub">מורשה לנהוג בניידת</span>
            </button>
            <button
              type="button"
              className={`choice${chip === false ? ' is-selected' : ''}`}
              aria-pressed={chip === false}
              onClick={() => setChip(false)}
            >
              <span className="choice-dash" aria-hidden="true" />
              <span className="choice-title">אין לי צ'יפ נהיגה</span>
              <span className="choice-sub">מצטרף לסיור כשותף</span>
            </button>
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
