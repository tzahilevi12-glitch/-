/**
 * Aceternity-style effects, written in plain React + CSS (no framer-motion / Tailwind needed,
 * so `node web/build.mjs` stays dependency-free):
 *  - <BackgroundBeams/>   glowing blue/red light rays sweeping behind the hero (inline SVG)
 *  - <SpotlightTracker/>  one delegated pointer listener: a soft police-blue glow follows the
 *                         cursor on any `.spotlight` element, plus subtle 3D tilt on `.spotlight-tilt`
 *  - <CardSpotlight/>     convenience wrapper that renders a `.spotlight` element
 *  - `.moving-border`     luminous border that travels around an element (CSS only, see aceternity.css)
 * Springs: CSS `linear()` easings generated from a damped-spring simulation (aceternity.css).
 */
import { useEffect, type ElementType, type ReactNode } from 'react';

// ───────── Background Beams ─────────

const BEAM_COUNT = 22;
/** A family of long S-curves fanning across the header (the classic "beams" geometry). */
const BEAM_PATHS = Array.from({ length: BEAM_COUNT }, (_, i) => {
  const dx = i * 14;
  const dy = i * 16;
  return `M${-380 + dx} ${-189 - dy}C${-380 + dx} ${-189 - dy} ${-312 + dx} ${216 - dy} ${152 + dx} ${343 - dy}C${616 + dx} ${470 - dy} ${684 + dx} ${875 - dy} ${684 + dx} ${875 - dy}`;
});
/** The beams that carry a travelling light (every other curve, alternating blue/red). */
const LIT = BEAM_PATHS.map((d, i) => ({ d, i })).filter(({ i }) => i % 3 === 1);

export function BackgroundBeams({ className = '' }: { className?: string }) {
  return (
    <div className={`beams ${className}`} aria-hidden="true">
      <svg className="beams-svg" viewBox="0 0 696 316" preserveAspectRatio="none" fill="none">
        <defs>
          <radialGradient id="beams-base" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(352 34) rotate(90) scale(555 1560)">
            <stop offset="0.07" stopColor="#38bdf8" />
            <stop offset="0.3" stopColor="#1d4ed8" />
            <stop offset="1" stopColor="#1d4ed8" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="beam-blue" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#0ea5e9" stopOpacity="0" />
            <stop offset="0.4" stopColor="#38bdf8" />
            <stop offset="0.7" stopColor="#93c5fd" />
            <stop offset="1" stopColor="#3b82f6" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="beam-red" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ef4444" stopOpacity="0" />
            <stop offset="0.4" stopColor="#f87171" />
            <stop offset="0.7" stopColor="#fda4af" />
            <stop offset="1" stopColor="#ef4444" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* faint static web of rays */}
        <path className="beams-base" d={BEAM_PATHS.join('')} stroke="url(#beams-base)" strokeOpacity="0.14" strokeWidth="0.7" vectorEffect="non-scaling-stroke" />
        {/* travelling lights: a short bright segment slides along each lit curve */}
        {LIT.map(({ d, i }, n) => {
          const red = n % 2 === 1;
          const style = {
            animationDuration: `${7 + ((i * 37) % 6)}s`,
            animationDelay: `${-((i * 53) % 9)}s`,
          };
          return (
            <g key={i}>
              <path className="beam-glow" d={d} pathLength={100} vectorEffect="non-scaling-stroke" stroke={red ? 'url(#beam-red)' : 'url(#beam-blue)'} style={style} />
              <path className="beam" d={d} pathLength={100} vectorEffect="non-scaling-stroke" stroke={red ? 'url(#beam-red)' : 'url(#beam-blue)'} style={style} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ───────── Card Spotlight (cursor-following glow + subtle 3D depth) ─────────

const MAX_TILT = 3; // degrees

/**
 * Mount once. Tracks the mouse over any `.spotlight` element and sets
 * --mx / --my (glow position) and --rx / --ry (tilt) on it, at most once per frame.
 * Touch input is ignored (no hover on phones). Uses a data attribute, not a class,
 * so React re-renders never wipe the state.
 */
export function SpotlightTracker() {
  useEffect(() => {
    let lit: HTMLElement | null = null;
    let frame = 0;
    let last: PointerEvent | null = null;

    const reset = (el: HTMLElement) => {
      delete el.dataset.spot;
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
    };
    const apply = () => {
      frame = 0;
      const e = last;
      if (!e) return;
      const el = (e.target instanceof Element ? e.target.closest<HTMLElement>('.spotlight') : null) ?? null;
      if (lit && lit !== el) reset(lit);
      lit = el;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      el.style.setProperty('--mx', `${x}px`);
      el.style.setProperty('--my', `${y}px`);
      if (el.classList.contains('spotlight-tilt')) {
        const px = Math.min(1, Math.max(0, x / r.width)) - 0.5;
        const py = Math.min(1, Math.max(0, y / r.height)) - 0.5;
        el.style.setProperty('--ry', `${(px * 2 * MAX_TILT).toFixed(2)}deg`);
        el.style.setProperty('--rx', `${(-py * 2 * MAX_TILT).toFixed(2)}deg`);
      }
      el.dataset.spot = 'on';
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      last = e;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const onLeave = () => {
      if (lit) reset(lit);
      lit = null;
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    window.addEventListener('blur', onLeave);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}

/** Aceternity-style CardSpotlight wrapper: any element that should glow under the cursor. */
export function CardSpotlight({
  as: Tag = 'div',
  className = '',
  tilt = false,
  children,
  ...rest
}: { as?: ElementType; className?: string; tilt?: boolean; children?: ReactNode } & Record<string, unknown>) {
  return (
    <Tag className={`spotlight${tilt ? ' spotlight-tilt' : ''} ${className}`.trim()} {...rest}>
      {children}
    </Tag>
  );
}

// ───────── Moving Border ─────────

/**
 * Aceternity-style MovingBorder: a luminous comet travelling around the parent's border.
 * Put it as the first child of a positioned element (e.g. a `.spotlight` card). The ring is
 * masked to a 1.5px border and the comet only rotates (transform), so the GPU does the work.
 */
export function MovingBorder({ tone }: { tone: 'gold' | 'crimson' }) {
  return (
    <span className={`mb-ring mb-ring-${tone}`} aria-hidden="true">
      <span className="mb-comet" />
    </span>
  );
}
