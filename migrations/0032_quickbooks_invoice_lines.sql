ALTER TABLE quickbooks_invoices ADD COLUMN line_items_json TEXT NOT NULL DEFAULT '[]';
