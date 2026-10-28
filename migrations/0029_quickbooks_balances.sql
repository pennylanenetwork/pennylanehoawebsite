CREATE TABLE quickbooks_connections (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  realm_id TEXT NOT NULL,
  company_name TEXT,
  access_token_cipher TEXT NOT NULL,
  access_token_iv TEXT NOT NULL,
  refresh_token_cipher TEXT NOT NULL,
  refresh_token_iv TEXT NOT NULL,
  access_token_expires_at TEXT NOT NULL,
  refresh_token_expires_at TEXT,
  connected_by TEXT REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  last_synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE quickbooks_oauth_states (
  state_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE quickbooks_customers (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  balance REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE properties ADD COLUMN quickbooks_customer_id TEXT REFERENCES quickbooks_customers(id) ON UPDATE CASCADE ON DELETE SET NULL;
CREATE UNIQUE INDEX properties_quickbooks_customer_idx ON properties(quickbooks_customer_id) WHERE quickbooks_customer_id IS NOT NULL;
