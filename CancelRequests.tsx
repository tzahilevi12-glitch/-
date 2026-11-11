import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.ts';
import type { CancelRequest } from '../types.ts';
import { SHIFT_LABEL, dayLabel, range, whenLabel } from '../format.ts';
import { Avatar, CertMark, DriverBadge, NewCarTag, toast } from '../ui.tsx';
import { CalendarIcon, CheckIcon, ClockIcon, HourglassIcon, ShiftTypeIcon, XIcon } from '../icons.tsx';

const POLL_MS = 30_000;

/**
 * Volunteers who asked to cancel 12 hours or less before their shift. Their seat stays taken until
 * the commander approves here (or in the shift panel). Checks on load and every 30 seconds.
 */
export function CancelRequests({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const [requests, setRequests] = useState<CancelRequest[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const known = useRef<Set<string> | null>(null);

  const check = useCallback(async () => {
    try {
      const r = await api<{ requests: CancelRequest[] }>('/admin/cancel-requests');
      // A new request since last check: refresh the week so the shift shows the mark too.
      if (known.current && r.requests.some((q) => !known.current!.has(q.registrationId))) onChanged();
      known.current = new Set(r.requests.map((q) => q.registrationId));
      setRequests(r.requests);
    } catch {
      /* try again on the next poll */
    }
  }, [onChanged]);

  useEffect(() => {
    void check();
  }, [check, refreshKey]);

  useEffect(() => {
    const t = setInterval(check, POLL_MS);
    const onFocus = () => void check();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', onFocus);
    };
  }, [check]);

  async function decide(q: CancelRequest, decision: 'APPROVE' | 'REJECT') {
    setBusyId(q.registrationId);
    try {
      await api(`/admin/registrations/${q.registrationId}/cancel-request`, { method: 'POST', body: { decision } });
      toast(decision === 'APPROVE' ? `הביטול של ${q.fullName} אושר. המקום התפנה.` : `הבקשה נדחתה. ${q.fullName} נשאר/ת במשמרת.`);
      setRequests((list) => list.filter((x) => x.registrationId !== q.registrationId));
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'הפעולה נכשלה.', 'error');
      void check();
    } finally {
      setBusyId(null);
    }
  }

  if (!requests.length) return null;

  return (
    <section className="cancel-requests" aria-label="בקשות ביטול">
      <header className="cancel-requests-head">
        <span className="cancel-requests-icon">
          <HourglassIcon size={18} />
        </span>
        <div>
          <h2>{requests.length === 1 ? 'בקשת ביטול ממתינה לאישורך' : `${requests.length} בקשות ביטול ממתינות לאישורך`}</h2>
          <p className="muted small">ביקשו לבטל פחות מ-12 שעות לפני המשמרת. עד לאישור המקום נשאר תפוס.</p>
        </div>
      </header>
      <ul className="request-list">
        {requests.map((q) => (
          <li key={q.registrationId} className="request-item">
            <Avatar name={q.fullName} />
            <div className="request-main">
              <span className="person-name">
                {q.fullName}
                <CertMark certification={q.certification} />
                {q.hasDrivingChip && <DriverBadge />}
                {q.opensNewCar && <NewCarTag certification={q.certification} />}
              </span>
              <span className="person-sub">
                <span className="meta-item">
                  <ShiftTypeIcon type={q.shiftType} size={13} />
                  {SHIFT_LABEL[q.shiftType]}
                </span>
                <span className="meta-item">
                  <CalendarIcon size={13} />
                  {dayLabel(q.date)}
                </span>
                <span className="meta-item">
                  <ClockIcon size={13} />
                  {range(q.startTime, q.endTime)}
                </span>
              </span>
              <span className="muted small">ביקש/ה {whenLabel(q.requestedAt)}</span>
            </div>
            <div className="request-actions">
              <button className="btn btn-danger btn-sm" disabled={busyId !== null} onClick={() => decide(q, 'APPROVE')}>
                <CheckIcon size={14} />
                אישור ביטול
              </button>
              <button className="btn btn-ghost btn-sm" disabled={busyId !== null} onClick={() => decide(q, 'REJECT')}>
                <XIcon size={14} />
                דחייה
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
