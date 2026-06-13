# Raz AI Coaching Platform

An AI coaching engine: a client fills in a short intake (goal, experience, days, equipment, injuries), and the engine builds a complete, individualized training program plus a one-click spreadsheet. Clients get a personal code to return and request adjustments.

## Stack

- **Backend:** Node.js + Express (`server.js`)
- **AI:** Google Gemini (`@google/genai`), model `gemini-2.5-flash`
- **Storage:** Supabase (Postgres) in production; SQLite (`better-sqlite3`) fallback for local dev. Selected automatically by env vars (see below).
- **Front-end:** static HTML/JS in `public/`

## Endpoints

- `POST /api/build` — body `{ "intake": { ... } }` → returns `202 { job_id, token, status }` and generates in the background
- `POST /api/adjust` — body `{ token, request }` → returns `202 { job_id, token, status }`; surgical adjustment of an existing program
- `GET /api/job/:id` — poll a build/adjust job → `{ status: "pending"|"done"|"error", program?, error? }`

  Build/adjust are async because the engine call takes ~30-60s; a synchronous request times out on free hosts (e.g. Render free tier) and truncates the program. The front-end polls `/api/job/:id` every 2s until done.

  Note: `gemini-2.5-flash` is a thinking model — `thinkingConfig.thinkingBudget: 0` is only a hint (it still spends ~4-5k tokens thinking), so `maxOutputTokens` is set to 32768 to leave room for the full program.
- `GET /api/program/:token` — fetch a saved program
- `GET /api/health` — shows mode (`gemini` when a key is set)

## Run locally

```bash
npm install
cp .env.example .env      # then put your real GEMINI_API_KEY in .env
GEMINI_API_KEY=your-key node server.js
# open http://localhost:8000
```

## Deploy on Render (free tier)

1. Push this repo to GitHub (done).
2. On [Render](https://render.com): **New → Web Service → connect this repo**.
3. Settings:
   - **Runtime:** Node
   - **Build command:** `npm install`
   - **Start command:** `npm start`
4. **Environment** tab → add:
   - `GEMINI_API_KEY` = your Google AI Studio key
   - `SUPABASE_URL` = your Supabase project URL
   - `SUPABASE_ANON_KEY` = your Supabase legacy anon (JWT) key
   - (optional) `GEMINI_MODEL` = `gemini-2.5-flash`
   - Do **not** set `USE_PPLX_PROXY`.
5. Deploy. Check `/api/health` shows `"mode":"gemini","storage":"supabase"`.

## Storage

The app auto-selects its database:

- **Supabase (Postgres)** when `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set — persistent, survives restarts/redeploys, recommended for real clients.
- **SQLite** otherwise — zero-config local dev only; data does not persist on a fresh host.

Schema lives in `supabase_migration.sql` (already applied to the connected project).

> Set a billing cap in [Google Cloud Console](https://console.cloud.google.com) → Billing → Budgets.

## Privacy

All client-facing output is scrubbed of internal coaching labels (volume abbreviations, article citations, weekly-state names, etc.) before it reaches the client. The engine applies elite logic to each client's own goal.
