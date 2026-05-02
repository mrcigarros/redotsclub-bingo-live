# RedotsClub Bingo Live — v2.1 (Drop 2)

This drop adds the **player-side experience**: QR claim flow, live card view with
auto-marking, BINGO claim with operator notification, and a permanent fix for the
hydration warning.

## What's new in v2.1

### New pages
- `/claim?g={gameId}` — guest enters name → backend assigns next available card → redirect
- `/card/[n]?g={gameId}` — player's personal card, auto-marks via Supabase Realtime
- `/api/claim` — server-side route that atomically assigns cards (race-safe)

### New on operator screen
- **BINGO claim notification** — full-screen overlay when a guest claims BINGO from their phone
- Big card # + claimer name displayed
- Cross-references with the existing Hot Cards panel for verification

### Fixes
- Hydration warning permanently fixed (was cosmetic but ugly)

## How to upgrade your existing v2.0 deployment

You already have `mrcigarros/redotsclub-bingo-live` deployed. We just push the new files.

### Option A — Replace files locally and push (recommended)

1. **Stop the dev server** (Ctrl+C in the terminal running `npm run dev`)

2. **Unzip this archive** somewhere (e.g., `~/Downloads/redotsclub-bingo-live-v2.1`)

3. **Copy the new/changed files over your existing repo**:

```bash
cd ~/Downloads/redotsclub-bingo-live

# Copy new files
cp -r ~/Downloads/redotsclub-bingo-live-v2.1/redotsclub-bingo-live/app/api ./app/
cp -r ~/Downloads/redotsclub-bingo-live-v2.1/redotsclub-bingo-live/app/claim ./app/
cp -r ~/Downloads/redotsclub-bingo-live-v2.1/redotsclub-bingo-live/app/card ./app/

# Overwrite changed files
cp ~/Downloads/redotsclub-bingo-live-v2.1/redotsclub-bingo-live/app/BingoMachine.jsx ./app/
cp ~/Downloads/redotsclub-bingo-live-v2.1/redotsclub-bingo-live/app/lobby/page.js ./app/lobby/
```

4. **Commit and push**:

```bash
git add .
git commit -m "v2.1: claim flow, player card view, bingo notifications"
git push
```

5. **Vercel auto-deploys** in ~60 seconds. Check the dashboard at vercel.com for build status.

### Option B — Nuke and replace

If something feels off, you can delete the old repo folder, unzip this fresh, and redo the
deploy. Just remember to copy your `.env.local` over before running `npm install`.

## Test plan with 10-12 friends

Once Vercel finishes redeploying:

### Solo smoke test (you, 2 minutes)

1. Open the deployed URL on your laptop
2. Click `OPEN LOBBY (QR)` → new window with QR
3. **On your phone**: scan the QR with the camera app
4. You should land on the claim page → type a name → "GET MY CARD"
5. You're now on the player card view — see the 5x5 card with your card #
6. **On your laptop**, hit `CALL!` a few times
7. **Watch your phone** — numbers should auto-mark in real-time, with a pop animation on the latest call

If that works → Realtime is functional, you're ready for the group test.

### Group test (10-12 friends)

1. Everyone opens the QR link on their phone (or you broadcast the URL via WhatsApp)
2. Each person types their name, gets a card
3. The `/lobby` window on your laptop shows the live "X / 250 claimed" counter ticking up
4. Start calling balls — everyone's cards auto-mark
5. Eventually someone hits BINGO:
   - Their phone vibrates + shows fullscreen celebration
   - They tap "CALL BINGO"
   - **Your operator screen pops up a big notification** with their card # and name
   - Cross-check against the Hot Cards panel — if their card # is in the winners list, legit win
6. Dismiss → continue or end round

### Edge cases to test on purpose

Have one of your 10-12 friends try each:

- **Refresh mid-game** — their card should reload to the same number, with all the marks
- **Close tab + reopen** — same behavior (localStorage saves the device UUID)
- **Try to claim a second time** — they should be sent right back to their existing card (not a new one)
- **Toggle airplane mode for 30s, then back on** — when reconnected, the card should catch up via the polling fallback (4s)
- **Phone goes to sleep** — when they wake it back up, sync should resume

## Architecture summary

```
Operator (laptop)            Supabase                 Player (phone)
─────────────────            ────────                 ──────────────
BingoMachine.jsx             games table              /card/[n]
  - call ball                   called_numbers[]  ←──   - auto-marks via Realtime
  - sync ──────────────────► (UPDATE)                   - polling fallback every 4s
                                                        - detects BINGO locally
BingoAlertOverlay            card_claims table        /claim
  - listens for                claimer_name             - POST to /api/claim
    bingo_claimed_at  ◄────── (UPDATE) ◄──────────────  - device UUID locked
                                                        
                             /api/claim (server)
                              - atomic insert
                              - retries on collision
```

## File changes summary

```
NEW:
  app/api/claim/route.js        Server route: atomic card assignment
  app/claim/page.js             Guest name entry + redirect
  app/card/[n]/page.js          Player's live card view

CHANGED:
  app/BingoMachine.jsx          + BingoAlertOverlay component
                                + useBingoAlerts hook
                                + hydration fix in <style> tag
  app/lobby/page.js             + hydration fix

UNCHANGED (don't touch):
  lib/cards.js                  250 cards (same as v2.0)
  lib/supabase.js               Client singleton
  app/page.js, app/layout.js    Same as v2.0
  package.json                  Same as v2.0
```

## Troubleshooting

### Phone scans QR but stays on `/claim` and never moves
- Open browser console on the phone (Safari → Advanced → Web Inspector via Mac)
- Look for errors near `/api/claim`
- Most likely: Supabase RLS not allowing inserts. Verify by going to Supabase → SQL Editor → run:
  ```sql
  select * from card_claims limit 1;
  ```
  If permission denied, the policies didn't get applied. Re-run the schema SQL.

### "All 250 cards have been claimed"
- An old game has all slots taken. Hit `↺` reset on operator → it'll create a fresh game with new IDs.

### Player's card doesn't update when ball is called
- Check sync pill on player's card view. If it shows ERROR, Supabase Realtime isn't firing.
- Quick test: have the player refresh — the polling fallback fetches fresh data on mount.
- Long-term fix: verify Realtime is enabled on the `games` table in Supabase → Database → Replication.

### BINGO claim doesn't notify operator
- The operator was on a stale page when the alert fired. Refresh the operator screen.
- Check Supabase Realtime status on the operator side (the LIVE pill).
