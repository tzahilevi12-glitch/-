# Putting the site online (no programming setup needed)

You'll use two free websites:

- **GitHub** stores the code.
- **Render** runs it and gives you a link like `https://police-volunteers.onrender.com`.

Everything happens in the browser. You never open a terminal. Render runs `npm install` and creates the database tables by itself, following the `render.yaml` file in this project.

Allow about 30 minutes the first time.

---

## Part 1: Put the code on GitHub (about 10 minutes)

1. Unzip `police-volunteers.zip` on your computer. You get a folder called `police-volunteers`.
2. Go to **https://github.com** and click **Sign up**. Create a free account.
3. Click the **+** at the top right, then **New repository**.
   - Repository name: `police-volunteers`
   - Choose **Private**.
   - Click **Create repository**.
4. On the empty repository page, click the link **uploading an existing file**.
5. Open the `police-volunteers` folder on your computer. Select **everything inside it** (Ctrl+A on Windows, Cmd+A on Mac) and drag it into the browser window.
   - Drag the *contents* of the folder, not the folder itself.
6. Wait until the files finish uploading, then click **Commit changes**.
7. Check the repository page. You should see `package.json`, `render.yaml`, `src`, `web` and `prisma` at the top level.
   - If they're inside an extra `police-volunteers` folder, delete the repository and repeat step 5 with the folder's contents.

## Part 2: Create the site on Render (about 10 minutes)

1. Go to **https://render.com**, click **Get Started**, and choose **Sign up with GitHub**.
2. In the Render dashboard, click **New**, then **Blueprint**.
3. Connect your GitHub account if asked. Allow Render to see the `police-volunteers` repository, then select it.
4. Give the Blueprint any name. Render shows what it will create: a database called `volunteers-db` and a web service called `police-volunteers`.
5. Render asks for one value:
   - **COMMANDER_PIN**: the code the shift scheduler types to sign in. Choose at least 6 digits and keep it private.
6. Click **Deploy Blueprint** (the button may say **Apply**). Render now:
   - installs everything (`npm install`),
   - builds the website,
   - creates the database tables,
   - and starts the server.
   This takes 3–6 minutes. You can watch progress in the **Logs** tab of the `police-volunteers` service.
7. When the status shows **Live**, open the `police-volunteers` service. The link at the top of the page, ending in `.onrender.com`, is your site.
   - **Volunteers:** send them this link.
   - **Shift scheduler:** the same link with `/#/commander` at the end, for example `https://police-volunteers.onrender.com/#/commander`. Sign in with any name and the COMMANDER_PIN.

**Where do `npm install` and `npm run db:migrate` go?** Nowhere. Render runs the equivalent commands automatically on every deploy:
- **Build:** `npm install && npm run build`
- **Start:** `npm start`, which creates or updates the database tables and then starts the server

## Part 3: Before real use (costs and limits)

The free plan is fine for trying things out, but it has two limits:

- **The site sleeps.** After 15 minutes with no visitors, the next visitor waits about a minute for it to wake up.
  - Fix: open the `police-volunteers` service, go to **Settings → Instance type**, and choose **Starter** (about $7/month).
- **The free database is deleted after 30 days**, with 14 more days of grace. Every sign-up would be lost.
  - Fix: open `volunteers-db` and upgrade it to a paid instance (from about $6/month) before the 30 days are up.

All together, that's about $13/month for an always-on site with a permanent database.

## Updating the site later

When you get new code:

(Database changes, like a new field, are applied automatically when the site restarts. Existing data is kept.)


1. Upload the changed files to the same GitHub repository (**Add file → Upload files**).
2. Click **Commit changes**.

Render notices and redeploys automatically within a few minutes. Your data stays in the database.

## If something goes wrong

- **Deploy failed:** open **Logs** on the `police-volunteers` service. The last red lines say why. The most common cause is files uploaded inside an extra folder (see Part 1, step 7).
- **"כניסת מזין משמרות לא הוגדרה בשרת":** COMMANDER_PIN is missing. Add it under **Environment**.
- **The site shows an error after 30 days:** the free database expired (see Part 3).

## How cancelling works

- **More than 12 hours before the shift starts**, a volunteer can cancel on their own, and they're removed right away. My shifts shows until when, for example "ביטול חופשי עד יום א׳ 8.11 בשעה 18:00". For partial hours, the 12 hours count from the volunteer's own start time.
- **12 hours or less before the start**, the button changes to **בקשת ביטול**. The request appears at the top of the commander dashboard (`/#/commander`) under **בקשות ביטול ממתינות לאישורך**, with **אישור ביטול** and **דחייה** buttons. The same buttons appear in the shift's panel, and the volunteer's name gets an hourglass mark in the weekly grid. If Telegram is set up, the group also gets a message.
- **Until you approve**, the volunteer stays on the shift and their seat counts as taken. Approving frees the seat, and the first person on the waitlist moves in automatically. Rejecting keeps the volunteer on the shift, and they see that the request was rejected.
- Leaving the **waitlist** is always allowed without approval, because it doesn't hold a seat.

Times follow the station time zone (`STATION_TZ` in Render, Israel time by default). The database updates itself on deploy. Nothing needs to be done by hand.

## How cancellation alerts work

When a volunteer cancels, the shift scheduler sees a popup the next time they open the dashboard (`/#/commander`). While the dashboard is open, it checks for new cancellations every 30 seconds. The popup stays until someone presses **קראתי**. Cancellations less than 24 hours before the shift are marked in red. There are no text messages and nothing to set up.

## Telegram notifications (about 10 minutes)

Every time a volunteer signs up for a shift, the bot sends a message to a Telegram group of the commanders. The message looks like this:

```
🚨 הרשמה חדשה למשמרת!

👤 מתנדב: דנה כהן
📅 תאריך: יום ראשון, 8.11.2026
⏰ משמרת: צהריים (14:30–22:00)
🎓 הסמכה: שלב ב׳
🔑 צ'יפ נהיגה: יש
🚓 פתיחת ניידת: כן
```

The "פתיחת ניידת" line appears only for Level B/C volunteers. Partial hours and waitlist sign-ups are marked in the message.

This is optional and safe. If the two settings below are missing or wrong, or Telegram is down, the volunteer is still signed up normally. The bot just doesn't send anything, and the reason is written in the Render **Logs**.

### Step 1: Create the bot with BotFather

1. In the Telegram app, search for **@BotFather** (it has a blue check mark) and open it.
2. Press **Start**, then send: `/newbot`
3. BotFather asks for a **name**. This is what people see. Send, for example: `משמרות מתנדבים`
4. BotFather asks for a **username**. It must be in English and end with `bot`, for example: `station_shifts_bot`. If it's taken, try another.
5. BotFather replies with a **token**, a long line like `7412345678:AAHk2x...`. Copy it. This is your **TELEGRAM_BOT_TOKEN**.
   Keep it secret, because anyone with the token can send messages as your bot. If it leaks, send `/revoke` to BotFather to get a new one.

### Step 2: Create the commanders' group and get its Chat ID

1. In Telegram, create a **New Group** with the 3 commanders, for example "התראות משמרות".
2. Add the bot to the group: open the group → **Add members** → search for your bot's username (from step 1.4) → add it.
3. In the group, send this message (with your bot's username): `/start@station_shifts_bot`
4. On a phone or computer, open this address in a web browser. Paste your token in place of `<TOKEN>`, and keep the word `bot` right before it:
   `https://api.telegram.org/bot<TOKEN>/getUpdates`
   Example: `https://api.telegram.org/bot7412345678:AAHk2x.../getUpdates`
5. The page shows text. Look for `"chat":{"id":` followed by a number. For a group it starts with a minus sign, for example `-1001987654321` or `-987654321`. Copy the whole number, **including the minus**. This is your **TELEGRAM_CHAT_ID**.
   - If the page only shows `{"ok":true,"result":[]}`, send `/start@your_bot_username` in the group again and refresh the page.
   - If you see `"migrate_to_chat_id"`, use the number next to it. Telegram changed the group's ID.

Each commander should make sure the group is **not muted** on their phone, so the notification pops up.

> Tip: you can also send to several chats instead of a group. Put the IDs separated by commas, for example `-1001987654321,123456789`. A person's own ID is shown the same way in `getUpdates`, after they send `/start` to the bot privately.

### Step 3: Add the two settings in Render

1. Go to https://dashboard.render.com and open your web service **police-volunteers** (the web service, not the database).
2. In the left menu, click **Environment**.
3. Click **Add Environment Variable** (or **+ Add**), and fill in:
   - Key: `TELEGRAM_BOT_TOKEN`, Value: the token from step 1
4. Add a second one:
   - Key: `TELEGRAM_CHAT_ID`, Value: the number from step 2, including the minus
5. Click **Save** and choose the option that also deploys (**Save, rebuild, and deploy** or **Save and deploy**). Render restarts the site in a minute or two.
6. Check that it worked: open **Logs** on the service. After the restart you should see the line `Telegram notifications: ON (1 chat)`.
7. Test it: sign in to the site as a test volunteer, sign up for a shift, and the group should get the message within seconds. Then cancel the test sign-up.

Copy the values exactly, with no spaces and no quotation marks.

### If no message arrives

Open **Logs** on the `police-volunteers` service and look for lines starting with `[telegram]`:

- `notifications are off`: one of the two settings is missing or misspelled. The key names must be exactly as written above.
- `HTTP 401`: the token is wrong. Copy it again from BotFather.
- `HTTP 400 ... chat not found`: the Chat ID is wrong (check the minus sign), or the bot isn't in the group.
- `HTTP 403 ... bot was kicked`: the bot was removed from the group. Add it again.
