/**
 * Tactical hero banner ("יחידת מתנדבים | תחנת חולון") with an inline SVG patrol car and a generic
 * police-style shield — drawn in code, so it loads instantly and never depends on an image file.
 * The shield is a generic badge shape, not an official emblem.
 */

/** Side view of a modern patrol car with a red/blue light bar (the light bar glows via CSS). */
export function PatrolCarArt({ className = '' }: { className?: string }) {
  return (
    <svg className={`patrol-art ${className}`} viewBox="0 0 340 130" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="pc-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1e3a5f" />
          <stop offset="1" stopColor="#0b1a30" />
        </linearGradient>
        <linearGradient id="pc-glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7dd3fc" stopOpacity="0.55" />
          <stop offset="1" stopColor="#0ea5e9" stopOpacity="0.15" />
        </linearGradient>
        <filter id="pc-glow" x="-60%" y="-200%" width="220%" height="500%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>
      {/* ground shadow */}
      <ellipse cx="170" cy="116" rx="150" ry="7" fill="#000" opacity="0.35" />
      {/* body */}
      <path
        d="M22 92 C22 80 30 72 44 70 L92 64 L130 38 C138 33 146 31 156 31 L222 31 C234 31 242 35 250 42 L276 64 L304 70 C316 73 322 80 322 90 L322 98 C322 102 319 104 315 104 L28 104 C24 104 22 101 22 97 Z"
        fill="url(#pc-body)"
        stroke="#38bdf8"
        strokeOpacity="0.55"
        strokeWidth="1.5"
      />
      {/* windows */}
      <path d="M104 64 L136 42 C141 39 146 38 152 38 L184 38 L184 64 Z" fill="url(#pc-glass)" />
      <path d="M192 38 L222 38 C230 38 236 41 242 47 L262 64 L192 64 Z" fill="url(#pc-glass)" />
      {/* police stripe */}
      <path d="M30 82 L316 82 L316 89 L30 89 Z" fill="#2563eb" opacity="0.9" />
      <path d="M30 89 L316 89 L316 92 L30 92 Z" fill="#f8fafc" opacity="0.85" />
      {/* door line + handle */}
      <path d="M188 66 L188 102" stroke="#38bdf8" strokeOpacity="0.35" strokeWidth="1.2" />
      <rect x="160" y="70" width="14" height="3" rx="1.5" fill="#cbd5e1" opacity="0.7" />
      <rect x="208" y="70" width="14" height="3" rx="1.5" fill="#cbd5e1" opacity="0.7" />
      {/* lights */}
      <path d="M306 74 L320 78 L320 84 L306 82 Z" fill="#fde68a" />
      <path d="M24 78 L34 76 L34 84 L24 85 Z" fill="#ef4444" opacity="0.9" />
      {/* light bar (animated glow) */}
      <g className="patrol-lightbar">
        <rect className="lb-red-glow" x="150" y="20" width="30" height="10" rx="4" fill="#ef4444" filter="url(#pc-glow)" />
        <rect className="lb-blue-glow" x="182" y="20" width="30" height="10" rx="4" fill="#3b82f6" filter="url(#pc-glow)" />
        <rect x="150" y="22" width="30" height="9" rx="3" fill="#ef4444" />
        <rect x="182" y="22" width="30" height="9" rx="3" fill="#3b82f6" />
        <rect x="178" y="22" width="6" height="9" fill="#e2e8f0" />
      </g>
      {/* wheels */}
      {[80, 262].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="104" r="19" fill="#020617" stroke="#334155" strokeWidth="3" />
          <circle cx={cx} cy="104" r="8" fill="#64748b" />
          <circle cx={cx} cy="104" r="3" fill="#0f172a" />
        </g>
      ))}
    </svg>
  );
}

/** Generic shield badge (not an official insignia). */
export function ShieldEmblem({ size = 56 }: { size?: number }) {
  return (
    <svg className="shield-emblem" width={size} height={size * 1.15} viewBox="0 0 64 74" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="sh-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1d4ed8" />
          <stop offset="1" stopColor="#0b1a30" />
        </linearGradient>
      </defs>
      <path d="M32 3 L58 12 L58 36 C58 53 46 65 32 71 C18 65 6 53 6 36 L6 12 Z" fill="url(#sh-fill)" stroke="#38bdf8" strokeWidth="2" />
      <path d="M32 10 L51 17 L51 36 C51 49 42 58 32 63 C22 58 13 49 13 36 L13 17 Z" fill="none" stroke="#f8fafc" strokeOpacity="0.35" strokeWidth="1.2" />
      {/* chevron + light */}
      <path d="M20 34 L32 44 L44 34" fill="none" stroke="#f8fafc" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 26 L32 36 L44 26" fill="none" stroke="#38bdf8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="32" cy="18" r="3.5" fill="#ef4444" />
    </svg>
  );
}

/** The banner at the top of the board, my shifts, the guest view and the commander dashboard. */
export function HeroBanner({ subtitle, compact }: { subtitle: string; compact?: boolean }) {
  return (
    <section className={`hero${compact ? ' hero-compact' : ''}`} aria-label="יחידת מתנדבים | תחנת חולון">
      <span className="hero-lightbar" aria-hidden="true">
        <span className="lb-seg lb-seg-red" />
        <span className="lb-seg lb-seg-blue" />
        <span className="lb-sweep" />
      </span>
      <span className="hero-reflect" aria-hidden="true">
        <span className="hr-red" />
        <span className="hr-blue" />
      </span>
      <div className="hero-text">
        <span className="radar" aria-hidden="true">
          <span className="radar-sweep" />
          <span className="radar-ring" />
          <span className="radar-ring radar-ring-2" />
          <ShieldEmblem size={compact ? 40 : 50} />
        </span>
        <div>
          <p className="hero-kicker">משטרה · מערך המתנדבים</p>
          <h2 className="hero-title">יחידת מתנדבים | תחנת חולון</h2>
          <p className="hero-sub">{subtitle}</p>
        </div>
      </div>
      <PatrolCarArt className="hero-car" />
    </section>
  );
}
