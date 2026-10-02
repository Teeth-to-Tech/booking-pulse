// Sends a fake booking webhook to your Supabase function, exactly like Muntra
// would. Useful before Muntra is connected, or to create test data.
//
//   npm run test-webhook                         a booking starting in 1 hour
//   npm run test-webhook -- --minutes 30         starts in 30 minutes
//   npm run test-webhook -- --minutes -25        started 25 minutes ago (shows up as "not arrived")
//   npm run test-webhook -- --trigger deleted --id 48213
//   npm run test-webhook -- --status CANCELLED

import { readFile } from "node:fs/promises";

const required = ["MUNTRA_WEBHOOK_SECRET", "SUPABASE_URL"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing in .env: ${missing.join(", ")}`);
  process.exit(1);
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}

const trigger = arg("trigger", "created");
const minutes = Number(arg("minutes", 60));
const id = arg("id", String(Math.floor(100000 + Math.random() * 900000)));
const status = arg("status", "CONFIRMED");

const payload = JSON.parse(await readFile(new URL("../fixtures/booking-webhook.example.json", import.meta.url), "utf8"));
const start = new Date(Date.now() + minutes * 60_000);
const end = new Date(start.getTime() + 45 * 60_000);

payload.data.id = id;
payload.data.attributes.dtstart = start.toISOString();
payload.data.attributes.dtend = end.toISOString();
payload.data.attributes.status = status;
payload.included.find((i) => i.type === "booking_attendee").attributes.dtstart = start.toISOString();
payload.data.relationships.patient.data.id = String(5000 + Math.floor(Math.random() * 1000));

const url = new URL(`${process.env.SUPABASE_URL.replace(/\/+$/, "")}/functions/v1/muntra-webhook`);
url.searchParams.set("secret", process.env.MUNTRA_WEBHOOK_SECRET);
url.searchParams.set("trigger", trigger);

const response = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

console.log(`${response.status} ${await response.text()}`);
console.log(`booking ${id} · ${trigger} · ${status} · starts ${start.toLocaleString("sv-SE")}`);
