import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  // Don't crash the build, just warn — useful in Vercel preview deploys
  // where env vars might be missing.
  console.warn("[supabase] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
}

export const supabase = createClient(url || "", key || "", {
  realtime: { params: { eventsPerSecond: 10 } },
});

export const SUPABASE_READY = !!(url && key);
