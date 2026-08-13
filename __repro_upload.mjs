import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const envText = readFileSync(".env.local", "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

// Anon-key client + real sign-in, exactly like the browser.
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
  email: process.env.DEMO_COACH_EMAIL,
  password: process.env.DEMO_COACH_PASSWORD,
});
if (signInErr) { console.log("SIGN IN FAILED:", signInErr.message); process.exit(1); }
console.log("Signed in as:", signInData.user.id, signInData.user.email);

const { data: coach, error: coachErr } = await supabase.from("coaches").select("id, organisation_id, role").eq("id", signInData.user.id).single();
console.log("Coach row:", coachErr ? coachErr.message : JSON.stringify(coach));

if (!coach) process.exit(1);

const testPath = `${coach.organisation_id}/logo-test.png`;
console.log("Upload path:", testPath);

const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);
const { error: upErr } = await supabase.storage.from("org-logos").upload(testPath, tinyPng, { contentType: "image/png", upsert: true });
console.log("Authenticated upload result:", upErr ? `FAILED: ${upErr.message}` : "SUCCESS");
