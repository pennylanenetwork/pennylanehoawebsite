-- Keep reviewed reservations pending and off the calendar until Stripe confirms payment.
UPDATE events
SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
WHERE id IN (
  SELECT event_id
  FROM clubhouse_reservations
  WHERE status = 'approved' AND deposit_status = 'pending' AND event_id IS NOT NULL
);

UPDATE clubhouse_reservations
SET status = 'pending', updated_at = CURRENT_TIMESTAMP
WHERE status = 'approved' AND deposit_status = 'pending';
