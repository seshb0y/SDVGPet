CREATE TABLE IF NOT EXISTS settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  timezone text NOT NULL DEFAULT 'Europe/Moscow',
  quiet_start text NOT NULL DEFAULT '23:00',
  quiet_end text NOT NULL DEFAULT '09:00'
);

CREATE TABLE IF NOT EXISTS pet (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  food real NOT NULL DEFAULT 100,
  walk real NOT NULL DEFAULT 100,
  play real NOT NULL DEFAULT 100,
  love real NOT NULL DEFAULT 100,
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_completed_at timestamptz,
  completed_total int NOT NULL DEFAULT 0,
  last_note_date text
);

INSERT INTO settings DEFAULT VALUES ON CONFLICT DO NOTHING;
INSERT INTO pet DEFAULT VALUES ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS tasks (
  id serial PRIMARY KEY,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  need text CHECK (need IN ('food', 'walk', 'play', 'love')),
  due_at timestamptz,
  done_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  source_message_id bigint UNIQUE
);

CREATE TABLE IF NOT EXISTS routines (
  id serial PRIMARY KEY,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  need text NOT NULL CHECK (need IN ('food', 'walk', 'play', 'love')),
  time text NOT NULL CHECK (time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  days int NOT NULL CHECK (days BETWEEN 1 AND 127),
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS routine_log (
  routine_id int NOT NULL REFERENCES routines (id) ON DELETE CASCADE,
  date text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  done_at timestamptz,
  snoozed_until timestamptz,
  PRIMARY KEY (routine_id, date)
);

CREATE TABLE IF NOT EXISTS outbox_log (
  id serial PRIMARY KEY,
  dedup_key text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('need', 'followup', 'morning', 'evening')),
  need text,
  local_date text NOT NULL,
  sent_at timestamptz NOT NULL,
  answered_at timestamptz,
  followed_up boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS rewards (
  id serial PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('note', 'photo')),
  text text,
  file_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  unlocked_at timestamptz
);
