CREATE TABLE guest_registrations (
  id TEXT PRIMARY KEY,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  registered_by TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  guest_name TEXT NOT NULL,
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  pool_responsibility_acknowledged INTEGER NOT NULL DEFAULT 0 CHECK (pool_responsibility_acknowledged IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (ends_on >= starts_on)
);

CREATE INDEX guest_registrations_property_dates_idx ON guest_registrations(property_id, status, ends_on DESC);
CREATE INDEX guest_registrations_user_date_idx ON guest_registrations(registered_by, created_at DESC);
