ALTER TABLE users ADD COLUMN notify_direct_messages INTEGER NOT NULL DEFAULT 1
  CHECK (notify_direct_messages IN (0, 1));
