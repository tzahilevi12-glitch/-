import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import type { Me, Notification } from '../types.ts';
import { Avatar, Brand, CertMark, LoadState, Sheet, useLoad } from '../ui.tsx';
import { BellIcon, CalendarIcon, ClipboardIcon, UserIcon } from '../icons.tsx';
import type { ReactNode } from 'react';
import { MyShifts } from './MyShifts.tsx';
import { Profile } from './Profile.tsx';
import { ShiftBoard } from './ShiftBoard.tsx';

type Tab = 'mine' | 'board' | 'profile';

function PublishedPopup({ notes, onClose }: { notes: Notification[]; onClose: (goToBoard: boolean) => void }) {
  const latest = notes[0];
  const earlier = notes.length - 1;
  return (
    <Sheet title={latest.kind === 'WEEK_UPDATED' ? 'נוספו משמרות' : 'פורסמו משמרות חדשות'} onClose={() => onClose(false)}>
      <div className="sheet-body">
        <span className="popup-icon">
          <BellIcon size={26} />
        </span>
        <p className="popup-message">{latest.message}</p>
        <p className="muted small">
          {latest.shiftCount === 1 ? 'משמרת אחת' : `${latest.shiftCount} משמרות`}
          {earlier > 0 ? (earlier === 1 ? ', ועוד עדכון קודם אחד' : `, ועוד ${earlier} עדכונים קודמים`) : ''}
        </p>
      </div>
      <div className="sheet-foot">
        <button className="btn btn-primary btn-block" onClick={() => onClose(true)}>
          לצפייה במשמרות
        </button>
      </div>
    </Sheet>
  );
}

const LINKS: Array<{ tab: Tab; href: string; label: string; icon: ReactNode }> = [
  { tab: 'mine', href: '#/mine', label: 'המשמרות שלי', icon: <ClipboardIcon size={17} /> },
  { tab: 'board', href: '#/board', label: 'לוח משמרות', icon: <CalendarIcon size={17} /> },
  { tab: 'profile', href: '#/profile', label: 'פרופיל', icon: <UserIcon size={17} /> },
];

export function VolunteerApp({ tab }: { tab: Tab }) {
  const { data: me, error, loading, reload, setData } = useLoad(() => api<Me>('/me'));
  const [notes, setNotes] = useState<Notification[]>([]);

  useEffect(() => {
    api<{ notifications: Notification[] }>('/me/notifications')
      .then((r) => setNotes(r.notifications))
      .catch(() => undefined);
  }, []);

  if (!me) return <LoadState error={loading ? null : error} onRetry={reload} />;

  async function closePopup(goToBoard: boolean) {
    setNotes([]);
    await api('/me/notifications/seen', { method: 'POST' }).catch(() => undefined);
    if (goToBoard) location.hash = '#/board';
  }

  return (
    <div className="site">
      <header className="site-head">
        <div className="site-head-inner">
          <Brand href="#/mine" subtitle="מערכת שיבוץ מתנדבי משטרה" />
          <nav className="site-nav" aria-label="ניווט">
            {LINKS.map((l) => (
              <a key={l.tab} href={l.href} className={tab === l.tab ? 'is-on' : ''} aria-current={tab === l.tab ? 'page' : undefined}>
                {l.icon}
                {l.label}
              </a>
            ))}
          </nav>
          <a className="site-who" href="#/profile" title={me.hasDrivingChip ? "יש צ'יפ נהיגה" : undefined}>
            <Avatar name={me.fullName} driver={me.hasDrivingChip} size="sm" />
            <span className="site-who-name">{me.fullName}</span>
            <CertMark certification={me.certification ?? 'NONE'} />
          </a>
        </div>
      </header>

      <main className="site-main">
        {tab === 'mine' && <MyShifts isDriver={me.hasDrivingChip} name={me.fullName} />}
        {tab === 'board' && <ShiftBoard isDriver={me.hasDrivingChip} certification={me.certification ?? 'NONE'} />}
        {tab === 'profile' && <Profile me={me} onSaved={setData} />}
      </main>

      {notes.length > 0 && <PublishedPopup notes={notes} onClose={closePopup} />}
    </div>
  );
}
