-- Schema for the Raz AI Coaching Platform (Supabase / Postgres).
-- Mirrors the SQLite tables in storage.js. created_at/updated_at are
-- epoch-millisecond integers (bigint) to match the existing Date.now() usage.

CREATE TABLE IF NOT EXISTS clients (
  token       text PRIMARY KEY,
  intake      text,
  program     text,
  created_at  bigint,
  updated_at  bigint
);

CREATE TABLE IF NOT EXISTS history (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  token       text,
  kind        text,            -- 'build' | 'adjust'
  request     text,
  program     text,
  created_at  bigint
);
CREATE INDEX IF NOT EXISTS history_token_idx ON history (token);

CREATE TABLE IF NOT EXISTS usage (
  token       text,
  day         text,            -- YYYY-MM-DD (UTC)
  builds      integer DEFAULT 0,
  adjusts     integer DEFAULT 0,
  PRIMARY KEY (token, day)
);
