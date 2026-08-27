ALTER TABLE users ADD COLUMN resident_type TEXT NOT NULL DEFAULT 'owner'
  CHECK (resident_type IN ('owner', 'tenant', 'household_member'));
ALTER TABLE users ADD COLUMN notify_announcements INTEGER NOT NULL DEFAULT 1 CHECK (notify_announcements IN (0, 1));
ALTER TABLE users ADD COLUMN notify_events INTEGER NOT NULL DEFAULT 1 CHECK (notify_events IN (0, 1));

CREATE INDEX users_resident_type_idx ON users(resident_type, status);
