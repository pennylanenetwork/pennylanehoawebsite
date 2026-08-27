ALTER TABLE events ADD COLUMN status TEXT NOT NULL DEFAULT 'scheduled'
  CHECK (status IN ('scheduled', 'cancelled'));

CREATE INDEX events_status_dates_idx ON events(status, starts_at, ends_at);
