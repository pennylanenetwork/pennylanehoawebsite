PRAGMA foreign_keys = ON;

CREATE TABLE pool_rules_agreements (
  id TEXT PRIMARY KEY,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  rules_version TEXT NOT NULL,
  acknowledgement_text TEXT NOT NULL,
  acknowledged_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX pool_rules_agreements_user_version_idx ON pool_rules_agreements(user_id, rules_version);
CREATE INDEX pool_rules_agreements_property_date_idx ON pool_rules_agreements(property_id, acknowledged_at DESC);
