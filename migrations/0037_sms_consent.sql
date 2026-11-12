ALTER TABLE users ADD COLUMN sms_consent INTEGER NOT NULL DEFAULT 0
  CHECK (sms_consent IN (0, 1));
ALTER TABLE users ADD COLUMN sms_consented_at TEXT;
ALTER TABLE users ADD COLUMN sms_opted_out_at TEXT;
ALTER TABLE users ADD COLUMN sms_consent_version TEXT;

CREATE TABLE sms_consent_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('opt_in', 'opt_out')),
  phone TEXT,
  consent_version TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('registration', 'portal_settings', 'twilio_stop')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX sms_consent_events_user_date_idx
  ON sms_consent_events(user_id, created_at DESC);
