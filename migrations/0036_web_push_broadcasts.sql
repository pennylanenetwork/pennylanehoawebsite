CREATE TABLE web_push_broadcasts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  destination TEXT NOT NULL DEFAULT '/portal',
  audience TEXT NOT NULL DEFAULT 'all'
    CHECK (audience IN ('all', 'owners', 'renters', 'board', 'acc')),
  source_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (source_type IN ('manual', 'announcement', 'event')),
  source_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sending', 'completed', 'partial', 'empty')),
  created_by TEXT REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  recipient_count INTEGER NOT NULL DEFAULT 0,
  delivered_count INTEGER NOT NULL DEFAULT 0,
  gone_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE INDEX web_push_broadcasts_created_idx
  ON web_push_broadcasts(created_at DESC);

CREATE TABLE web_push_deliveries (
  id TEXT PRIMARY KEY,
  broadcast_id TEXT NOT NULL REFERENCES web_push_broadcasts(id) ON DELETE CASCADE,
  subscription_id TEXT REFERENCES web_push_subscriptions(id) ON DELETE SET NULL,
  endpoint TEXT NOT NULL,
  expiration_time INTEGER,
  p256dh_key TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'delivered', 'gone', 'failed')),
  attempted_at TEXT
);

CREATE INDEX web_push_deliveries_pending_idx
  ON web_push_deliveries(broadcast_id, status);
