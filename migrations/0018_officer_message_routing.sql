ALTER TABLE users ADD COLUMN is_treasurer INTEGER NOT NULL DEFAULT 0 CHECK (is_treasurer IN (0, 1));
ALTER TABLE users ADD COLUMN is_amenities_coordinator INTEGER NOT NULL DEFAULT 0 CHECK (is_amenities_coordinator IN (0, 1));
ALTER TABLE contact_messages ADD COLUMN routing_group TEXT CHECK (routing_group IN ('treasurer', 'amenities'));

CREATE INDEX users_treasurer_idx ON users(is_treasurer, status);
CREATE INDEX users_amenities_idx ON users(is_amenities_coordinator, status);
CREATE INDEX contact_messages_routing_idx ON contact_messages(routing_group, created_at DESC);
