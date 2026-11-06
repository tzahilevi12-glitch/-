import type { Role } from './types.ts';

/**
 * The volunteer site and the commander dashboard keep SEPARATE sign-ins, so being
 * signed in as commander never changes what the base URL shows. Which one a request
 * uses depends on the page: only "#/commander" and "#/commander/…" are the commander area.
 */
export type Area = 'volunteer' | 'commander';

const KEYS: Record<Area, string> = { volunteer: 'pv.session.volunteer', commander: 'pv.session.commander' };

export function isCommanderHash(hash: string): boolean {
  return hash === '#/commander' || hash.startsWith('#/commander/');
}

export function currentArea(): Area {
  return isCommanderHash(location.hash) ? 'commander' : 'volunteer';
}

export interface Session {
  token: string;
  role: Role;
  fullName: string;
}

function read(key: string): Session | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}

// One-time move from the old shared key ("pv.session") to the separate keys.
try {
  const old = read('pv.session');
  if (old) {
    const area: Area = old.role === 'ADMIN' ? 'commander' : 'volunteer';
    if (!localStorage.getItem(KEYS[area])) localStorage.setItem(KEYS[area], JSON.stringify(old));
    localStorage.removeItem('pv.session');
  }
} catch {
  /* storage unavailable */
}

export function getSession(area: Area = currentArea()): Session | null {
  const s = read(KEYS[area]);
  // A commander account is never used as a volunteer sign-in, and vice versa.
  if (s && area === 'volunteer' && s.role === 'ADMIN') return null;
  if (s && area === 'commander' && s.role !== 'ADMIN') return null;
  return s;
}

export function setSession(s: Session | null, area: Area = currentArea()) {
  try {
    if (s) localStorage.setItem(KEYS[area], JSON.stringify(s));
    else localStorage.removeItem(KEYS[area]);
  } catch {
    /* storage unavailable (private mode): session lasts for this tab only */
  }
  window.dispatchEvent(new Event('pv:session'));
}

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown; area?: Area } = {}): Promise<T> {
  const area = opts.area ?? currentArea();
  const s = getSession(area);
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: opts.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(s ? { Authorization: `Bearer ${s.token}` } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new ApiError(0, 'OFFLINE', 'אין חיבור לשרת. כדאי לבדוק את החיבור לאינטרנט ולנסות שוב.');
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && s) setSession(null, area);
    throw new ApiError(res.status, data?.error?.code ?? 'ERROR', data?.error?.message ?? 'משהו השתבש. כדאי לנסות שוב.');
  }
  return data as T;
}
