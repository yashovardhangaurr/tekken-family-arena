# Tekken Family Arena

Mobile-first family Tekken match tracker for up to 6 players.

## Features
- 1v1 matches
- 2v2 team matches using fixed alternating pairings: A1 vs B1, A2 vs B2, A1 vs B1, A2 vs B2…
- Individual fight scores and characters inside each 2v2 team match
- Automatic team score
- Leaderboard and ELO-style ratings
- Player profiles and inactive-player preservation
- Match history, edit/delete, dates, times and fixed venues
- Supabase online database or local browser fallback

## Supabase setup
1. Create a free project at https://supabase.com/
2. Open SQL Editor and run `supabase.sql`.
3. Copy `.env.example` to `.env`.
4. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
5. Run `npm install` then `npm run dev`.

## Important
There is intentionally no authentication. Anyone with the app URL can edit the data. This matches the requested family-only shared access model, but do not publish the URL publicly if you want the database protected.
