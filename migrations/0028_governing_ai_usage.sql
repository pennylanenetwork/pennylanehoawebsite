CREATE TABLE governing_ai_usage (
  usage_date TEXT NOT NULL,
  user_id TEXT NOT NULL,
  question_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (usage_date, user_id)
);
