CREATE TABLE contact_messages (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  category TEXT NOT NULL CHECK (category IN ('general', 'maintenance', 'architectural', 'board')),
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'closed')),
  admin_notes TEXT,
  submitted_ip_hash TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX contact_messages_status_date_idx ON contact_messages(status, created_at DESC);
CREATE INDEX contact_messages_email_date_idx ON contact_messages(email, created_at DESC);
