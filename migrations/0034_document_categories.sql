CREATE TABLE document_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 100,
  is_standard INTEGER NOT NULL DEFAULT 0 CHECK (is_standard IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO document_categories (id, name, sort_order, is_standard) VALUES
  ('governing-documents', 'Governing Documents', 10, 1),
  ('hoa-meeting-agendas', 'HOA Meeting Agendas', 20, 1),
  ('hoa-meeting-minutes', 'HOA Meeting Minutes', 30, 1),
  ('special-notices', 'Special Notices', 40, 1),
  ('general', 'General', 100, 1);

INSERT OR IGNORE INTO document_categories (id, name, sort_order, is_standard)
SELECT 'legacy-' || lower(hex(randomblob(16))), trim(category), 90, 0
FROM documents
WHERE trim(category) <> '';

CREATE INDEX document_categories_order_idx ON document_categories(sort_order, name);
