// One-command setup. Reads .env and does everything the guide would otherwise
// ask you to do by hand. Safe to run again: steps that are already done are skipped.
//
//   npm run setup

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ENV_FILE = new URL("../.env", import.meta.url);
const CONFIG_FILE = new URL("../web/config.js", import.meta.url);
const isWindows = process.platform === "win32";

const steps = [];
let current = 0;

function step(title, run) {
  steps.push({ title, run });
}

function ok(message) {
  console.log(`   ✔ ${message}`);
}

function fail(message, hint) {
  console.error(`\n✖ ${message}`);
  if (hint) console.error(`\n  What to do: ${hint}`);
  console.error("\n  When it's fixed, run  npm run setup  again. Steps already done are skipped.\n");
  process.exit(1);
}

function supabase(args, { capture = false } = {}) {
  const result = spawnSync(isWindows ? "npx.cmd" : "npx", ["supabase", ...args], {
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: "utf8",
    env: process.env,
    shell: isWindows,
  });
  return result;
}

function updateEnvValue(key, value) {
  const text = readFileSync(ENV_FILE, "utf8");
  const line = new RegExp(`^${key}=.*$`, "m");
  writeFileSync(ENV_FILE, line.test(text) ? text.replace(line, `${key}=${value}`) : `${text.trimEnd()}\n${key}=${value}\n`);
  process.env[key] = value;
}

const env = (key) => (process.env[key] ?? "").trim();

// ---------------------------------------------------------------- steps

step("Checking your .env file", () => {
  if (!existsSync(ENV_FILE)) {
    fail("There is no .env file yet.", "Copy .env.example to a new file called .env and fill it in (see GUIDE.md, step 4).");
  }

  const [major] = process.versions.node.split(".").map(Number);
  if (major < 22) {
    fail(`Node.js ${process.versions.node} is too old.`, "Install the LTS version from https://nodejs.org and restart Claude.");
  }

  const missing = ["SUPABASE_URL", "SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD", "DASHBOARD_EMAIL", "DASHBOARD_PASSWORD"]
    .filter((key) => !env(key) || env(key).includes("YOUR-"));
  if (missing.length) {
    fail(`These are still empty in .env: ${missing.join(", ")}`, "See GUIDE.md, step 4, for where to find each value.");
  }

  const match = env("SUPABASE_URL").match(/^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/);
  if (!match) {
    fail("SUPABASE_URL doesn't look right.", "It should look like https://abcdefghijklmnopqrst.supabase.co (Supabase → Project Settings → Data API).");
  }
  process.env.PROJECT_REF = match[1];

  if (env("DASHBOARD_PASSWORD").length < 8) {
    fail("DASHBOARD_PASSWORD is too short.", "Use at least 8 characters.");
  }

  if (!env("MUNTRA_WEBHOOK_SECRET")) {
    updateEnvValue("MUNTRA_WEBHOOK_SECRET", randomBytes(32).toString("hex"));
    ok("Created a webhook secret and saved it in .env");
  }

  ok(`Supabase project ${process.env.PROJECT_REF}`);
});

step("Connecting to your Supabase project", () => {
  const result = supabase(["link", "--project-ref", process.env.PROJECT_REF, "--password", env("SUPABASE_DB_PASSWORD")], { capture: true });
  if (result.status !== 0) {
    const output = `${result.stdout}${result.stderr}`;
    if (/access token|Unauthorized|401/i.test(output)) {
      fail("Supabase didn't accept the access token.", "Create a new one at https://supabase.com/dashboard/account/tokens and paste it into SUPABASE_ACCESS_TOKEN in .env.");
    }
    fail(`Could not connect to the project.\n${output.trim()}`, "Check SUPABASE_URL and SUPABASE_DB_PASSWORD in .env.");
  }
  ok("Connected");
});

step("Creating the database tables", () => {
  const result = supabase(["db", "push", "--linked", "--password", env("SUPABASE_DB_PASSWORD"), "--yes"]);
  if (result.status !== 0) {
    fail("Creating the tables failed (see the message above).", "If it mentions the password, check SUPABASE_DB_PASSWORD. You can reset it in Supabase → Project Settings → Database.");
  }
  ok("Tables, views and security rules are in place");
});

step("Saving secrets for the functions", () => {
  const secrets = ["MUNTRA_WEBHOOK_SECRET", "MUNTRA_API_BASE_URL", "MUNTRA_API_TOKEN"]
    .filter((key) => env(key))
    .map((key) => `${key}=${env(key)}`);
  const result = supabase(["secrets", "set", "--project-ref", process.env.PROJECT_REF, ...secrets], { capture: true });
  if (result.status !== 0) fail(`Saving secrets failed.\n${result.stderr}`.trim());
  ok(`Saved ${secrets.length} secret(s)`);
  if (!env("MUNTRA_API_TOKEN")) console.log("   ! No Muntra API token yet. The dashboard works, but 'Show contact' won't until you add it and run setup again.");
});

step("Deploying the functions", () => {
  const result = supabase(["functions", "deploy", "--project-ref", process.env.PROJECT_REF, "--use-api"]);
  if (result.status !== 0) fail("Deploying the functions failed (see the message above).");
  ok("muntra-webhook and patient-contact are live");
});

step("Connecting the dashboard to Supabase", () => {
  const result = supabase(["projects", "api-keys", "--project-ref", process.env.PROJECT_REF, "--reveal", "-o", "json"], { capture: true });
  if (result.status !== 0) fail(`Could not read the project's API keys.\n${result.stderr}`.trim());

  let keys;
  try {
    keys = JSON.parse(result.stdout);
  } catch {
    fail("Could not understand the API key list from Supabase.");
  }

  const valueOf = (k) => k.api_key ?? k.key ?? "";
  const publicKey = keys.find((k) => k.name === "anon") ?? keys.find((k) => k.type === "publishable");
  const secretKey = keys.find((k) => k.name === "service_role") ?? keys.find((k) => k.type === "secret");
  if (!publicKey || !secretKey) fail("Could not find the project's API keys.");

  process.env.SERVICE_KEY = valueOf(secretKey);

  writeFileSync(
    CONFIG_FILE,
    `// Written by npm run setup. Both values are safe to publish:\n` +
      `// the public key can only read what row level security allows (nothing, until you sign in).\n` +
      `export const SUPABASE_URL = "${env("SUPABASE_URL").replace(/\/+$/, "")}";\n` +
      `export const SUPABASE_ANON_KEY = "${valueOf(publicKey)}";\n`,
  );
  ok("Wrote web/config.js");
});

step("Creating your dashboard login", async () => {
  const key = process.env.SERVICE_KEY;
  const headers = { apikey: key, "Content-Type": "application/json" };
  if (!key.startsWith("sb_")) headers.Authorization = `Bearer ${key}`;

  const response = await fetch(`${env("SUPABASE_URL").replace(/\/+$/, "")}/auth/v1/admin/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email: env("DASHBOARD_EMAIL"), password: env("DASHBOARD_PASSWORD"), email_confirm: true }),
  });

  if (response.ok) return ok(`Login created for ${env("DASHBOARD_EMAIL")}`);

  const body = await response.text();
  if (response.status === 422 && /already|exists|registered/i.test(body)) {
    return ok(`Login for ${env("DASHBOARD_EMAIL")} already exists`);
  }
  fail(`Could not create the login (${response.status}).\n${body}`);
});

step("Connecting Muntra", () => {
  if (!env("MUNTRA_API_BASE_URL") || !env("MUNTRA_API_TOKEN")) {
    console.log("   ! Skipped: add MUNTRA_API_BASE_URL and MUNTRA_API_TOKEN to .env, then run setup again.");
    return;
  }
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("./register-webhooks.mjs", import.meta.url))], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    fail("Registering the Muntra webhooks failed (see the message above).", "Check MUNTRA_API_BASE_URL and MUNTRA_API_TOKEN, or ask a Muntra host.");
  }
});

// ---------------------------------------------------------------- run

console.log("\nSetting up Booking Pulse\n");
for (const { title, run } of steps) {
  current += 1;
  console.log(`[${current}/${steps.length}] ${title}`);
  await run();
}

console.log(`
All done! 🎉

  Start the dashboard:     npm run dashboard   → open http://localhost:5173
  Sign in with:            ${env("DASHBOARD_EMAIL")} and the password from .env
  Send a test booking:     npm run test-webhook -- --minutes -25
`);
