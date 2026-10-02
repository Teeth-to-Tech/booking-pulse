# Booking Pulse – a Muntra starter app

Build your own clinic dashboard on top of Muntra in an afternoon. Bookings flow in live
from Muntra webhooks, and the dashboard shows how the week is going and which patients
haven't arrived yet. From there you take it wherever your clinic needs, with Claude
writing the code.

![Dashboard](docs/dashboard.png)

**Stack:** GitHub · Supabase (database + Edge Functions) · plain HTML/JS · Claude

> **Example code for learning.** This is not part of Muntra's CE-marked medical device
> software and is not supported by Muntra. Licensed under [Apache 2.0](LICENSE); the license
> gives no rights to the Muntra name or trademarks.
>
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

## 👉 New here? Start with [GUIDE.md](GUIDE.md)

**[GUIDE.md](GUIDE.md)** is the step-by-step guide for event participants. It assumes no
technical background, and Claude runs every command for you. The rest of this README is a
short technical reference.

---

## Quick setup (technical reference)

Requirements: Node.js 22+, Git, a Supabase project (EU region), a Muntra test clinic and an API token that belongs to it.

```bash
cp .env.example .env      # fill in the values; comments explain where to find each
npm install
npm run setup             # links Supabase, creates tables, sets secrets, deploys functions,
                          # writes web/config.js, creates your dashboard login, registers Muntra webhooks
npm run dashboard         # http://localhost:5180
npm run test-webhook -- --minutes -25
```

`npm run setup` is safe to run again; finished steps are skipped or overwritten.

| Command | What it does |
|---|---|
| `npm run setup` | Full setup from `.env` |
| `npm run dashboard` | Serves `web/` on port 5180 |
| `npm run test-webhook` | Sends a fake booking. Options: `--minutes -25`, `--status CANCELLED`, `--trigger deleted --id 123` |
| `npm run register-webhooks` | Registers booking webhooks in Muntra (skips existing). `-- --list` shows them |
| `npm test` | Deno tests for the webhook allow-list |

---

## Ideas for Part 2

See the idea list in [GUIDE.md → Part 2](GUIDE.md#part-2--make-it-yours).

### Ground rules

- Store IDs, not identities. Fetch names and numbers live through `patient-contact`.
- No automatic SMS or e-mail to patients. The app suggests, a person acts.
- Only read from Muntra unless a host has okayed something else.
- Every new table needs row level security.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `401 Invalid secret` from `test-webhook` | Run `npm run setup` again (it re-saves the secret and redeploys). |
| Dashboard is empty after sign-in | Did setup finish? Is `web/config.js` filled in? Check the browser console. |
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
  setup.mjs                   one-command setup from .env
fixtures/                     an example Muntra booking webhook (fake data)
GUIDE.md                      step-by-step guide for non-technical participants
CLAUDE.md                     instructions Claude follows when you build on this
```

Muntra API reference: https://api.muntra.com/api/documentation
