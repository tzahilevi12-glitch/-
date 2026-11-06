import './app.css';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { getSession } from './api.ts';
import { Toaster } from './ui.tsx';
import { EnterScreen } from './volunteer/EnterScreen.tsx';
import { VolunteerApp } from './volunteer/VolunteerApp.tsx';
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

function useSession() {
  const [session, setS] = useState(getSession);
  useEffect(() => {
    const on = () => setS(getSession());
    window.addEventListener('pv:session', on);
    return () => window.removeEventListener('pv:session', on);
  }, []);
  return session;
}

function App() {
  const hash = useHash();
  const session = useSession();

  if (hash.startsWith('#/commander')) {
    if (session?.role !== 'ADMIN') return <CommanderLogin />;
    return <CommanderApp tab={hash.startsWith('#/commander/volunteers') ? 'volunteers' : 'roster'} />;
  }
  if (!session) return <EnterScreen />;
  if (session.role === 'ADMIN' && (hash === '#/' || hash === '')) {
    location.hash = '#/commander';
    return null;
  }
  const tab = hash.startsWith('#/board') ? 'board' : hash.startsWith('#/profile') ? 'profile' : 'mine';
  return <VolunteerApp tab={tab} />;
}

createRoot(document.getElementById('root')!).render(
  <>
    <App />
    <Toaster />
  </>,
);
