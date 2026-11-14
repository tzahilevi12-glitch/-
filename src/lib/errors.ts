import type { ErrorRequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import type { RejectionCode } from '../domain/registrationRules.ts';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const REJECTION_HTTP_STATUS: Record<RejectionCode, number> = {
  USER_INACTIVE: 403,
  SHIFT_NOT_OPEN: 409,
  SHIFT_FULL: 409,
  ALREADY_REGISTERED: 409,
  ONE_SHIFT_PER_DAY: 409,
  NOT_QUALIFIED_FOR_CAR: 403,
  NOT_PUBLISHED: 409,
  INVALID_HOURS: 422,
  TOO_SHORT: 422,
  SHIFT_IN_PAST: 422,
};

export function rejectionToError(code: RejectionCode, message: string): ApiError {
  return new ApiError(REJECTION_HTTP_STATUS[code], code, message);
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({ error: { code: 'ALREADY_EXISTS', message: 'כבר קיימת רשומה עם הפרטים האלה.' } });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'הרשומה לא נמצאה.' } });
      return;
    }
  }
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: { code: 'VALIDATION', message: 'בקשה לא תקינה.' } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'שגיאה בשרת. כדאי לנסות שוב.' } });
};
