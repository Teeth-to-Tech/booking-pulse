# Booking Pulse – a Muntra starter app

Build your own clinic dashboard on top of Muntra in an afternoon. Bookings flow in live
from Muntra webhooks, and the dashboard shows how the week is going and which patients
haven't arrived yet. From there you take it wherever your clinic needs, with Claude
writing the code.

![Dashboard](docs/dashboard.png)

**Stack:** GitHub · Supabase (database + Edge Functions) · plain HTML/JS · Claude

> **Test data only.** At the event, connect this to the Muntra *test* clinic you were given,
> never to a real clinic. Using it with real patient data requires a separate agreement
> with Muntra first.

---

## How it works

```
 Muntra test clinic                     Your Supabase project                        Your browser
┌──────────────────┐   webhook    ┌───────────────────────────────┐   signed in   ┌───────────────┐
│ booking created, │ ───────────▶ │ muntra-webhook function       │ ◀──────────── │ web/ dashboard│
│ changed, deleted │  ?secret=…   │  · checks the secret          │               │               │
└──────────────────┘              │  · keeps IDs, times, statuses │               │ "Show contact"│
         ▲                        │  · drops names, personnummer… │               └───────┬───────┘
         │                        │ ──▶ bookings table            │                       │
         │      live lookup       │                               │                       │
         └─────────────────────── │ patient-contact function ◀────┼───────────────────────┘
                                  └───────────────────────────────┘
```

The rule the whole app is built around: **Supabase never stores who the patient is.**
It stores a booking ID, a patient ID, times and statuses. When reception needs to call
someone, the name and number are fetched live from Muntra and shown, not saved.

---

## Part 1 – Foundation (together, ~60–90 min)

### 0. What you need

- A **GitHub** account
- A **Supabase** account (free plan is fine)
- **Node.js 20 or newer** – check with `node -v`
- **Claude** (Claude Code or the Claude desktop app)
- From the Muntra hosts: a **test clinic login**, a **test API token** and the **test API URL**

### 1. Get your own copy

Click **Use this template → Create a new repository** at the top of this page and make it
**private**. Then clone it:

```bash
git clone https://github.com/<you>/<your-repo>.git
cd <your-repo>
cp .env.example .env
```

### 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project**.
2. Pick an **EU region** (for example Stockholm or Frankfurt).
3. When it's ready, open **Project Settings → API** and copy the **Project URL** into
   `SUPABASE_URL` in `.env`.

### 3. Fill in the rest of `.env`

```bash
openssl rand -hex 32        # paste the result as MUNTRA_WEBHOOK_SECRET
```

Add `MUNTRA_API_BASE_URL` and `MUNTRA_API_TOKEN` from the Muntra hosts.

### 4. Create the database and deploy the functions

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>     # the part before .supabase.co
npx supabase db push
npx supabase secrets set --env-file .env               # "skipping SUPABASE_URL" is expected
npx supabase functions deploy
```

### 5. Create your staff login

Supabase → **Authentication → Users → Add user → Create new user**. Use your e-mail and a
password, and tick **Auto Confirm User**.

### 6. Start the dashboard

Open `web/config.js` and paste your **Project URL** and **anon public key** (Project Settings → API). Then:

```bash
npm run dashboard
```

Open http://localhost:5173 and sign in.

### 7. Send a fake booking

```bash
npm run test-webhook                      # a booking in one hour
npm run test-webhook -- --minutes -25     # a patient 25 minutes late
```

The bookings show up under **Latest events** and **Not arrived yet** without a page reload.
(The fake patients don't exist in Muntra, so **Show contact** will fail for them. That's
expected.)

### 8. Connect Muntra

```bash
npm run register-webhooks
```

Now open your Muntra test clinic, create a booking for a test patient that started 15 minutes
ago, and watch it appear. Click **Show contact** – that's a live lookup from Muntra.
Check the patient in and watch them disappear from the list. 🎉

**You now have a working integration.** Everything from here is yours to build.

---

## Part 2 – Make it yours (on your own, with Claude)

Open the folder in Claude and describe what you want. Claude reads `CLAUDE.md` first, which
explains how the app works and which data rules it must follow.

Some ideas, from easier to harder. Copy a prompt or write your own:

| | Idea | Try asking Claude |
|---|---|---|
| 🟢 | **Today view** | *"Add a list of today's bookings with time, booking type and status, and highlight cancelled ones."* |
| 🟢 | **No-show stats** | *"Show no-shows and late cancellations per weekday and per hour so we can see our worst slots."* |
| 🟢 | **Swedish UI** | *"Translate the dashboard into Swedish."* |
| 🟡 | **Mark as handled** | *"Add a 'Called – no answer' / 'Called – on the way' / 'Rebook' button on each late patient, stored in a new table with who clicked it and when."* |
| 🟡 | **Risk flags** | *"Flag tomorrow's bookings that look risky: booked more than 3 months ago, or the patient has failed to appear before."* |
| 🟡 | **Fill gaps** | *"When a booking is cancelled, show patients who have patient_wants_earlier_slot set so reception can offer them the time."* |
| 🔴 | **Follow-up queue** | *"Build a follow-up queue for no-shows from the last 14 days that haven't been rebooked, using the Muntra API to check for new bookings."* |
| 🔴 | **Weekly report** | *"Create a scheduled Supabase function that writes a weekly summary row: bookings, cancellations, no-shows and arrival rate."* |

### Ground rules for Part 2

- Store IDs, not identities. Fetch names and numbers live through `patient-contact`.
- No automatic SMS or e-mail to patients. The app suggests, a person acts.
- Only read from Muntra unless a host has okayed something else.
- Every new table needs row level security.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `401 Invalid secret` from `test-webhook` | Run `npx supabase secrets set --env-file .env` again, then `npx supabase functions deploy muntra-webhook`. |
| Dashboard is empty after sign-in | Did `npx supabase db push` succeed? Is `web/config.js` filled in? Check the browser console. |
| Webhook works from the script but not from Muntra | `npm run register-webhooks -- --list` – is it registered and not deactivated? Check Supabase → Edge Functions → muntra-webhook → Logs. |
| `register-webhooks` returns 403 | Your token can't manage webhooks. Ask a Muntra host. |
| "Show contact" fails | Is `MUNTRA_API_TOKEN` set in Supabase secrets? Does the patient exist in your test clinic? |
| Not arrived list is wrong | It assumes reception checks patients in (sets *arrived*) in Muntra. |

## What's in the box

```
supabase/migrations/          tables, row level security, views
supabase/functions/
  muntra-webhook/             receives Muntra webhooks, keeps allow-listed fields only
    minimize.ts               ← the allow-list
    minimize.test.ts          npm test
  patient-contact/            live name + mobile lookup for signed-in staff
web/                          the dashboard (index.html, app.js, style.css, config.js)
scripts/
  register-webhooks.mjs       registers created/updated/deleted booking webhooks in Muntra
  send-test-webhook.mjs       sends a fake booking to your function
fixtures/                     an example Muntra booking webhook (fake data)
CLAUDE.md                     instructions Claude follows when you build on this
```

Muntra API reference: https://api.muntra.com/api/documentation
