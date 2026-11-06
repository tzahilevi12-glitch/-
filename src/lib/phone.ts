/**
 * Normalize an Israeli or international phone number to E.164.
 * "050-123-4567" → "+972501234567"; "+972 50 123 4567" → "+972501234567".
 */
export function normalizePhone(raw: string): string | null {
  const s = raw.replace(/[\s\-().]/g, '');
  if (/^0\d{8,9}$/.test(s)) return `+972${s.slice(1)}`;
  if (/^\+\d{9,15}$/.test(s)) return s;
  if (/^00\d{9,15}$/.test(s)) return `+${s.slice(2)}`;
  return null;
}
