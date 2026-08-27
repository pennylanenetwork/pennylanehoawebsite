ALTER TABLE users ADD COLUMN is_board_member INTEGER NOT NULL DEFAULT 0 CHECK (is_board_member IN (0, 1));
ALTER TABLE users ADD COLUMN is_acc_member INTEGER NOT NULL DEFAULT 0 CHECK (is_acc_member IN (0, 1));

CREATE INDEX users_committee_memberships_idx
  ON users(status, is_board_member, is_acc_member);
