# Raz AI Coaching Platform

An AI coaching engine: a client fills in a short intake (goal, experience, days, equipment, injuries), and the engine builds a complete, individualized training program plus a one-click spreadsheet. Clients get a personal code to return and request adjustments.

## Stack

- **Backend:** Node.js + Express (`server.js`)
- **AI:** Google Gemini (`@google/genai`), model `gemini-2.5-flash`
- **Storage:** SQLite (`better-sqlite3`) at `data/data.db`
- **Front-end:** static HTML/JS in `public/`

## Endpoints

- `POST /api/build` — body `{ "intake": { ... } }` → returns `{ token, program }`
- `POST /api/adjust` — body `{ token, request }` → surgical adjustment of an existing program
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
   - (optional) `GEMINI_MODEL` = `gemini-2.5-flash`
   - Do **not** set `USE_PPLX_PROXY`.
5. Deploy. Check `/api/health` shows `"mode":"gemini"`.

> Set a billing cap in [Google Cloud Console](https://console.cloud.google.com) → Billing → Budgets.

## Privacy

All client-facing output is scrubbed of internal coaching labels (volume abbreviations, article citations, weekly-state names, etc.) before it reaches the client. The engine applies elite logic to each client's own goal.
