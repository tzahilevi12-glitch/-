import { useState } from 'react';
import { api } from '../api.ts';
import type { Volunteer } from '../types.ts';
import { LoadState, WheelIcon, toast, useLoad } from '../ui.tsx';

export function Volunteers({ refreshKey }: { refreshKey: number }) {
  const [q, setQ] = useState('');
  const { data, error, loading, reload, setData } = useLoad(
    () => api<{ users: Volunteer[] }>(`/admin/users${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`),
    [q, refreshKey],
  );
  const [busyId, setBusyId] = useState<string | null>(null);

  async function update(v: Volunteer, patch: Partial<Pick<Volunteer, 'hasDrivingChip' | 'isActive'>>, done: string) {
    setBusyId(v.id);
    try {
      const r = await api<{ user: Volunteer; cancelledRegistrations: number }>(`/admin/users/${v.id}`, { method: 'PATCH', body: patch });
      setData((d) => d && { users: d.users.map((u) => (u.id === v.id ? { ...u, ...r.user, upcomingShifts: patch.isActive === false ? 0 : u.upcomingShifts } : u)) });
      toast(r.cancelledRegistrations ? `${done} בוטלו ${r.cancelledRegistrations} הרשמות עתידיות.` : done);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'העדכון נכשל.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="cmd-page">
      <div className="week-head">
        <h1>מתנדבים</h1>
        <p className="week-status">מתנדבים נכנסים עם השם שלהם. כאן אפשר לתקן צ'יפ נהיגה או להשהות מתנדב.</p>
        <input className="input search" type="search" placeholder="חיפוש לפי שם" value={q} onChange={(e) => setQ(e.target.value)} aria-label="חיפוש מתנדבים" />
      </div>

      {!data ? (
        <LoadState error={loading ? null : error} onRetry={reload} />
      ) : data.users.length === 0 ? (
        <div className="empty">
          <p>{q ? 'אין מתנדבים בשם הזה.' : 'עדיין אין מתנדבים. אפשר לשלוח לצוות את הקישור לאתר.'}</p>
        </div>
      ) : (
        <table className="vol-table">
          <thead>
            <tr>
              <th>שם</th>
              <th>צ'יפ נהיגה</th>
              <th>משמרות קרובות</th>
              <th>סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {data.users.map((v) => (
              <tr key={v.id} className={v.isActive ? '' : 'is-paused'}>
                <td>{v.fullName}</td>
                <td>
                  <button
                    className={`chip-toggle${v.hasDrivingChip ? ' is-on' : ''}`}
                    aria-pressed={v.hasDrivingChip}
                    disabled={busyId === v.id}
                    onClick={() => update(v, { hasDrivingChip: !v.hasDrivingChip }, v.hasDrivingChip ? "הצ'יפ הוסר." : "הצ'יפ נוסף.")}
                  >
                    {v.hasDrivingChip ? (
                      <>
                        <WheelIcon size={14} /> יש צ'יפ
                      </>
                    ) : (
                      "אין צ'יפ"
                    )}
                  </button>
                </td>
                <td>{v.upcomingShifts}</td>
                <td>
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={busyId === v.id}
                    onClick={() => update(v, { isActive: !v.isActive }, v.isActive ? `${v.fullName} הושהה.` : `${v.fullName} הוחזר לפעילות.`)}
                  >
                    {v.isActive ? 'השהיה' : 'החזרה לפעילות'}
                  </button>
                  {!v.isActive && <span className="muted small"> מושהה</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
