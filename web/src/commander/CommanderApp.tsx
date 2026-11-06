import { useCallback, useState } from 'react';
import { api, getSession, setSession } from '../api.ts';
import { CancellationAlerts } from './CancellationAlerts.tsx';
import { Volunteers } from './Volunteers.tsx';
import { WeekView } from './WeekView.tsx';

export function CommanderApp({ tab }: { tab: 'roster' | 'volunteers' }) {
  const session = getSession();
  const [refreshKey, setRefreshKey] = useState(0);
  const onNewAlert = useCallback(() => setRefreshKey((k) => k + 1), []);

  async function signOut() {
    try {
      await api('/me/logout', { method: 'POST' });
    } finally {
      setSession(null);
      location.hash = '#/commander';
    }
  }

  return (
    <div className="cmd">
      <header className="cmd-bar">
        <span className="site-brand">משמרות מתנדבים</span>
        <nav className="cmd-tabs" aria-label="ניווט">
          <a href="#/commander" className={tab === 'roster' ? 'is-on' : ''} aria-current={tab === 'roster' ? 'page' : undefined}>
            לוח שבועי
          </a>
          <a href="#/commander/volunteers" className={tab === 'volunteers' ? 'is-on' : ''} aria-current={tab === 'volunteers' ? 'page' : undefined}>
            מתנדבים
          </a>
        </nav>
        <span className="cmd-who">
          {session?.fullName}
          <button className="link-btn" onClick={signOut}>
            יציאה
          </button>
        </span>
      </header>
      <main>{tab === 'roster' ? <WeekView refreshKey={refreshKey} /> : <Volunteers refreshKey={refreshKey} />}</main>
      <CancellationAlerts onNew={onNewAlert} />
    </div>
  );
}
