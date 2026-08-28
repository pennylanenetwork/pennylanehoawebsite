CREATE TABLE quick_links (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'draft')),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_quick_links_public ON quick_links(status, sort_order, created_at);

INSERT INTO quick_links (id, title, description, url, sort_order, status) VALUES
  ('quick-resident-portal', 'Resident portal', 'Member news, documents, and reservations.', '/portal', 10, 'published'),
  ('quick-review-request', 'Request a review', 'Contact the board about an exterior change.', '#contact', 20, 'published'),
  ('quick-public-documents', 'Find a document', 'Public rules and shared community files.', '#updates', 30, 'published');
