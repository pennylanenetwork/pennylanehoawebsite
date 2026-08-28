ALTER TABLE clubhouse_reservations ADD COLUMN stripe_checkout_session_id TEXT;
ALTER TABLE clubhouse_reservations ADD COLUMN stripe_payment_intent_id TEXT;
ALTER TABLE clubhouse_reservations ADD COLUMN deposit_collected_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE clubhouse_reservations ADD COLUMN deposit_processing_fee_cents INTEGER NOT NULL DEFAULT 320;
ALTER TABLE clubhouse_reservations ADD COLUMN deposit_refundable_cents INTEGER NOT NULL DEFAULT 9680;
ALTER TABLE clubhouse_reservations ADD COLUMN deposit_refunded_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE clubhouse_reservations ADD COLUMN deposit_decision_reason TEXT;
ALTER TABLE clubhouse_reservations ADD COLUMN deposit_decided_by TEXT REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE clubhouse_reservations ADD COLUMN deposit_paid_at TEXT;
ALTER TABLE clubhouse_reservations ADD COLUMN deposit_decided_at TEXT;

CREATE UNIQUE INDEX reservations_stripe_session_idx ON clubhouse_reservations(stripe_checkout_session_id);
CREATE UNIQUE INDEX reservations_stripe_payment_idx ON clubhouse_reservations(stripe_payment_intent_id);
