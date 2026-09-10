CREATE TABLE governing_documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  document_type TEXT NOT NULL DEFAULT 'Covenants',
  summary TEXT,
  audience TEXT NOT NULL DEFAULT 'public' CHECK (audience IN ('public', 'members')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  effective_date TEXT,
  recording_info TEXT,
  source_document_id TEXT REFERENCES documents(id) ON UPDATE CASCADE ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX governing_documents_listing_idx ON governing_documents(status, audience, sort_order, title);

CREATE TABLE governing_sections (
  id TEXT PRIMARY KEY,
  governing_document_id TEXT NOT NULL REFERENCES governing_documents(id) ON UPDATE CASCADE ON DELETE CASCADE,
  section_label TEXT,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  body TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(governing_document_id, slug)
);

CREATE INDEX governing_sections_order_idx ON governing_sections(governing_document_id, sort_order, title);

INSERT INTO quick_links (id, title, description, url, sort_order, status)
VALUES ('quick-governing-documents', 'Governing documents', 'Search and navigate HOA bylaws, covenants, rules, and amendments.', '/governing-documents', 25, 'published');
