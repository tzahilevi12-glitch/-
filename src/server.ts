import { app } from './app.ts';
import { telegramConfig } from './lib/telegram.ts';
import { startShortageScheduler } from './services/shortageDigest.ts';

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`Volunteer shift API listening on http://localhost:${port}`);
  const tg = telegramConfig();
  console.log(tg ? `Telegram notifications: ON (${tg.chatIds.length} chat)` : 'Telegram notifications: OFF (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set)');
  startShortageScheduler();
  if (!process.env.CRON_SECRET) console.log('Wake-up link for the shortage summary: OFF (set CRON_SECRET to use it, see DEPLOY.md)');
});
