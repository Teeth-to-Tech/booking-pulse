# Booking Pulse – instructions for Claude

This is a starter app built at a Muntra customer vibe-coding event. The person you are
helping works at a dental clinic and is probably not a professional developer. Explain
what you change in plain language, keep changes small, and make sure the app still runs
after each step.

## Data rules (never break these)

1. **Store no patient identity.** The `bookings` table holds Muntra IDs, times, statuses
   and booking type only. Never add columns for names, personal identity numbers
   (personnummer), addresses, phone numbers, e-mail, dates of birth, or the booking's
   `summary`, `text` or `description` fields. The `summary` field often contains the
   patient's name.
2. **Fetch contact details live, never copy them.** When a person needs a patient's name
   or phone number, go through the `patient-contact` Edge Function, which reads from the
   Muntra API on demand and returns only what is needed. Don't cache the result in
   Supabase, localStorage or logs.
3. **Never log webhook payloads.** They contain full patient records.
4. **Respect `protected_identity` and `prefers_not_to_be_contacted_by_clinic`.** Protected
   patients are never shown in this app. Do-not-contact patients are flagged.
5. **No automatic messages to patients.** The app suggests; a person decides and acts.
   No SMS or e-mail sending, even if Muntra's API has endpoints for it.
6. **Read-only towards Muntra by default.** Don't call Muntra endpoints that create, change
   or cancel anything unless the user explicitly asks and understands it changes real
   clinic data. Only use the test environment.
7. **Keep row level security on.** Every new table gets RLS enabled and a policy limited to
   the `authenticated` role.

If the user asks for something that breaks a rule, explain why and offer an alternative
that doesn't.

## How it fits together

```
Muntra ──webhook──▶ supabase/functions/muntra-webhook ──▶ bookings, booking_events
                       (checks ?secret, keeps allow-listed fields)
web/ dashboard ──reads (signed in)──▶ Supabase views: daily_booking_stats, missed_bookings
web/ dashboard ──"Show contact"──▶ supabase/functions/patient-contact ──▶ Muntra API /api/patients/{id}
```

- `supabase/migrations/` – tables, RLS policies and views. Add new migrations as new files
  (`YYYYMMDDHHMMSS_name.sql`); don't edit ones that have already been pushed.
- `supabase/functions/muntra-webhook/minimize.ts` – the allow-list. To store a new field,
  add it here, add a column in a new migration, and extend `minimize.test.ts`.
- `web/` – plain HTML, CSS and JavaScript (no build step). `app.js` uses supabase-js and Chart.js
  from a CDN. Escape any value you put into `innerHTML` with `esc()`.
- `scripts/` – Node scripts that read `.env`.

## Muntra webhook facts

- Body is JSON:API: `data` (type `booking`) plus `included` (`booking_attendee`, `patient`,
  `user`, `clinic`, `booking_type`, `procedure`). The example in
  `fixtures/booking-webhook.example.json` uses fake data.
- The body does **not** say which trigger fired. Each trigger is registered as its own
  webhook, and `?trigger=created|updated|deleted` is added as a webhook query parameter.
- Webhooks are not signed. `?secret=` is checked by the function.
- Booking `status`: `TENTATIVE`, `CONFIRMED`, `CANCELLED`.
- Patient attendee `partstat`: `NEEDS-ACTION`, `TENTATIVE`, `ACCEPTED`, `DECLINED`.
- `arrived_at` on the patient attendee is set when reception checks the patient in.
- Booking flags: `patient_failed_to_appear`, `patient_failed_to_appear_handled`,
  `patient_made_late_cancellation`, `patient_wants_earlier_slot`, `new_patient`, `done`.
- Muntra deactivates a webhook that has kept failing for 24 hours. Check with
  `npm run register-webhooks -- --list`.

## Muntra API

- Base URL from `MUNTRA_API_BASE_URL`, `Authorization: Bearer <MUNTRA_API_TOKEN>`.
- Full reference: https://api.muntra.com/api/documentation
- Useful read endpoints: `GET /api/bookings` (filters include `from_date`, `to_date`,
  `patient_failed_to_appear`, `patient_made_late_cancellation`, `patient_wants_earlier_slot`,
  `status`), `GET /api/bookings/{id}`, `GET /api/patients/{id}`, `GET /api/booking-types`,
  `GET /api/users`.
- The API token is a secret. It lives in Supabase secrets and `.env` only, never in `web/`.

## Checking your work

- `npm test` runs the Deno tests for the webhook allow-list. Run it after touching
  `minimize.ts`.
- `npm run test-webhook -- --minutes -25` sends a fake booking that started 25 minutes ago
  and should show up under "Not arrived yet".
- After changing SQL: `npx supabase db push`. After changing a function:
  `npx supabase functions deploy <name>`.
