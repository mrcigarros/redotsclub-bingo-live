import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export async function POST(request) {
  const supabase = createClient(url || "", key || "");

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { gameId, name, deviceUuid } = body || {};
  if (!gameId || !name || !deviceUuid) {
    return NextResponse.json({ error: "Missing gameId, name, or deviceUuid" }, { status: 400 });
  }

  // 1. Check if this device already claimed a card in this game
  const { data: existing } = await supabase
    .from("card_claims")
    .select("card_number, claimer_name")
    .eq("game_id", gameId)
    .eq("device_uuid", deviceUuid)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ cardNumber: existing.card_number, claimerName: existing.claimer_name, resumed: true });
  }

  // 2. Get all currently claimed card numbers for this game
  const { data: claimed, error: claimErr } = await supabase
    .from("card_claims")
    .select("card_number")
    .eq("game_id", gameId);

  if (claimErr) {
    return NextResponse.json({ error: "Failed to read claims", detail: claimErr.message }, { status: 500 });
  }

  const taken = new Set((claimed || []).map(r => r.card_number));
  const available = [];
  for (let i = 1; i <= 250; i++) if (!taken.has(i)) available.push(i);

  if (available.length === 0) {
    return NextResponse.json({ error: "All 250 cards have been claimed" }, { status: 409 });
  }

  // 3. Try to insert a random unclaimed card. Retry on collision (race condition between read and write).
  for (let attempt = 0; attempt < 10; attempt++) {
    const cardNumber = available[Math.floor(Math.random() * available.length)];
    const { error: insErr } = await supabase
      .from("card_claims")
      .insert({
        game_id: gameId,
        card_number: cardNumber,
        claimer_name: name.slice(0, 40),
        device_uuid: deviceUuid,
      });

    if (!insErr) {
      return NextResponse.json({ cardNumber, claimerName: name, resumed: false });
    }
    // PK violation → another device grabbed this number; remove it and retry
    if (insErr.code === "23505") {
      const idx = available.indexOf(cardNumber);
      if (idx >= 0) available.splice(idx, 1);
      if (available.length === 0) {
        return NextResponse.json({ error: "All cards claimed (race)" }, { status: 409 });
      }
      continue;
    }
    return NextResponse.json({ error: "Insert failed", detail: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ error: "Could not assign a card after 10 retries" }, { status: 500 });
}
