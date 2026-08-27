ALTER TABLE contact_messages ADD COLUMN user_id TEXT REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE contact_messages ADD COLUMN property_id INTEGER REFERENCES properties(id) ON UPDATE CASCADE ON DELETE SET NULL;

UPDATE contact_messages
SET user_id = (SELECT users.id FROM users WHERE users.email = contact_messages.email COLLATE NOCASE LIMIT 1),
    property_id = (SELECT users.property_id FROM users WHERE users.email = contact_messages.email COLLATE NOCASE LIMIT 1)
WHERE EXISTS (SELECT 1 FROM users WHERE users.email = contact_messages.email COLLATE NOCASE);

CREATE INDEX contact_messages_property_idx ON contact_messages(property_id, created_at DESC);

CREATE TABLE communication_log (
  id TEXT PRIMARY KEY,
  property_id INTEGER REFERENCES properties(id) ON UPDATE CASCADE ON DELETE SET NULL,
  user_id TEXT REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  channel TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'website')),
  recipient_or_sender TEXT NOT NULL,
  subject TEXT NOT NULL,
  summary TEXT,
  delivery_status TEXT NOT NULL DEFAULT 'recorded' CHECK (delivery_status IN ('recorded', 'sent', 'failed')),
  related_type TEXT,
  related_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX communication_log_property_date_idx ON communication_log(property_id, created_at DESC);
CREATE INDEX communication_log_user_date_idx ON communication_log(user_id, created_at DESC);
