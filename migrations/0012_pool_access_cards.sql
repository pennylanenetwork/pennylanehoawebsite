CREATE TABLE pool_access_cards (
  id TEXT PRIMARY KEY,
  card_number TEXT NOT NULL COLLATE NOCASE UNIQUE,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  assigned_user_id TEXT REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'lost', 'stolen', 'returned', 'deactivated')),
  notes TEXT,
  issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE INDEX pool_access_cards_property_idx ON pool_access_cards(property_id, status, issued_at DESC);
CREATE INDEX pool_access_cards_user_idx ON pool_access_cards(assigned_user_id, status);
