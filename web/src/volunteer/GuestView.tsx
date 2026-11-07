import { ShiftBoard } from './ShiftBoard.tsx';

/** Read-only guest view: the published shift board with names, no sign-in and no actions. */
export function GuestView() {
  return (
    <div className="site">
      <header className="site-head">
        <div className="site-head-inner">
          <a className="site-brand" href="#/guest">
            משמרות מתנדבים
          </a>
          <span className="guest-tag">צפייה כאורח</span>
          <a className="site-who" href="#/">
            כניסה כמתנדב
          </a>
        </div>
      </header>
      <main className="site-main">
        <ShiftBoard readOnly />
      </main>
    </div>
  );
}
