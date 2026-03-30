// One-time script to register the Strava webhook subscription.
// Usage: npx tsx scripts/register-webhook.ts
//
// Before running:
//   1. Replace <your-project-ref> in WEBHOOK_URL below with your Supabase project ref
//      (find it in your Supabase dashboard URL: https://supabase.com/dashboard/project/<ref>)
//   2. Ensure STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET are set in .env.local

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const WEBHOOK_URL =
  "https://bhmsnnoiddzwojiabeto.supabase.co/functions/v1/strava-webhook";

// Must match the STRAVA_WEBHOOK_VERIFY_TOKEN secret set in Supabase
const VERIFY_TOKEN = "strava-agent-verify";

async function registerWebhook() {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("Missing STRAVA_CLIENT_ID or STRAVA_CLIENT_SECRET in .env.local");
    process.exit(1);
  }

  if (WEBHOOK_URL.includes("<your-project-ref>")) {
    console.error("Update WEBHOOK_URL in this script with your Supabase project ref first.");
    process.exit(1);
  }

  console.log("Registering webhook at:", WEBHOOK_URL);

  const res = await fetch("https://www.strava.com/api/v3/push_subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      callback_url: WEBHOOK_URL,
      verify_token: VERIFY_TOKEN,
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error("Registration failed:", JSON.stringify(data, null, 2));
    process.exit(1);
  }

  console.log("\nWebhook registered successfully!");
  console.log("Subscription ID:", data.id);
  console.log("\nSave this ID — you need it if you ever want to delete or update the subscription:");
  console.log(
    `  curl -X DELETE "https://www.strava.com/api/v3/push_subscriptions/${data.id}?client_id=${clientId}&client_secret=<secret>"`
  );
}

registerWebhook();
