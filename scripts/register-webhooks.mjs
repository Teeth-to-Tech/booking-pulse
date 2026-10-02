// Registers three booking webhooks in your Muntra test clinic
// (created, updated, deleted), each pointing at your Supabase function with
// ?secret=...&trigger=... added as webhook query parameters.
//
//   npm run register-webhooks          create the webhooks (skips ones that already exist)
//   npm run register-webhooks -- --list   show webhooks already registered

const required = ["MUNTRA_API_BASE_URL", "MUNTRA_API_TOKEN", "MUNTRA_WEBHOOK_SECRET", "SUPABASE_URL"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing in .env: ${missing.join(", ")}`);
  process.exit(1);
}

const api = process.env.MUNTRA_API_BASE_URL.replace(/\/+$/, "");
const functionUrl = `${process.env.SUPABASE_URL.replace(/\/+$/, "")}/functions/v1/muntra-webhook`;
const triggers = ["created", "updated", "deleted"];

async function muntra(method, path, attributes) {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.MUNTRA_API_TOKEN}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: attributes ? JSON.stringify({ data: { attributes } }) : undefined,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status}\n${JSON.stringify(body, null, 2)}`);
  }
  return body;
}

if (process.argv.includes("--list")) {
  const { data = [] } = await muntra("GET", "/api/webhooks");
  for (const hook of data) {
    const a = hook.attributes;
    console.log(`#${hook.id}  ${a.model}.${a.request_trigger}  ${a.request_method} ${a.url}${a.deactivated_at ? "  (DEACTIVATED)" : ""}`);
  }
  if (!data.length) console.log("No webhooks registered yet.");
  process.exit(0);
}

const { data: existing = [] } = await muntra("GET", "/api/webhooks");
const alreadyRegistered = (trigger) =>
  existing.some((hook) => {
    const a = hook.attributes;
    return a.model === "booking" && a.request_trigger === trigger && a.url === functionUrl && !a.deactivated_at && !a.deleted_at;
  });

for (const trigger of triggers) {
  if (alreadyRegistered(trigger)) {
    console.log(`Already registered: booking.${trigger}`);
    continue;
  }

  const { data: webhook } = await muntra("POST", "/api/webhooks", {
    request_method: "POST",
    model: "booking",
    request_trigger: trigger,
    url: functionUrl,
  });

  for (const [key, value] of [["secret", process.env.MUNTRA_WEBHOOK_SECRET], ["trigger", trigger]]) {
    await muntra("POST", "/api/webhook-query-parameters", { webhook_id: Number(webhook.id), key, value });
  }

  console.log(`Registered booking.${trigger} -> webhook #${webhook.id}`);
}

console.log(`\nDone. Muntra will now send booking events to:\n  ${functionUrl}`);
console.log("Create or change a booking in your test clinic and watch the dashboard.");
