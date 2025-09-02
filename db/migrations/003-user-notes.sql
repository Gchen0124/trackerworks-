-- Create user_notes table for daily notes functionality
CREATE TABLE IF NOT EXISTS user_notes (
  id TEXT PRIMARY KEY DEFAULT 'daily_notes',
  date TEXT NOT NULL,
  content TEXT DEFAULT '',
  created_at INTEGER DEFAULT (strftime('%s','now')*1000),
  updated_at INTEGER DEFAULT (strftime('%s','now')*1000)
);

-- Create unique index on date to ensure one note per day
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_notes_date ON user_notes(date);