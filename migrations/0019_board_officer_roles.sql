ALTER TABLE users ADD COLUMN is_president INTEGER NOT NULL DEFAULT 0 CHECK (is_president IN (0, 1));
ALTER TABLE users ADD COLUMN is_vice_president INTEGER NOT NULL DEFAULT 0 CHECK (is_vice_president IN (0, 1));
ALTER TABLE users ADD COLUMN is_secretary INTEGER NOT NULL DEFAULT 0 CHECK (is_secretary IN (0, 1));

UPDATE users SET is_board_member = 1 WHERE is_treasurer = 1;
