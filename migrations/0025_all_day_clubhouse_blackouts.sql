ALTER TABLE clubhouse_blackouts ADD COLUMN all_day INTEGER NOT NULL DEFAULT 0 CHECK (all_day IN (0, 1));
