CREATE TABLE contact_message_replies (
  id TEXT PRIMARY KEY,
  contact_message_id TEXT NOT NULL REFERENCES contact_messages(id) ON UPDATE CASCADE ON DELETE CASCADE,
  author_user_id TEXT REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  author_role TEXT NOT NULL CHECK (author_role IN ('resident', 'admin')),
  body TEXT NOT NULL,
  email_status TEXT NOT NULL DEFAULT 'recorded' CHECK (email_status IN ('recorded', 'sent', 'failed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX contact_message_replies_thread_date_idx
  ON contact_message_replies(contact_message_id, created_at);
