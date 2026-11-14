/**
 * Direct shift links: https://site/?shiftId=<id>
 * The id is kept in sessionStorage so it survives the sign-in screen, then the shift board
 * scrolls to that shift and opens its sign-up. The ?shiftId= part is removed from the address
 * bar right away, so a refresh doesn't open it again.
 */
const KEY = 'pv.pendingShift';

/** Call once at start-up. */
export function captureShiftLink(): void {
  const params = new URLSearchParams(location.search);
  const id = params.get('shiftId');
  if (!id) return;
  setPendingShift(id);
  params.delete('shiftId');
  const rest = params.toString();
  const hash = location.hash.startsWith('#/commander') ? location.hash : '#/board';
  history.replaceState(null, '', `${location.pathname}${rest ? `?${rest}` : ''}${hash}`);
}

export function setPendingShift(id: string): void {
  try {
    sessionStorage.setItem(KEY, id);
  } catch {
    /* private mode: the link still works if they are already signed in */
    memory = id;
  }
}
let memory: string | null = null;

export function hasPendingShift(): boolean {
  try {
    return !!sessionStorage.getItem(KEY) || !!memory;
  } catch {
    return !!memory;
  }
}

/** Returns the pending id once and forgets it. */
export function takePendingShift(): string | null {
  let id: string | null = memory;
  memory = null;
  try {
    id = sessionStorage.getItem(KEY) ?? id;
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  return id;
}

/** From the guest view or "my shifts": go to the board (through sign-in if needed) and open this shift. */
export function bookShift(id: string): void {
  setPendingShift(id);
  if (location.hash === '#/board') window.dispatchEvent(new Event('pv:pending-shift'));
  else location.hash = '#/board';
}
