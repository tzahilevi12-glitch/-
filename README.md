# Station shifts: police volunteer shift management

A website (no install; opens in any browser, phone or desktop), fully in Hebrew, right to left.
Volunteers enter their name and driving-chip status, see the published shifts, and sign up for whole or partial shifts. The shift scheduler (מזין המשמרות) plans each week as drafts, publishes it (volunteers get a popup), watches driver coverage on a week roster, and sees a popup whenever a volunteer cancels.

Stack: Node 22, TypeScript (run directly via `--experimental-strip-types`), Express 5, Prisma + PostgreSQL, React 19 bundled with esbuild.

## Put it online

See **DEPLOY.md**: a step-by-step guide for GitHub + Render with no terminal. `render.yaml` sets everything up.

## Run it on your own computer (developers)

```bash
cp .env.example .env          # set DATABASE_URL and COMMANDER_PIN
npm install
npm run build                 # prisma generate + build the web app
npm start                     # creates/updates tables (prisma db push), serves on http://localhost:3000
npm run db:seed               # optional demo data: 4 volunteers, this week published, next week drafts
```

Development: `npm run dev` (API, restarts on change) and `npm run dev:web` (rebuilds the UI) in two terminals.
`npm test` runs the business-rule tests (no database needed).

- Volunteer app: `http://localhost:3000/`
- Commander: `http://localhost:3000/#/commander` (any name + `COMMANDER_PIN`)

## Screens

**Volunteer (phone-first)**
- **Enter:** full name and "I have / do not have a driving chip". That's the whole sign-up.
- **My shifts:** upcoming shifts, each drawn as a duty bar showing your hours. Waitlisted shifts are marked. You can cancel or leave the waitlist.
- **Shift board:** published open shifts grouped by day, each with a Driver needed, Drivers only or Open for all badge and the seats left. Days where you already have a shift are blocked.
- **Sign-up sheet:** whole shift or part of it, chosen in 30-minute steps, with the duty bar previewing your hours.
- **Profile:** change your name or driving-chip status.
- **New shifts popup:** appears the first time you open the app after the commander publishes.

**Commander (desktop, scrolls on a phone)**
- **Roster:** a week grid of days by shift. Each cell has a green or red driver lamp, seats taken, names with a driver mark, partial hours, and the waitlist count. Drafts are hatched; past days are dimmed.
- **Shift panel:** a duty bar of who covers which hours, Remove and Approve buttons, editing hours, capacity and drivers needed, Mark completed, and Delete.
- **Add shifts:** fill the week (days × shift types) or add one shift. New shifts are always drafts.
- **Publish week:** publishes the week's drafts and posts the volunteer popup. Publishing again later posts a "More shifts added" notice.
- **Volunteers:** search, correct a driving chip, pause or restore a volunteer.

## Rules

| Rule | Behaviour |
|---|---|
| Sign-up | Open: name, driving-chip status and qualification (מתנדב אק״מ / Level A / Level B / Level C), no approval. Read from the profile on every booking. The shift sign-up itself doesn't ask about driving: the commander sees who can drive from the chip status chosen at sign-in. Level A follows the normal rules. |
| Guest (אורח) | "כניסה כאורח" on the sign-in screen opens `#/guest`: a read-only board (published shifts, counts, names) loaded from `GET /api/public/board`. Guests have no sign-in, so the server rejects any sign-up, cancellation or change from them. |
| Transparency | The volunteer shift board shows, in small text under each shift, how many are signed up and their names. The commander sees "רשומים X / מבוקש Y" on every shift (X includes Level B/C extras). |
| Level B / C (מוסמך שלב ב'/ג') | Can open an additional patrol car: they can join **any** shift, even a full one, ignoring `maxVolunteers` and the driver reservation. Their places are extra (shown as "+1" on the roster) and don't use up regular seats. All other rules still apply (published, one shift per day, not ended). |
| Visibility | Volunteers see only **published** shifts that haven't ended. The commander publishes a week at a time (weeks start Sunday). |
| Capacity | `maxVolunteers` is the number of regular seats per shift, whatever the hours. With max 2, sign-ups for 16–20 and 18–22 fill it. Level B/C volunteers are extra. |
| Partial hours | Any range inside the shift, including after midnight on a night shift. Hours are shown on the roster but don't affect capacity. |
| Driver coverage | Green as soon as `requiredDrivers` approved volunteers have a chip, even if they're only on for part of the shift. |
| Driver priority | When the remaining seats are all needed for drivers, a non-driver's sign-up goes on the waitlist (no "drivers only" warning is shown; volunteers just see their status). They're promoted automatically, or the commander approves them. |
| One per day | One shift per volunteer per calendar day (the shift's start date). Night shift + next-day morning is allowed (06:00–07:00 is the briefing). |
| Cancellation alert | Cancelling is a single "are you sure?" popup. It always creates an alert for the scheduler, in the same transaction, so it can't happen silently. The scheduler sees it as a popup in the dashboard (checked on load and every 30 s) until they press "קראתי". Cancellations less than 24 h before the shift are flagged urgent. |
| Concurrency | Every booking and seat change runs in a SERIALIZABLE transaction with retry. |

## API

Public: `GET /api/public/board` (read-only, for guests), `POST /api/public/enter {fullName, hasDrivingChip, certification}`, `POST /api/public/commander {fullName, pin}` → `{token}` (send it as `Authorization: Bearer`).

Volunteer: `GET/PATCH /api/me`, `POST /api/me/logout`, `GET /api/me/shifts`, `GET /api/me/notifications`, `POST /api/me/notifications/seen`, `GET /api/shifts`, `POST /api/shifts/:id/registrations {startTime?, endTime?}`, `DELETE /api/shifts/:id/registrations/me` (always creates a dashboard alert for the scheduler).

Commander (`/api/admin`): `GET /alerts`, `POST /alerts/ack {ids}`, `GET /weeks/:date`, `POST /weeks/:date/publish`, `POST /shifts`, `POST /shifts/recurring`, `PATCH|DELETE /shifts/:id`, `PATCH|DELETE /shift-series/:id`, `PATCH /registrations/:id {status}`, `GET /users`, `PATCH /users/:id`.

## Known limits

- A volunteer is identified by the device they signed up on. Signing up again on a new phone creates a second profile.
- Commander sign-in is a shared station PIN.
