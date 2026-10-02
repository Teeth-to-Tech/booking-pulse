// Looks up a patient's name and mobile number live from the Muntra API so
// reception can call them about a missed booking. Nothing is stored.
//
// Called from the dashboard with:  { booking_id: number }
// Only signed-in dashboard users can call it, and only for bookings that
// exist in this app's bookings table.

import { createClient } from "npm:@supabase/supabase-js@2";

const MUNTRA_API_BASE_URL = (Deno.env.get("MUNTRA_API_BASE_URL") ?? "").replace(/\/+$/, "");
const MUNTRA_API_TOKEN = Deno.env.get("MUNTRA_API_TOKEN") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" });

  if (!MUNTRA_API_BASE_URL || !MUNTRA_API_TOKEN) {
    return reply(500, { error: "MUNTRA_API_BASE_URL and MUNTRA_API_TOKEN secrets are not set" });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const asUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: userData } = await asUser.auth.getUser();
  if (!userData?.user) return reply(401, { error: "Sign in first" });

  let bookingId: number;
  try {
    bookingId = Number((await req.json()).booking_id);
  } catch {
    return reply(400, { error: "Send { booking_id }" });
  }

  const { data: booking } = await asUser
    .from("bookings")
    .select("patient_id")
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (!booking?.patient_id) return reply(404, { error: "No patient on that booking" });

  const response = await fetch(`${MUNTRA_API_BASE_URL}/api/patients/${booking.patient_id}`, {
    headers: { Authorization: `Bearer ${MUNTRA_API_TOKEN}`, Accept: "application/json" },
  });

  if (!response.ok) {
    console.error("Muntra API returned", response.status, "for booking", bookingId);
    return reply(502, { error: `Muntra API returned ${response.status}` });
  }

  const patient = (await response.json())?.data?.attributes ?? {};

  if (patient.protected_identity) {
    return reply(200, { protected_identity: true });
  }

  return reply(200, {
    first_name: patient.first_name ?? null,
    last_name: patient.last_name ?? null,
    phone_number_cell: patient.phone_number_cell ?? null,
    do_not_contact: Boolean(patient.prefers_not_to_be_contacted_by_clinic),
  });
});
