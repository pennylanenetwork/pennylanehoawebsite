ALTER TABLE quickbooks_connections ADD COLUMN last_sync_attempt_at TEXT;
ALTER TABLE quickbooks_connections ADD COLUMN last_sync_status TEXT NOT NULL DEFAULT 'never'
  CHECK (last_sync_status IN ('never', 'success', 'failed'));
ALTER TABLE quickbooks_connections ADD COLUMN last_sync_error TEXT;

UPDATE quickbooks_connections
SET last_sync_status = CASE WHEN last_synced_at IS NULL THEN 'never' ELSE 'success' END,
    last_sync_attempt_at = last_synced_at;
