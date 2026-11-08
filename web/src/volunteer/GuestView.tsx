import { ShiftBoard } from './ShiftBoard.tsx';
import { Brand } from '../ui.tsx';
import { EyeIcon, UserIcon } from '../icons.tsx';

/** Read-only guest view: the published shift board with names, no sign-in and no actions. */
export function GuestView() {
  return (
    <div className="site">
      <header className="site-head">
        <div className="site-head-inner">
          <Brand href="#/guest" subtitle="מערכת שיבוץ מתנדבי משטרה" />
          <span className="guest-tag">
            <EyeIcon size={15} />
            צפייה כאורח
          </span>
          <a className="site-who" href="#/">
            <UserIcon size={16} />
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
