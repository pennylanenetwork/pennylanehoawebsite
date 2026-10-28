CREATE TABLE quickbooks_invoices (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES quickbooks_customers(id) ON UPDATE CASCADE ON DELETE CASCADE,
  document_number TEXT,
  transaction_date TEXT NOT NULL,
  due_date TEXT,
  total_amount REAL NOT NULL DEFAULT 0,
  balance REAL NOT NULL DEFAULT 0,
  invoice_link TEXT,
  allow_online_ach INTEGER NOT NULL DEFAULT 0 CHECK (allow_online_ach IN (0, 1)),
  allow_online_card INTEGER NOT NULL DEFAULT 0 CHECK (allow_online_card IN (0, 1)),
  sync_run_id TEXT NOT NULL,
  synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX quickbooks_invoices_customer_idx ON quickbooks_invoices(customer_id, due_date);
CREATE INDEX quickbooks_invoices_sync_idx ON quickbooks_invoices(sync_run_id);
