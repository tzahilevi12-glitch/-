import { useState } from 'react';
import { api, getSession, setSession } from '../api.ts';
import type { Certification, Me } from '../types.ts';
import { CERTIFICATIONS, CERT_LABEL } from '../format.ts';
import { ShieldIcon, WheelIcon, toast } from '../ui.tsx';

export function Profile({ me, onSaved }: { me: Me; onSaved: (m: Me) => void }) {
  const [fullName, setFullName] = useState(me.fullName);
  const [chip, setChip] = useState(me.hasDrivingChip);
  const [certification, setCertification] = useState<Certification>(me.certification ?? 'NONE');
  const [busy, setBusy] = useState(false);
  const dirty = fullName.trim() !== me.fullName || chip !== me.hasDrivingChip || certification !== (me.certification ?? 'NONE');

  async function save() {
    setBusy(true);
    try {
      const updated = await api<Me>('/me', { method: 'PATCH', body: { fullName: fullName.trim(), hasDrivingChip: chip, certification } });
      const s = getSession('volunteer');
      if (s) setSession({ ...s, fullName: updated.fullName }, 'volunteer');
      onSaved(updated);
      toast('הפרופיל נשמר.');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'השמירה נכשלה.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    try {
      await api('/me/logout', { method: 'POST' });
    } finally {
      setSession(null, 'volunteer');
      location.hash = '#/';
    }
  }

  return (
    <section className="page">
      <h1 className="page-title">פרופיל</h1>

      <div className="panel">
        <label className="field">
          <span className="field-label">שם מלא</span>
          <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={80} />
        </label>

        <div className="field">
          <span className="field-label field-label-icon" id="chip-label">
            <WheelIcon size={16} />
            צ'יפ נהיגה
          </span>
          <div className="segmented" role="radiogroup" aria-labelledby="chip-label">
            <button role="radio" aria-checked={chip} className={chip ? 'is-on' : ''} onClick={() => setChip(true)}>
              <WheelIcon size={15} /> יש לי
            </button>
            <button role="radio" aria-checked={!chip} className={!chip ? 'is-on' : ''} onClick={() => setChip(false)}>
              אין לי
            </button>
          </div>
        </div>

        <div className="field">
          <span className="field-label field-label-icon" id="cert-label">
            <ShieldIcon size={16} />
            הסמכה
          </span>
          <div className="segmented segmented-3" role="radiogroup" aria-labelledby="cert-label">
            {CERTIFICATIONS.map((c) => (
              <button key={c} role="radio" aria-checked={certification === c} className={certification === c ? 'is-on' : ''} onClick={() => setCertification(c)}>
                {CERT_LABEL[c]}
              </button>
            ))}
          </div>
          <p className="muted small">השינויים חלים על המשמרות שכבר נרשמת אליהן ועל כל הרשמה מעכשיו.</p>
        </div>

        <button className="btn btn-primary btn-block" onClick={save} disabled={!dirty || busy || fullName.trim().length < 2}>
          {busy ? 'שומרים…' : 'שמירת שינויים'}
        </button>
      </div>

      <button className="btn btn-ghost btn-block signout" onClick={signOut}>
        יציאה מהמכשיר הזה
      </button>
    </section>
  );
}
