PRAGMA foreign_keys = ON;

CREATE TABLE announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'members' CHECK (audience IN ('public', 'members')),
  published_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX announcements_published_idx ON announcements(published_at DESC);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'members' CHECK (audience IN ('public', 'members')),
  event_type TEXT NOT NULL DEFAULT 'community' CHECK (event_type IN ('community', 'meeting', 'clubhouse')),
  created_by TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (ends_at > starts_at)
);

CREATE INDEX events_dates_idx ON events(starts_at, ends_at);

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  document_url TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'General',
  audience TEXT NOT NULL DEFAULT 'members' CHECK (audience IN ('public', 'members')),
  created_by TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX documents_audience_category_idx ON documents(audience, category, title);

CREATE TABLE clubhouse_reservations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  event_id TEXT NOT NULL UNIQUE REFERENCES events(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  event_name TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  attendee_count INTEGER NOT NULL CHECK (attendee_count BETWEEN 1 AND 100),
  notes TEXT,
  rules_acknowledged_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  deposit_status TEXT NOT NULL DEFAULT 'not_configured' CHECK (deposit_status IN ('not_configured', 'pending', 'held', 'released', 'forfeited')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (ends_at > starts_at)
);

CREATE INDEX reservations_dates_idx ON clubhouse_reservations(starts_at, ends_at, status);
CREATE INDEX reservations_user_idx ON clubhouse_reservations(user_id, starts_at DESC);
