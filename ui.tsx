import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Badge as BadgeKind, Certification } from './types.ts';
import { CERT_LABEL, CERT_SHORT, fromMin, inWindow, windowOf } from './format.ts';
import { CarFrontIcon, CarIcon, CheckIcon, PoliceCarEmblem, ShieldIcon, WheelIcon, XIcon } from './icons.tsx';

// ───────────── icons (see icons.tsx) ─────────────

export { CarIcon, CheckIcon, ShieldIcon, WheelIcon };

// ───────────── brand ─────────────

/** Header lockup: police car emblem + system name. */
export function Brand({ subtitle, href }: { subtitle: string; href: string }) {
  return (
    <a className="brand" href={href}>
      <span className="brand-badge">
        <PoliceCarEmblem size={30} />
      </span>
      <span className="brand-text">
        <strong>משמרות מתנדבים</strong>
        <span>{subtitle}</span>
      </span>
    </a>
  );
}

/** Round initials badge next to a volunteer's name. */
export function Avatar({ name, driver, size = 'md' }: { name: string; driver?: boolean; size?: 'sm' | 'md' }) {
  const parts = name.trim().split(/\s+/);
  const initials = (parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '');
  return (
    <span className={`avatar avatar-${size}${driver ? ' is-driver' : ''}`} aria-hidden="true">
      {initials}
      {driver && (
        <span className="avatar-wheel">
          <WheelIcon size={size === 'sm' ? 9 : 11} strokeWidth={2.6} />
        </span>
      )}
    </span>
  );
}

/** "פותח ניידת" tag: this sign-up opens an additional patrol car. */
export function NewCarTag({ certification, long }: { certification?: Certification; long?: boolean }) {
  const level = certification && certification !== 'NONE' ? ` ${CERT_SHORT[certification]}` : '';
  return (
    <span className="car-tag" title={`פותח ניידת נוספת${level}`}>
      <CarIcon size={12} />
      {long ? `פותח ניידת${level}` : 'פותח ניידת'}
    </span>
  );
}

/** Colour of each qualification badge: blue = אק״מ / שלב א', green = שלב ב', red/gold = שלב ג'. */
export const CERT_TONE: Record<Certification, 'blue' | 'green' | 'red'> = {
  NONE: 'blue',
  LEVEL_A: 'blue',
  LEVEL_B: 'green',
  LEVEL_C: 'red',
};
const CERT_BADGE_TEXT: Record<Certification, string> = { NONE: 'אק״מ', LEVEL_A: "שלב א'", LEVEL_B: "שלב ב'", LEVEL_C: "שלב ג'" };
const CERT_CODE: Record<Certification, string> = { NONE: 'אק״מ', LEVEL_A: "א'", LEVEL_B: "ב'", LEVEL_C: "ג'" };

/**
 * Colour-coded qualification badge next to a volunteer's name.
 *   compact: short code (אק״מ / א' / ב' / ג') for tight spaces; the full name stays in the tooltip.
 */
export function CertMark({ certification, compact }: { certification: Certification | undefined; compact?: boolean }) {
  const c: Certification = certification ?? 'NONE';
  const tone = CERT_TONE[c];
  return (
    <span className={`cert-badge cert-${tone}${compact ? ' is-compact' : ''}`} title={CERT_LABEL[c]} aria-label={CERT_LABEL[c]}>
      <span className="cert-dot" aria-hidden="true" />
      {compact ? CERT_CODE[c] : CERT_BADGE_TEXT[c]}
    </span>
  );
}

/** Driving-chip badge: the volunteer can drive the patrol car. */
export function DriverBadge({ compact }: { compact?: boolean }) {
  return (
    <span className={`driver-badge${compact ? ' is-compact' : ''}`} title="יש צ'יפ נהיגה" aria-label="יש צ'יפ נהיגה">
      <CarFrontIcon size={compact ? 12 : 13} strokeWidth={2.4} />
      {!compact && 'נהג'}
    </span>
  );
}

/** Legend for the badges, shown above rosters. */
export function BadgeLegend() {
  return (
    <div className="badge-legend" aria-label="מקרא">
      <span className="badge-legend-title">מקרא:</span>
      <span className="cert-badge cert-blue">
        <span className="cert-dot" />
        אק״מ / שלב א'
      </span>
      <span className="cert-badge cert-green">
        <span className="cert-dot" />
        שלב ב'
      </span>
      <span className="cert-badge cert-red">
        <span className="cert-dot" />
        שלב ג'
      </span>
      <DriverBadge />
      <span className="car-tag">
        <CarIcon size={12} />
        פותח ניידת
      </span>
    </div>
  );
}

// ───────────── badges ─────────────

export function ShiftBadge({ badge }: { badge: BadgeKind }) {
  if (badge === 'FULL') return <span className="badge badge-full">מלא</span>;
  if (badge === 'DRIVER_NEEDED') {
    return (
      <span className="badge badge-driver">
        <WheelIcon size={14} />
        דרוש נהג
      </span>
    );
  }
  return <span className="badge badge-open">פתוח לכולם</span>;
}

export function DriverChip({ small }: { small?: boolean }) {
  return (
    <span className={`chip-mark${small ? ' chip-mark-sm' : ''}`} title="יש צ'יפ נהיגה" aria-label="נהג/ת">
      <WheelIcon size={small ? 12 : 14} />
    </span>
  );
}

// ───────────── duty bar ─────────────

export interface DutyLane {
  key: string;
  label?: string;
  startTime: string;
  endTime: string;
  driver?: boolean;
  pending?: boolean;
  highlight?: boolean;
}

/**
 * The shift as a timeline: hour ticks across the shift window and one lane per
 * person (or the hours being chosen). Drivers are drawn in amber.
 */
export function DutyBar({ start, end, lanes, compact }: { start: string; end: string; lanes: DutyLane[]; compact?: boolean }) {
  const w = windowOf(start, end);
  const span = w.end - w.start;
  const pct = (m: number) => `${((m - w.start) / span) * 100}%`;
  const ticks: number[] = [];
  for (let m = Math.ceil(w.start / 60) * 60; m <= w.end; m += 60) ticks.push(m);
  const labelEvery = span > 8 * 60 ? 3 : span > 4 * 60 ? 2 : 1;

  return (
    <div className={`duty${compact ? ' duty-compact' : ''}`}>
      <div className="duty-track">
        {ticks.map((m) => (
          <span key={m} className="duty-tick" style={{ insetInlineStart: pct(m) }} />
        ))}
        {lanes.map((l) => {
          const s = inWindow(l.startTime, w);
          let e = inWindow(l.endTime, w);
          if (e <= s) e += 1440;
          return (
            <div
              key={l.key}
              className={`duty-lane${l.driver ? ' is-driver' : ''}${l.pending ? ' is-pending' : ''}${l.highlight ? ' is-highlight' : ''}`}
              style={{ insetInlineStart: pct(s), width: `calc(${pct(e)} - ${pct(s)})` }}
              title={`${l.label ?? ''} ${l.startTime}–${l.endTime}`.trim()}
            >
              {!compact && l.label && <span className="duty-name">{l.label}</span>}
            </div>
          );
        })}
      </div>
      {!compact && (
        <div className="duty-scale" aria-hidden="true">
          {ticks
            .filter((m) => (m / 60) % labelEvery === 0)
            .map((m) => {
              const at = (m - w.start) / span;
              const align = at < 0.06 ? 'is-start' : at > 0.94 ? 'is-end' : '';
              return (
                <span key={m} className={align} style={{ insetInlineStart: pct(m) }}>
                  {fromMin(m)}
                </span>
              );
            })}
        </div>
      )}
    </div>
  );
}

// ───────────── dialogs ─────────────

export function Sheet({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`sheet${wide ? ' sheet-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="סגירה">
            <XIcon size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ───────────── toast ─────────────

export function toast(message: string, tone: 'ok' | 'error' = 'ok') {
  window.dispatchEvent(new CustomEvent('pv:toast', { detail: { message, tone } }));
}

export function Toaster() {
  const [t, setT] = useState<{ message: string; tone: string; id: number } | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const on = (e: Event) => {
      const { message, tone } = (e as CustomEvent).detail;
      setT({ message, tone, id: Date.now() });
      clearTimeout(timer);
      timer = setTimeout(() => setT(null), 4200);
    };
    window.addEventListener('pv:toast', on);
    return () => window.removeEventListener('pv:toast', on);
  }, []);
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {t && (
        <div key={t.id} className={`toast toast-${t.tone}`}>
          {t.message}
        </div>
      )}
    </div>
  );
}

// ───────────── data loading ─────────────

export function useLoad<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await run());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'הטעינה נכשלה.');
    } finally {
      setLoading(false);
    }
  }, [run]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, error, loading, reload, setData };
}

export function LoadState({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  if (error) {
    return (
      <div className="empty">
        <p>{error}</p>
        <button className="btn btn-ghost" onClick={onRetry}>
          ניסיון נוסף
        </button>
      </div>
    );
  }
  return <div className="loading" aria-label="טוען" />;
}

// ───────────── 24-hour time picker (native time inputs follow the browser's 12/24h locale) ─────────────

const QUARTER_HOURS = Array.from({ length: 96 }, (_, i) => fromMin(i * 15));

export function TimeSelect({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const options = QUARTER_HOURS.includes(value) ? QUARTER_HOURS : [...QUARTER_HOURS, value].sort();
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select className="input ltr-input" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((t) => (
          <option key={t}>{t}</option>
        ))}
      </select>
    </label>
  );
}
