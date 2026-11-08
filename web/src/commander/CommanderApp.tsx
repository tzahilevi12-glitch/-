import { useCallback, useState } from 'react';
import { api, getSession, setSession } from '../api.ts';
import { CancellationAlerts } from './CancellationAlerts.tsx';
import { CancelRequests } from './CancelRequests.tsx';
import { Volunteers } from './Volunteers.tsx';
import { WeekView } from './WeekView.tsx';
import { Avatar, Brand } from '../ui.tsx';
import { CalendarIcon, LogOutIcon, UsersIcon } from '../icons.tsx';

export function CommanderApp({ tab }: { tab: 'roster' | 'volunteers' }) {
  const session = getSession('commander');
  const [refreshKey, setRefreshKey] = useState(0);
  const onNewAlert = useCallback(() => setRefreshKey((k) => k + 1), []);

  async function signOut() {
    try {
      await api('/me/logout', { method: 'POST' });
    } finally {
      setSession(null, 'commander');
      location.hash = '#/commander';
    }
  }

  return (
    <div className="cmd">
      <header className="cmd-bar">
        <Brand href="#/commander" subtitle="לוח מזין המשמרות" />
        <nav className="cmd-tabs" aria-label="ניווט">
          <a href="#/commander" className={tab === 'roster' ? 'is-on' : ''} aria-current={tab === 'roster' ? 'page' : undefined}>
            <CalendarIcon size={17} />
            לוח שבועי
          </a>
          <a href="#/commander/volunteers" className={tab === 'volunteers' ? 'is-on' : ''} aria-current={tab === 'volunteers' ? 'page' : undefined}>
            <UsersIcon size={17} />
            מתנדבים
          </a>
        </nav>
        <span className="cmd-who">
          {session && <Avatar name={session.fullName} size="sm" />}
          <span className="site-who-name">{session?.fullName}</span>
          <button className="icon-btn icon-btn-light" onClick={signOut} aria-label="יציאה" title="יציאה">
            <LogOutIcon size={18} />
          </button>
        </span>
      </header>
      <main>
        <CancelRequests refreshKey={refreshKey} onChanged={onNewAlert} />
        {tab === 'roster' ? <WeekView refreshKey={refreshKey} onChanged={onNewAlert} /> : <Volunteers refreshKey={refreshKey} />}
      </main>
      <CancellationAlerts onNew={onNewAlert} />
    </div>
  );
}
