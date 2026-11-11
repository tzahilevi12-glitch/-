import type { RequestHandler } from 'express';
import { prisma } from '../lib/prisma.ts';
import { ApiError } from '../lib/errors.ts';
import { hashToken } from '../services/sessionService.ts';

const TOUCH_AFTER_MS = 60 * 60 * 1000;

/** Bearer-token device session (see sessionService). Sets req.user and req.sessionTokenHash. */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) throw new ApiError(401, 'UNAUTHENTICATED', 'יש להזין שם כדי להמשיך.');
  const tokenHash = hashToken(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: { select: { id: true, fullName: true, role: true, isActive: true, hasDrivingChip: true, certification: true } } },
  });
  if (!session) throw new ApiError(401, 'UNAUTHENTICATED', 'החיבור הסתיים. יש להזין שם כדי להמשיך.');
  if (Date.now() - session.lastUsedAt.getTime() > TOUCH_AFTER_MS) {
    await prisma.session.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } });
  }
  req.user = session.user;
  req.sessionTokenHash = tokenHash;
  next();
};

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (req.user?.role !== 'ADMIN' || !req.user.isActive) {
    throw new ApiError(403, 'FORBIDDEN', 'הפעולה זמינה רק למזין המשמרות.');
  }
  next();
};
