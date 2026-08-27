CREATE TABLE clubhouse_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  opens_at TEXT NOT NULL DEFAULT '08:00',
  closes_at TEXT NOT NULL DEFAULT '23:00',
  cleanup_buffer_minutes INTEGER NOT NULL DEFAULT 60 CHECK (cleanup_buffer_minutes BETWEEN 0 AND 240),
  advance_days INTEGER NOT NULL DEFAULT 90 CHECK (advance_days BETWEEN 1 AND 365),
  max_active_per_household INTEGER NOT NULL DEFAULT 2 CHECK (max_active_per_household BETWEEN 1 AND 10),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL
);

INSERT INTO clubhouse_settings (id) VALUES (1);

CREATE TABLE clubhouse_blackouts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (ends_at > starts_at)
);

CREATE INDEX clubhouse_blackouts_dates_idx ON clubhouse_blackouts(starts_at, ends_at);

ALTER TABLE clubhouse_reservations ADD COLUMN override_reason TEXT;
ALTER TABLE clubhouse_reservations ADD COLUMN override_by TEXT REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL;
