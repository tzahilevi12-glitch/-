/**
 * Engagement helpers (pure, tested):
 *  - urgent shifts: starting within the next 48 hours and still short of regular volunteers;
 *  - "מצטייני החודש": top volunteers of the calendar month by hours, then by number of shifts.
 */

export const URGENT_WINDOW_MINUTES = 48 * 60;

/** startsInMinutes: minutes from now until the shift starts (≤ 0 = already started). */
export function isUrgentShift(startsInMinutes: number, seatsLeft: number): boolean {
  return startsInMinutes > 0 && startsInMinutes <= URGENT_WINDOW_MINUTES && seatsLeft > 0;
}

/** First day of the month of `isoDate`, and first day of the next month (YYYY-MM-DD). */
export function monthRange(isoDate: string): { from: string; to: string; month: string } {
  const [y, m] = isoDate.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  const month = `${y}-${String(m).padStart(2, '0')}`;
  return { from: `${month}-01`, to: `${next}-01`, month };
}

export interface HoursEntry<P> {
  userId: string;
  person: P;
  minutes: number;
}

export interface RankedVolunteer<P> {
  rank: number;
  person: P;
  minutes: number;
  shifts: number;
}

/**
 * Sum each volunteer's registrations and return the top `n`:
 * most minutes first; equal minutes → more shifts first; still equal → name (stable, alphabetical).
 */
export function rankVolunteers<P extends { fullName: string }>(entries: HoursEntry<P>[], n = 3): RankedVolunteer<P>[] {
  const totals = new Map<string, { person: P; minutes: number; shifts: number }>();
  for (const e of entries) {
    const t = totals.get(e.userId) ?? { person: e.person, minutes: 0, shifts: 0 };
    t.minutes += e.minutes;
    t.shifts += 1;
    totals.set(e.userId, t);
  }
  return [...totals.values()]
    .filter((t) => t.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes || b.shifts - a.shifts || a.person.fullName.localeCompare(b.person.fullName, 'he'))
    .slice(0, n)
    .map((t, i) => ({ rank: i + 1, ...t }));
}
