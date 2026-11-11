import { Router } from 'express';
import { ApiError } from '../lib/errors.ts';
import { asBody, optEnum, reqString } from '../lib/validate.ts';
import { enterAsCommander, enterAsVolunteer } from '../services/sessionService.ts';
import { CERTIFICATIONS } from '../domain/registrationRules.ts';
import { guestBoard } from '../services/boardService.ts';

export const publicRouter = Router();

function fullNameFrom(b: Record<string, unknown>): string {
  const name = reqString(b, 'fullName', 80).replace(/\s+/g, ' ');
  if (name.length < 2) throw new ApiError(400, 'VALIDATION', 'יש להזין שם מלא.');
  return name;
}

/** POST /api/public/enter  { fullName, hasDrivingChip, certification? (NONE | LEVEL_A | LEVEL_B | LEVEL_C) } → { token, user }. Open registration. */
publicRouter.post('/enter', async (req, res) => {
  const b = asBody(req.body);
  if (typeof b.hasDrivingChip !== 'boolean') {
    throw new ApiError(400, 'VALIDATION', "יש לבחור אם יש לך צ'יפ נהיגה.");
  }
  const certification = optEnum(b, 'certification', CERTIFICATIONS) ?? 'NONE';
  res.status(201).json(await enterAsVolunteer({ fullName: fullNameFrom(b), hasDrivingChip: b.hasDrivingChip, certification }));
});

/** POST /api/public/commander  { fullName, pin } → { token, user }. PIN from COMMANDER_PIN. */
publicRouter.post('/commander', async (req, res) => {
  const b = asBody(req.body);
  res.status(201).json(await enterAsCommander({ fullName: fullNameFrom(b), pin: reqString(b, 'pin', 64) }));
});

/**
 * GET /api/public/board — read-only shift board for guests (no sign-in).
 * Published shifts that haven't ended, with counts and the names of volunteers on each.
 * Guests have no session, so every endpoint that changes anything rejects them.
 */
publicRouter.get('/board', async (_req, res) => {
  res.json({ shifts: await guestBoard() });
});
