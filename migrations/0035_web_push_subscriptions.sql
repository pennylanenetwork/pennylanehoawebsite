CREATE TABLE web_push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  expiration_time INTEGER,
  p256dh_key TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_success_at TEXT,
  failure_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX web_push_subscriptions_user_idx
  ON web_push_subscriptions(user_id, updated_at DESC);
