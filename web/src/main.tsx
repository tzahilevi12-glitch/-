import './app.css';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { getSession, isCommanderHash } from './api.ts';
import { Toaster } from './ui.tsx';
import { EnterScreen } from './volunteer/EnterScreen.tsx';
import { VolunteerApp } from './volunteer/VolunteerApp.tsx';
import { GuestView } from './volunteer/GuestView.tsx';
import { CommanderLogin } from './commander/CommanderLogin.tsx';
import { CommanderApp } from './commander/CommanderApp.tsx';

function useHash() {
  const [hash, setHash] = useState(location.hash || '#/');
  useEffect(() => {
    const on = () => setHash(location.hash || '#/');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

/** Re-render when either sign-in changes. */
function useSessionVersion() {
  const [v, setV] = useState(0);
  useEffect(() => {
    const on = () => setV((x) => x + 1);
    window.addEventListener('pv:session', on);
    window.addEventListener('storage', on);
    return () => {
      window.removeEventListener('pv:session', on);
      window.removeEventListener('storage', on);
    };
  }, []);
  return v;
}

/**
 * Routing:
 *   #/commander, #/commander/volunteers → commander area (its own sign-in)
 *   #/guest → read-only guest view (no sign-in)
 *   everything else, including "/" and "#/" → volunteer area
 * The base URL never redirects to the commander area.
 */
function App() {
  const hash = useHash();
  useSessionVersion();

  if (isCommanderHash(hash)) {
    const session = getSession('commander');
    if (!session) return <CommanderLogin />;
    return <CommanderApp tab={hash === '#/commander/volunteers' ? 'volunteers' : 'roster'} />;
  }

  if (hash === '#/guest') return <GuestView />;

  const session = getSession('volunteer');
  if (!session) return <EnterScreen />;
  const tab = hash.startsWith('#/board') ? 'board' : hash.startsWith('#/profile') ? 'profile' : 'mine';
  return <VolunteerApp tab={tab} />;
}

createRoot(document.getElementById('root')!).render(
  <>
    <App />
    <Toaster />
  </>,
);
