CREATE TABLE auth_identities_new (
  provider TEXT NOT NULL CHECK (provider IN ('google', 'yahoo')),
  subject TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  email_at_link TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (provider, subject),
  UNIQUE (provider, user_id)
);

INSERT INTO auth_identities_new (provider, subject, user_id, email_at_link, created_at)
SELECT provider, subject, user_id, email_at_link, created_at FROM auth_identities;

DROP TABLE auth_identities;
ALTER TABLE auth_identities_new RENAME TO auth_identities;
CREATE INDEX auth_identities_user_idx ON auth_identities(user_id);
