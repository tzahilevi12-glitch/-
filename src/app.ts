import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { authenticate, requireAdmin } from './middleware/auth.ts';
import { shiftsRouter, meRouter } from './routes/shifts.ts';
import { adminRouter } from './routes/admin.ts';
import { publicRouter } from './routes/public.ts';
import { errorHandler } from './lib/errors.ts';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../web/dist');

// Express 5: errors thrown in async handlers reach errorHandler automatically.
export const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/public', publicRouter); // no auth
app.use('/api', authenticate);
app.use('/api/me', meRouter);
app.use('/api/shifts', shiftsRouter);
app.use('/api/admin', requireAdmin, adminRouter);
app.use('/api', (_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown API route.' } });
});

// Web app (built by `npm run build:web`); hash routing, so index.html serves every page.
app.use(express.static(webDir));
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  res.sendFile(path.join(webDir, 'index.html'));
});

app.use(errorHandler);
