import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { prisma } from '../lib/prisma.ts';
import { ApiError } from '../lib/errors.ts';

/**
 * Lightweight device sessions for open registration. The token is returned once,
 * kept by the browser, and stored here only as a SHA-256 hash.
 * A stronger sign-in can later be added in front of createSession without changing the rest.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await prisma.session.create({ data: { userId, tokenHash: hashToken(token) } });
  return token;
}

const USER_VIEW = { id: true, fullName: true, role: true, hasDrivingChip: true, isActive: true } as const;

/** A volunteer enters their name and driving-chip status — that's the whole sign-up. */
export async function enterAsVolunteer(input: { fullName: string; hasDrivingChip: boolean }) {
  const user = await prisma.user.create({
    data: { fullName: input.fullName, hasDrivingChip: input.hasDrivingChip, role: 'VOLUNTEER' },
    select: USER_VIEW,
  });
  return { user, token: await createSession(user.id) };
}

function pinMatches(pin: string): boolean {
  const expected = process.env.COMMANDER_PIN;
  if (!expected) throw new ApiError(503, 'COMMANDER_LOGIN_DISABLED', 'כניסת מזין משמרות לא הוגדרה בשרת (COMMANDER_PIN).');
  const a = createHash('sha256').update(pin).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/** Commander signs in with their name and the station PIN (simple station code). */
export async function enterAsCommander(input: { fullName: string; pin: string }) {
  if (!pinMatches(input.pin)) throw new ApiError(401, 'WRONG_PIN', 'הקוד שגוי.');
  const existing = await prisma.user.findFirst({
    where: { role: 'ADMIN', fullName: { equals: input.fullName, mode: 'insensitive' } },
    select: USER_VIEW,
  });
  const user =
    existing ??
    (await prisma.user.create({ data: { fullName: input.fullName, role: 'ADMIN', hasDrivingChip: false }, select: USER_VIEW }));
  if (!user.isActive) throw new ApiError(403, 'USER_INACTIVE', 'החשבון הושהה.');
  return { user, token: await createSession(user.id) };
}

export async function endSession(tokenHash: string) {
  await prisma.session.deleteMany({ where: { tokenHash } });
}
