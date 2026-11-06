import type { Role } from './types.ts';

const KEY = 'pv.session';

export interface Session {
  token: string;
  role: Role;
  fullName: string;
}

export function getSession(): Session | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    return null;
  }
}

export function setSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
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

export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const s = getSession();
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
    if (res.status === 401 && s) setSession(null);
    throw new ApiError(res.status, data?.error?.code ?? 'ERROR', data?.error?.message ?? 'משהו השתבש. כדאי לנסות שוב.');
  }
  return data as T;
}
