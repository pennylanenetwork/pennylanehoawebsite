PRAGMA foreign_keys = OFF;

CREATE TABLE clubhouse_reservations_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  event_id TEXT UNIQUE REFERENCES events(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  event_name TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'Private event',
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  attendee_count INTEGER NOT NULL CHECK (attendee_count BETWEEN 1 AND 65),
  cleaning_method TEXT NOT NULL DEFAULT 'self' CHECK (cleaning_method IN ('self', 'professional')),
  notes TEXT,
  rules_acknowledged_at TEXT NOT NULL,
  rules_version TEXT NOT NULL DEFAULT '2023-02',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'cancelled', 'completed')),
  decision_reason TEXT,
  reviewed_by TEXT REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  reviewed_at TEXT,
  deposit_status TEXT NOT NULL DEFAULT 'not_configured' CHECK (deposit_status IN ('not_configured', 'pending', 'held', 'released', 'forfeited')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (ends_at > starts_at)
);

INSERT INTO clubhouse_reservations_new (
  id, user_id, event_id, event_name, starts_at, ends_at, attendee_count, notes,
  rules_acknowledged_at, status, deposit_status, created_at, updated_at
)
SELECT id, user_id, event_id, event_name, starts_at, ends_at,
  CASE WHEN attendee_count > 65 THEN 65 ELSE attendee_count END,
  notes, rules_acknowledged_at,
  CASE status WHEN 'confirmed' THEN 'approved' ELSE 'cancelled' END,
  deposit_status, created_at, updated_at
FROM clubhouse_reservations;

DROP TABLE clubhouse_reservations;
ALTER TABLE clubhouse_reservations_new RENAME TO clubhouse_reservations;

CREATE INDEX reservations_dates_idx ON clubhouse_reservations(starts_at, ends_at, status);
CREATE INDEX reservations_user_idx ON clubhouse_reservations(user_id, starts_at DESC);
CREATE INDEX reservations_status_idx ON clubhouse_reservations(status, created_at DESC);

PRAGMA foreign_keys = ON;
