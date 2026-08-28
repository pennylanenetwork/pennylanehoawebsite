ALTER TABLE contact_messages ADD COLUMN sender_role TEXT NOT NULL DEFAULT 'resident' CHECK (sender_role IN ('resident', 'admin'));

INSERT INTO contact_messages (id, name, email, category, message, user_id, property_id, routing_group, sender_role, status)
SELECT lower(hex(randomblob(16))), 'Penny Lane HOA', users.email, 'general',
  'Your $96.80 refundable clubhouse deposit was not approved for refund.' || char(10) || char(10) ||
  'Event: ' || clubhouse_reservations.event_name || char(10) ||
  'Reason: ' || COALESCE(clubhouse_reservations.deposit_decision_reason, 'Contact the HOA for details.') || char(10) || char(10) ||
  'The $3.20 Stripe processing fee is also non-refundable per the deposit agreement.',
  users.id, users.property_id, 'amenities', 'admin', 'read'
FROM clubhouse_reservations INNER JOIN users ON users.id = clubhouse_reservations.user_id
WHERE clubhouse_reservations.deposit_status = 'forfeited';
