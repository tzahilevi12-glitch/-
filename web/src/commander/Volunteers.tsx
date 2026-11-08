import { useState } from 'react';
import { api } from '../api.ts';
import type { Certification, Volunteer } from '../types.ts';
import { CERTIFICATIONS, CERT_LABEL } from '../format.ts';
import { Avatar, CertMark, DriverBadge, LoadState, toast, useLoad } from '../ui.tsx';
import { CarFrontIcon, SearchIcon, ShieldIcon, UsersIcon } from '../icons.tsx';

export function Volunteers({ refreshKey }: { refreshKey: number }) {
  const [q, setQ] = useState('');
  const { data, error, loading, reload, setData } = useLoad(
    () => api<{ users: Volunteer[] }>(`/admin/users${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`),
    [q, refreshKey],
  );
  const [busyId, setBusyId] = useState<string | null>(null);

  async function update(v: Volunteer, patch: Partial<Pick<Volunteer, 'hasDrivingChip' | 'isActive' | 'certification'>>, done: string) {
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
        <h1>
          <UsersIcon size={24} />
          מתנדבים
        </h1>
        <p className="week-status">מתנדבים נכנסים עם השם שלהם. כאן אפשר לתקן צ'יפ נהיגה או הסמכה, או להשהות מתנדב.</p>
        <span className="input-wrap search">
          <SearchIcon size={18} />
          <input className="input has-icon" type="search" placeholder="חיפוש לפי שם" value={q} onChange={(e) => setQ(e.target.value)} aria-label="חיפוש מתנדבים" />
        </span>
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
              <th>
                <span className="th-icon">
                  <CarFrontIcon size={14} /> צ'יפ נהיגה
                </span>
              </th>
              <th>
                <span className="th-icon">
                  <ShieldIcon size={14} /> הסמכה
                </span>
              </th>
              <th>משמרות קרובות</th>
              <th>סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {data.users.map((v) => (
              <tr key={v.id} className={v.isActive ? '' : 'is-paused'}>
                <td>
                  <span className="vol-name">
                    <Avatar name={v.fullName} size="sm" />
                    {v.fullName}
                    <CertMark certification={v.certification} />
                    {v.hasDrivingChip && <DriverBadge />}
                  </span>
                </td>
                <td>
                  <button
                    className={`chip-toggle${v.hasDrivingChip ? ' is-on' : ''}`}
                    aria-pressed={v.hasDrivingChip}
                    disabled={busyId === v.id}
                    onClick={() => update(v, { hasDrivingChip: !v.hasDrivingChip }, v.hasDrivingChip ? "הצ'יפ הוסר." : "הצ'יפ נוסף.")}
                  >
                    {v.hasDrivingChip ? (
                      <>
                        <CarFrontIcon size={14} /> יש צ'יפ
                      </>
                    ) : (
                      "אין צ'יפ"
                    )}
                  </button>
                </td>
                <td>
                  <select
                    className="input input-sm"
                    value={v.certification ?? 'NONE'}
                    disabled={busyId === v.id}
                    aria-label={`הסמכה של ${v.fullName}`}
                    onChange={(e) => {
                      const c = e.target.value as Certification;
                      void update(v, { certification: c }, `ההסמכה עודכנה: ${CERT_LABEL[c]}.`);
                    }}
                  >
                    {CERTIFICATIONS.map((c) => (
                      <option key={c} value={c}>
                        {CERT_LABEL[c]}
                      </option>
                    ))}
                  </select>
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
