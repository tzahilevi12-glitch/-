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

1. Upload the changed files to the same GitHub repository (**Add file → Upload files**).
2. Click **Commit changes**.

Render notices and redeploys automatically within a few minutes. Your data stays in the database.

## If something goes wrong

- **Deploy failed:** open **Logs** on the `police-volunteers` service. The last red lines say why. The most common cause is files uploaded inside an extra folder (see Part 1, step 7).
- **"כניסת מזין משמרות לא הוגדרה בשרת":** COMMANDER_PIN is missing. Add it under **Environment**.
- **The site shows an error after 30 days:** the free database expired (see Part 3).

## How cancellation alerts work

When a volunteer cancels, the shift scheduler sees a popup the next time they open the dashboard (`/#/commander`). While the dashboard is open, it checks for new cancellations every 30 seconds. The popup stays until someone presses **קראתי**. Cancellations less than 24 hours before the shift are marked in red. There are no text messages and nothing to set up.
