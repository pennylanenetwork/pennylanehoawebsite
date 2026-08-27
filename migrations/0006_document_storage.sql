ALTER TABLE documents ADD COLUMN storage_key TEXT;
ALTER TABLE documents ADD COLUMN original_name TEXT;
ALTER TABLE documents ADD COLUMN mime_type TEXT;
ALTER TABLE documents ADD COLUMN file_size INTEGER;

CREATE UNIQUE INDEX documents_storage_key_idx ON documents(storage_key) WHERE storage_key IS NOT NULL;
