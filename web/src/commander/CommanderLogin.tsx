import { useState, type FormEvent } from 'react';
import { api, setSession } from '../api.ts';
import type { Me } from '../types.ts';
import { LockIcon, PoliceCarEmblem, UserIcon } from '../icons.tsx';

export function CommanderLogin() {
  const [fullName, setFullName] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ token: string; user: Me }>('/public/commander', { method: 'POST', body: { fullName: fullName.trim(), pin } });
      setSession({ token: res.token, role: res.user.role, fullName: res.user.fullName }, 'commander');
      location.hash = '#/commander';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'הכניסה נכשלה.');
      setBusy(false);
    }
  }

  return (
    <div className="cmd-login">
      <form className="panel cmd-login-card" onSubmit={submit}>
        <span className="brand-badge brand-badge-lg cmd-login-emblem">
          <PoliceCarEmblem size={42} />
        </span>
        <h1>כניסת מזין משמרות</h1>
        <p className="muted">תכנון השבוע, פרסום משמרות ומעקב אחרי מי במשמרת.</p>
        <label className="field">
          <span className="field-label">שם מלא</span>
          <span className="input-wrap">
            <UserIcon size={18} />
            <input className="input has-icon" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
          </span>
        </label>
        <label className="field">
          <span className="field-label">קוד תחנה</span>
          <span className="input-wrap">
            <LockIcon size={18} />
            <input className="input has-icon ltr-input" type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} />
          </span>
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-primary btn-block" disabled={busy || fullName.trim().length < 2 || !pin}>
          {busy ? 'נכנסים…' : 'כניסה'}
        </button>
        <a className="enter-commander" href="#/">
          כניסת מתנדבים
        </a>
      </form>
    </div>
  );
}
