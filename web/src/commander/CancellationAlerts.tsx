import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.ts';
import type { StaffAlert } from '../types.ts';
import { whenLabel } from '../format.ts';
import { Sheet } from '../ui.tsx';

const POLL_MS = 30_000;

/**
 * Popup for the shift scheduler whenever volunteers cancel. Checks on load and every
 * 30 seconds; stays until the scheduler marks the alerts as read.
 */
export function CancellationAlerts({ onNew }: { onNew: () => void }) {
  const [alerts, setAlerts] = useState<StaffAlert[]>([]);
  const [busy, setBusy] = useState(false);
  const seen = useRef(new Set<string>());

  const check = useCallback(async () => {
    try {
      const r = await api<{ alerts: StaffAlert[] }>('/admin/alerts');
      const fresh = r.alerts.some((a) => !seen.current.has(a.id));
      r.alerts.forEach((a) => seen.current.add(a.id));
      setAlerts(r.alerts);
      if (fresh) onNew();
    } catch {
      /* try again on the next poll */
    }
  }, [onNew]);

  useEffect(() => {
    void check();
    const t = setInterval(check, POLL_MS);
    const onFocus = () => void check();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', onFocus);
    };
  }, [check]);

  if (!alerts.length) return null;

  async function acknowledge() {
    setBusy(true);
    try {
      await api('/admin/alerts/ack', { method: 'POST', body: { ids: alerts.map((a) => a.id) } });
      setAlerts([]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={alerts.length === 1 ? 'מתנדב ביטל משמרת' : `${alerts.length} ביטולי משמרות`} onClose={acknowledge}>
      <div className="sheet-body">
        <ul className="alert-list">
          {alerts.map((a) => (
            <li key={a.id} className={`alert-item${a.urgent ? ' is-urgent' : ''}`}>
              {a.urgent && <span className="urgent-tag">פחות מ-24 שעות לפני המשמרת</span>}
              <p className="alert-message">{a.message}</p>
                            <p className="muted small">{whenLabel(a.createdAt)}</p>
            </li>
          ))}
        </ul>
      </div>
      <div className="sheet-foot">
        <button className="btn btn-primary btn-block" onClick={acknowledge} disabled={busy}>
          קראתי
        </button>
      </div>
    </Sheet>
  );
}
