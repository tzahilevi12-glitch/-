import { ApiError } from './errors.ts';
import { isIsoDate } from './dates.ts';
import { parseHHMM } from '../domain/registrationRules.ts';


type Body = Record<string, unknown>;

const LABEL: Record<string, string> = {
  fullName: 'שם מלא', pin: 'קוד', startTime: 'שעת התחלה', endTime: 'שעת סיום', date: 'תאריך', from: 'מתאריך', to: 'עד תאריך',
  shiftType: 'סוג משמרת', requiredDrivers: 'נהגים דרושים', maxVolunteers: 'מספר מתנדבים', notes: 'הערה',
  status: 'סטטוס', hasDrivingChip: "צ'יפ נהיגה", isActive: 'סטטוס פעיל',
};
const label = (key: string) => LABEL[key] ?? key;

function fail(message: string): never {
  throw new ApiError(400, 'VALIDATION', message);
}

export function asBody(value: unknown): Body {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Body) : {};
}

export function optInt(b: Body, key: string, min: number, max: number): number | undefined {
  const v = b[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) fail(`${label(key)}: יש להזין מספר שלם בין ${min} ל-${max}.`);
  return v;
}

export function optBool(b: Body, key: string): boolean | undefined {
  const v = b[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'boolean') fail(`${label(key)}: ערך לא תקין.`);
  return v;
}

export function optEnum<T extends string>(b: Body, key: string, values: readonly T[]): T | undefined {
  const v = b[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'string' || !values.includes(v as T)) fail(`${label(key)}: ערך לא תקין.`);
  return v as T;
}

export function reqEnum<T extends string>(b: Body, key: string, values: readonly T[]): T {
  return optEnum(b, key, values) ?? fail(`חסר שדה: ${label(key)}.`);
}

export function optHHMM(b: Body, key: string): string | undefined {
  const v = b[key];
  if (v === undefined || v === null) return undefined;
  if (parseHHMM(v) === null) fail(`${label(key)}: יש להזין שעה בפורמט HH:MM.`);
  return v as string;
}

export function reqDate(b: Body, key: string): string {
  const v = b[key];
  if (!isIsoDate(v)) fail(`${label(key)}: יש להזין תאריך בפורמט YYYY-MM-DD.`);
  return v;
}

export function optString(b: Body, key: string, maxLen = 500): string | undefined {
  const v = b[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'string' || v.length > maxLen) fail(`${label(key)}: עד ${maxLen} תווים.`);
  return v.trim();
}

export function reqString(b: Body, key: string, maxLen = 200): string {
  const v = optString(b, key, maxLen);
  if (!v) fail(`חסר שדה: ${label(key)}.`);
  return v;
}
