/**
 * Icon set for the station shift system.
 * Drawn in the same style as Lucide (24×24 grid, 2px round strokes, currentColor), so no extra
 * package is needed. Every icon is decorative (aria-hidden); the text next to it carries meaning.
 */
import type { ReactNode } from 'react';
import type { ShiftType } from './types.ts';

interface IconProps {
  size?: number;
  className?: string;
  strokeWidth?: number;
}

function Icon({ size = 16, className, strokeWidth = 2, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ? `icon ${className}` : 'icon'}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

// ── people & qualifications ──

export const UserIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </Icon>
);

export const UsersIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" />
    <path d="M17.6 14.3A6.5 6.5 0 0 1 21.5 20" />
  </Icon>
);

/** Police badge with a star — qualifications (שלב א'/ב'/ג'). */
export const ShieldIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 2.8 19.5 6v5.6c0 4.6-3.2 8.3-7.5 9.6-4.3-1.3-7.5-5-7.5-9.6V6L12 2.8z" />
    <path d="m12 8.3 1.15 2.35 2.6.38-1.88 1.83.44 2.59L12 14.23l-2.31 1.22.44-2.59-1.88-1.83 2.6-.38z" fill="currentColor" strokeWidth="0.6" />
  </Icon>
);

/** Steering wheel — driving chip. */
export const WheelIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="2.4" />
    <path d="M3.3 10.6h6.3M14.4 10.6h6.3M12 14.4V21" />
  </Icon>
);

// ── time ──

export const ClockIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.2 2" />
  </Icon>
);

export const CalendarIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="4.5" width="18" height="16.5" rx="2.5" />
    <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
    <path d="M7.5 13.5h.01M12 13.5h.01M16.5 13.5h.01M7.5 17h.01M12 17h.01" strokeWidth="2.6" />
  </Icon>
);

export const SunIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
  </Icon>
);

/** Sun on the horizon — afternoon (צהריים). */
export const SunsetIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 17a5 5 0 0 1 10 0" />
    <path d="M12 5v3M4.9 9.9l1.4 1.4M19.1 9.9l-1.4 1.4M2.5 17h2M19.5 17h2M2.5 21h19" />
  </Icon>
);

export const MoonIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a6.8 6.8 0 0 0 10.7 10.7z" />
  </Icon>
);

/** Morning sun / afternoon sunset / night moon. */
export function ShiftTypeIcon({ type, ...p }: IconProps & { type: ShiftType }) {
  if (type === 'MORNING') return <SunIcon {...p} />;
  if (type === 'EVENING') return <SunsetIcon {...p} />;
  return <MoonIcon {...p} />;
}

// ── vehicles ──

/** Patrol car (outline) — "opening an additional patrol car". */
export const CarIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9.5 3.5h5" strokeWidth="2.6" />
    <path d="M5 16.5v-3.6l1.9-4.4A2 2 0 0 1 8.7 7.3h6.6a2 2 0 0 1 1.8 1.2l1.9 4.4v3.6" />
    <rect x="3" y="12.8" width="18" height="5" rx="1.6" />
    <path d="M6 20.5v-2.7M18 20.5v-2.7M7 15.3h.01M17 15.3h.01" />
  </Icon>
);

/**
 * Police car emblem for the header: front view with a red / blue light bar.
 * Uses fixed colours (it's the logo), drawn on a 32×32 grid.
 */
export function PoliceCarEmblem({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect x="8.5" y="2" width="7.5" height="4.2" rx="1.6" fill="#d7192d" />
      <rect x="16" y="2" width="7.5" height="4.2" rx="1.6" fill="#2f7cf0" />
      <rect x="14.9" y="2" width="2.2" height="4.2" fill="#ffffff" />
      <path d="M7.4 15.2 9.9 8.9a2.2 2.2 0 0 1 2-1.4h8.2a2.2 2.2 0 0 1 2 1.4l2.5 6.3z" fill="#0a2a66" />
      <path d="M10.3 14.1 12 9.7a.9.9 0 0 1 .8-.6h6.4a.9.9 0 0 1 .8.6l1.7 4.4z" fill="#cfe0fa" />
      <rect x="3.2" y="14" width="25.6" height="10" rx="3.2" fill="#0a2a66" />
      <rect x="3.2" y="18.2" width="25.6" height="2.2" fill="#2f7cf0" />
      <circle cx="8.2" cy="17" r="1.9" fill="#ffffff" />
      <circle cx="23.8" cy="17" r="1.9" fill="#ffffff" />
      <rect x="12.2" y="15.6" width="7.6" height="1.6" rx=".8" fill="#ffffff" opacity=".75" />
      <rect x="4.8" y="23.4" width="4.6" height="4.4" rx="1.3" fill="#0a2a66" />
      <rect x="22.6" y="23.4" width="4.6" height="4.4" rx="1.3" fill="#0a2a66" />
    </svg>
  );
}

// ── actions & status ──

export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const XIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);

export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
);

export const EyeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);

export const LockIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4.5" y="10.5" width="15" height="10.5" rx="2.2" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
  </Icon>
);

export const LogOutIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" />
    <path d="m14 17 5-5-5-5M19 12H9" />
  </Icon>
);

export const ClipboardIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="5" y="4" width="14" height="17.5" rx="2.2" />
    <rect x="8.8" y="2.3" width="6.4" height="3.4" rx="1.1" />
    <path d="m8.6 12.6 1.6 1.6 3-3M8.6 17.2h6.8" />
  </Icon>
);

export const BellIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 15.5V11a6 6 0 0 1 12 0v4.5l1.6 2.2H4.4z" />
    <path d="M10 20.5a2 2 0 0 0 4 0" />
  </Icon>
);

export const AlertIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10.3 4.2 2.6 17.6A2 2 0 0 0 4.3 20.6h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z" />
    <path d="M12 9.5v4.2M12 17h.01" />
  </Icon>
);

export const MegaphoneIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 10v4a1.2 1.2 0 0 0 1.2 1.2H7l8 4.3V4.5L7 8.8H4.7A1.2 1.2 0 0 0 3.5 10z" />
    <path d="M18.5 9a4 4 0 0 1 0 6" />
  </Icon>
);

export const InfoIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5M12 7.8h.01" />
  </Icon>
);

export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20.5 20.5-4.5-4.5" />
  </Icon>
);

export const ChevronIcon = ({ dir, ...p }: IconProps & { dir: 'left' | 'right' }) => (
  <Icon {...p}>
    <path d={dir === 'left' ? 'm15 5-7 7 7 7' : 'm9 5 7 7-7 7'} />
  </Icon>
);

export const GridIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
  </Icon>
);

/** Hourglass (Lucide "hourglass") — pending cancellation request. */
export const HourglassIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 22h14" />
    <path d="M5 2h14" />
    <path d="M17 22v-4.17a2 2 0 0 0-.59-1.42L12 12l-4.41 4.41A2 2 0 0 0 7 17.83V22" />
    <path d="M7 2v4.17a2 2 0 0 0 .59 1.42L12 12l4.41-4.41A2 2 0 0 0 17 6.17V2" />
  </Icon>
);

/** Timer (Lucide "timer") — free-cancel deadline. */
export const TimerIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 2h4" />
    <path d="M12 14l3-3" />
    <circle cx="12" cy="14" r="8" />
  </Icon>
);

/** Send (Lucide "send") — send a cancellation request. */
export const SendIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14.5 21.7a.5.5 0 0 0 .94-.03l6.5-19a.5.5 0 0 0-.64-.64l-19 6.5a.5.5 0 0 0-.03.94l7.93 3.18a2 2 0 0 1 1.11 1.11z" />
    <path d="M21.85 2.15 10.9 13.1" />
  </Icon>
);

/** Car (Lucide "car-front") — the volunteer has a driving chip. */
export const CarFrontIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m21 8-2 2-1.5-3.7A2 2 0 0 0 15.646 5H8.4a2 2 0 0 0-1.903 1.257L5 10 3 8" />
    <path d="M7 14h.01" />
    <path d="M17 14h.01" />
    <rect width="18" height="8" x="3" y="10" rx="2" />
    <path d="M5 18v2" />
    <path d="M19 18v2" />
  </Icon>
);
