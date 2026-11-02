ALTER TABLE quickbooks_invoices ADD COLUMN status TEXT NOT NULL DEFAULT 'open'
  CHECK (status IN ('open', 'paid'));

CREATE INDEX quickbooks_invoices_customer_status_idx
  ON quickbooks_invoices(customer_id, status, transaction_date);
