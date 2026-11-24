import { Router, type Request } from 'express';
import { prisma } from '../lib/prisma.ts';
import { ApiError } from '../lib/errors.ts';
import { asBody } from '../lib/validate.ts';
import { hashToken } from '../services/sessionService.ts';
import { MAX_QUESTION_LENGTH } from '../domain/assistant.ts';
import { askAssistant, type AssistantViewer } from '../services/assistantService.ts';

/**
 * "🤖 עוזרת חמ"ל" — open to everyone (guests too). A signed-in volunteer or commander may send
 * their usual Bearer token so "my shifts" questions work; a missing or expired token simply
 * means "guest" here (never a 401, so the app doesn't sign anyone out).
 */
export const assistantRouter = Router();

async function optionalViewer(req: Request): Promise<AssistantViewer | null> {
  const header = req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, fullName: true, role: true, isActive: true, hasDrivingChip: true, certification: true } } },
  });
  if (!session || !session.user.isActive) return null;
  const u = session.user;
  return { id: u.id, fullName: u.fullName, role: u.role, certification: u.certification, hasDrivingChip: u.hasDrivingChip };
}

/** POST /api/assistant/ask  { question } → { intent, answer, suggestions, actions?, needsLogin? } */
assistantRouter.post('/ask', async (req, res) => {
  const b = asBody(req.body);
  const raw = b.question;
  if (typeof raw !== 'string') throw new ApiError(400, 'VALIDATION', 'יש לכתוב שאלה.');
  const question = raw.trim().slice(0, MAX_QUESTION_LENGTH);
  const viewer = await optionalViewer(req);
  res.set('Cache-Control', 'no-store').json(await askAssistant(question, viewer));
});
