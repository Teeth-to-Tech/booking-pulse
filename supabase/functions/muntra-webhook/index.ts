// Receives booking webhooks from Muntra and stores a minimized copy.
//
// Muntra calls:  POST <function-url>?secret=<MUNTRA_WEBHOOK_SECRET>&trigger=created|updated|deleted
// The secret and trigger are added as webhook query parameters when you run
// `npm run register-webhooks`. Muntra does not sign webhook requests, so the
// secret is what stops strangers from writing to your database.

import { createClient } from "npm:@supabase/supabase-js@2";
import { isTrigger, minimizeBooking } from "./minimize.ts";

const WEBHOOK_SECRET = Deno.env.get("MUNTRA_WEBHOOK_SECRET") ?? "";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function secretMatches(given: string): Promise<boolean> {
  if (!WEBHOOK_SECRET || !given) return false;
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(given)),
    crypto.subtle.digest("SHA-256", encoder.encode(WEBHOOK_SECRET)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST" && req.method !== "PATCH") {
    return reply(405, { error: "Method not allowed" });
  }

  const url = new URL(req.url);

  if (!(await secretMatches(url.searchParams.get("secret") ?? ""))) {
    return reply(401, { error: "Invalid secret" });
  }

  const trigger = url.searchParams.get("trigger");
  if (!isTrigger(trigger)) {
    return reply(400, { error: "Missing or unknown trigger query parameter" });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return reply(400, { error: "Body is not valid JSON" });
  }

  // Never log `payload`: it contains patient details.
  const booking = minimizeBooking(payload, trigger);
  if (!booking) {
    return reply(422, { error: "Not a booking payload" });
  }

  const { error: upsertError } = await supabase
    .from("bookings")
    .upsert(booking, { onConflict: "booking_id" });

  if (upsertError) {
    console.error("Upsert failed for booking", booking.booking_id, upsertError.message);
    return reply(500, { error: "Could not save booking" });
  }

  const { error: eventError } = await supabase.from("booking_events").insert({
    booking_id: booking.booking_id,
    trigger,
    status: booking.status,
    starts_at: booking.starts_at,
  });

  if (eventError) {
    console.error("Event log failed for booking", booking.booking_id, eventError.message);
  }

  console.log(`booking ${booking.booking_id} ${trigger}`);
  return reply(200, { ok: true, booking_id: booking.booking_id });
});
