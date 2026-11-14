-- Idempotent schema for the trainer's platform. Apply with `npm run migrate`.
-- Every statement is safe to run again on an existing database.

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('anon', 'member')),
  handle text UNIQUE,
  display_name text,
  discord_id text UNIQUE,
  discord_avatar text,
  survev_slug text,
  tz text,
  remind_hour int CHECK (remind_hour BETWEEN 0 AND 23),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

-- Passkey sign-in was removed on 2026-11-11 (production had no passkeys).
DROP TABLE IF EXISTS webauthn_challenges;
DROP TABLE IF EXISTS passkeys;

CREATE TABLE IF NOT EXISTS runs (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id text NOT NULL,
  ts timestamptz NOT NULL,
  day date NOT NULL,
  key text NOT NULL,
  label text,
  score real,
  duration real,
  warmup boolean NOT NULL DEFAULT false,
  benchmark boolean NOT NULL DEFAULT false,
  routine_completed boolean NOT NULL DEFAULT false,
  data jsonb NOT NULL,
  UNIQUE (user_id, client_id)
);
CREATE INDEX IF NOT EXISTS runs_user_ts ON runs(user_id, ts);
CREATE INDEX IF NOT EXISTS runs_user_completed_day ON runs(user_id, day) WHERE routine_completed;

CREATE TABLE IF NOT EXISTS challenges (
  id text PRIMARY KEY,
  creator_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scenario text NOT NULL,
  key text NOT NULL,
  seed bigint NOT NULL,
  score real NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS challenges_creator ON challenges(creator_id);

CREATE TABLE IF NOT EXISTS challenge_results (
  challenge_id text NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score real NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (challenge_id, user_id)
);

-- Undirected: stored once with a < b.
CREATE TABLE IF NOT EXISTS friendships (
  a uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  b uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (a, b),
  CHECK (a < b)
);
CREATE INDEX IF NOT EXISTS friendships_b ON friendships(b);

CREATE TABLE IF NOT EXISTS user_guilds (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  guild_id text NOT NULL,
  guild_name text,
  guild_icon text,
  PRIMARY KEY (user_id, guild_id)
);
CREATE INDEX IF NOT EXISTS user_guilds_guild ON user_guilds(guild_id);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_sent_day date,
  last_kind text
);
CREATE INDEX IF NOT EXISTS push_user ON push_subscriptions(user_id);

CREATE TABLE IF NOT EXISTS feedback (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  anon_id text,
  text text NOT NULL,
  context jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
  id bigserial PRIMARY KEY,
  anon_id text,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  name text NOT NULL,
  props jsonb,
  ts timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_name_ts ON events(name, ts);
CREATE INDEX IF NOT EXISTS events_anon_ts ON events(anon_id, ts);

-- Email sign-in (codes sent and checked by Neon Auth, see lib/email.mjs) and the week plan.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_email text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_sent_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_send_count int NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users(email);

-- Tier lists players make on /guns/tier-list/ and /perks/tier-list/. tiers is {"S": [ids], ..., "D": [ids]}.
-- Anyone can read one by id; hidden ones (hidden from the admin page) are never served.
-- (gun_votes, from the per-gun votes of 2026-11-14, is no longer used and is left in place.)
CREATE TABLE IF NOT EXISTS tier_lists (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('guns', 'perks')),
  title text NOT NULL DEFAULT '',
  by_name text NOT NULL DEFAULT '',
  tiers jsonb NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ip_hash text,
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tier_lists_kind ON tier_lists(kind, created_at);
CREATE INDEX IF NOT EXISTS tier_lists_ip ON tier_lists(ip_hash, created_at);

-- Votes on tier lists: players' (tier_lists.id) and the community's published ones ("c-…" ids from
-- guides/community-tierlists.json, which is why there is no foreign key). ip_hash is a keyed hash.
CREATE TABLE IF NOT EXISTS tier_list_votes (
  list_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vote smallint NOT NULL CHECK (vote IN (-1, 1)),
  ip_hash text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (list_id, user_id)
);
CREATE INDEX IF NOT EXISTS tier_list_votes_ip ON tier_list_votes(ip_hash, updated_at);
