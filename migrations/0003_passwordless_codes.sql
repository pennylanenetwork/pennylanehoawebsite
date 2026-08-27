PRAGMA foreign_keys = ON;

CREATE TABLE login_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX login_codes_user_created_idx ON login_codes(user_id, created_at DESC);
CREATE INDEX login_codes_expiry_idx ON login_codes(expires_at);

CREATE TABLE auth_identities (
  provider TEXT NOT NULL CHECK (provider IN ('google')),
  subject TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  email_at_link TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (provider, subject),
  UNIQUE (provider, user_id)
);

CREATE INDEX auth_identities_user_idx ON auth_identities(user_id);
