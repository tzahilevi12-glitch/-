import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Badge as BadgeKind, Certification } from './types.ts';
import { CERT_LABEL, CERT_SHORT, fromMin, inWindow, windowOf } from './format.ts';

// ───────────── icons ─────────────

export function WheelIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.2" />
      <path d="M3.5 10.5h6.3M14.2 10.5h6.3M12 14.2V21" />
    </svg>
  );
}

/** Police badge / shield — Level B / Level C qualification. */
export function ShieldIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6L12 3z" />
      <path d="M12 8.2l1.2 2.5 2.7.3-2 1.8.6 2.7-2.5-1.4-2.5 1.4.6-2.7-2-1.8 2.7-.3z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Small "שלב א'" / "שלב ב'" / "שלב ג'" tag next to a volunteer's name. */
export function CertMark({ certification }: { certification: Certification }) {
  if (!certification || certification === 'NONE') return null;
  return (
    <span className="cert-mark" title={CERT_LABEL[certification]}>
      <ShieldIcon size={11} />
      {CERT_SHORT[certification]}
    </span>
  );
}

export function CheckIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
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
            ✕
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
