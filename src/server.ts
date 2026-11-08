import { app } from './app.ts';
import { telegramConfig } from './lib/telegram.ts';

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`Volunteer shift API listening on http://localhost:${port}`);
  const tg = telegramConfig();
  console.log(tg ? `Telegram notifications: ON (${tg.chatIds.length} chat)` : 'Telegram notifications: OFF (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set)');
});
