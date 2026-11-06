import { Router } from 'express';
import { ApiError } from '../lib/errors.ts';
import { asBody, reqString } from '../lib/validate.ts';
import { enterAsCommander, enterAsVolunteer } from '../services/sessionService.ts';

export const publicRouter = Router();

function fullNameFrom(b: Record<string, unknown>): string {
  const name = reqString(b, 'fullName', 80).replace(/\s+/g, ' ');
  if (name.length < 2) throw new ApiError(400, 'VALIDATION', 'יש להזין שם מלא.');
  return name;
}

/** POST /api/public/enter  { fullName, hasDrivingChip } → { token, user }. Open registration. */
publicRouter.post('/enter', async (req, res) => {
  const b = asBody(req.body);
  if (typeof b.hasDrivingChip !== 'boolean') {
    throw new ApiError(400, 'VALIDATION', "יש לבחור אם יש לך צ'יפ נהיגה.");
  }
  res.status(201).json(await enterAsVolunteer({ fullName: fullNameFrom(b), hasDrivingChip: b.hasDrivingChip }));
});

/** POST /api/public/commander  { fullName, pin } → { token, user }. PIN from COMMANDER_PIN. */
publicRouter.post('/commander', async (req, res) => {
  const b = asBody(req.body);
  res.status(201).json(await enterAsCommander({ fullName: fullNameFrom(b), pin: reqString(b, 'pin', 64) }));
});
