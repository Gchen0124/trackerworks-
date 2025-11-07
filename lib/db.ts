import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import path from "path"
import fs from "fs"

const defaultPath = process.env.LOCAL_SQLITE_PATH || path.resolve(process.cwd(), "data/app.db")

// Ensure data directory exists
const dir = path.dirname(defaultPath)
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true })
}

export const sqlite = new Database(defaultPath)
export const db = drizzle(sqlite)

// Best-effort bootstrap: create goals table if it doesn't exist (for local dev)
sqlite.exec(`
CREATE TABLE IF NOT EXISTS goals (
  date TEXT PRIMARY KEY,
  weekly_goal TEXT,
  goal1 TEXT,
  goal2 TEXT,
  goal3 TEXT,
  exciting_goal TEXT,
  eoy_goal TEXT,
  monthly_goal TEXT,
  source TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now')*1000),
  updated_at INTEGER DEFAULT (strftime('%s','now')*1000)
);
`)

// Breakdown items: unified list for tasks and microsteps at different layers
// scope_type: 'goal' | 'task' | 'microstep'
// parent_id links a child to its parent breakdown item (nullable for top-level under a goal)
sqlite.exec(`
CREATE TABLE IF NOT EXISTS breakdown_items (
  id TEXT PRIMARY KEY,
  parent_id TEXT NULL,
  scope_type TEXT NOT NULL,
  goal_id TEXT NULL,
  title TEXT NOT NULL,
  estimate_min INTEGER NULL,
  order_index INTEGER DEFAULT 0,
  date TEXT NULL,
  source_block_minute_index INTEGER NULL,
  created_at INTEGER DEFAULT (strftime('%s','now')*1000),
  updated_at INTEGER DEFAULT (strftime('%s','now')*1000)
);
CREATE INDEX IF NOT EXISTS idx_breakdown_parent ON breakdown_items(parent_id);
CREATE INDEX IF NOT EXISTS idx_breakdown_goal ON breakdown_items(goal_id);
`)

// Settings for local preferences (block duration, alerts, tz, notion)
sqlite.exec(`
CREATE TABLE IF NOT EXISTS user_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  block_duration_minutes INTEGER NOT NULL DEFAULT 30,
  enable_half_hour_alerts INTEGER NOT NULL DEFAULT 30, -- stores cadence in minutes (0=off)
  time_zone TEXT NOT NULL DEFAULT 'UTC',
  notion_token TEXT,
  notion_daily_ritual_db_id TEXT,
  notion_task_cal_db_id TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now')*1000),
  updated_at INTEGER DEFAULT (strftime('%s','now')*1000)
);
INSERT OR IGNORE INTO user_settings (id) VALUES (1);
`)

// Time blocks for different granularities (1,3,30 minutes)
sqlite.exec(`
CREATE TABLE IF NOT EXISTS time_blocks (
  id TEXT PRIMARY KEY, -- e.g., '2025-08-22|30|480' (date|duration|minIndex)
  date TEXT NOT NULL,
  duration_min INTEGER NOT NULL,
  start_minute_index INTEGER NOT NULL, -- minutes since 00:00
  end_minute_index INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'future', -- 'future'|'current'|'past'|'completed'|'disrupted'|'paused'
  is_pinned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s','now')*1000),
  updated_at INTEGER DEFAULT (strftime('%s','now')*1000)
);
CREATE INDEX IF NOT EXISTS idx_blocks_date_dur ON time_blocks(date, duration_min);
`)

// Assignment of breakdown items (tasks/microsteps) to blocks; supports planned vs actual
sqlite.exec(`
CREATE TABLE IF NOT EXISTS block_assignments (
  id TEXT PRIMARY KEY,
  block_id TEXT NOT NULL REFERENCES time_blocks(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES breakdown_items(id) ON DELETE CASCADE,
  item_scope_type TEXT NOT NULL, -- 'task'|'microstep'
  assignment_type TEXT NOT NULL DEFAULT 'planned', -- 'planned'|'actual'
  assigned_at INTEGER DEFAULT (strftime('%s','now')*1000)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_block_assignment ON block_assignments(block_id, assignment_type);
`)

// Optional goal tag on a block (goal1/2/3 for the day)
sqlite.exec(`
CREATE TABLE IF NOT EXISTS block_goals (
  id TEXT PRIMARY KEY,
  block_id TEXT NOT NULL REFERENCES time_blocks(id) ON DELETE CASCADE,
  goal_slot TEXT NOT NULL, -- 'goal_1'|'goal_2'|'goal_3'
  goal_label TEXT NOT NULL,
  goal_color TEXT NULL,
  assigned_at INTEGER DEFAULT (strftime('%s','now')*1000)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_block_goal ON block_goals(block_id);
`)

// Progress and reschedule logs for analytics
sqlite.exec(`
CREATE TABLE IF NOT EXISTS progress_events (
  id TEXT PRIMARY KEY,
  block_id TEXT NOT NULL REFERENCES time_blocks(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'completed'|'disrupted'|'paused'|'no_response'
  at INTEGER DEFAULT (strftime('%s','now')*1000),
  meta TEXT
);
CREATE INDEX IF NOT EXISTS idx_progress_block ON progress_events(block_id);
`)

sqlite.exec(`
CREATE TABLE IF NOT EXISTS reschedule_logs (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES breakdown_items(id) ON DELETE CASCADE,
  from_block_id TEXT NULL,
  to_block_id TEXT NULL,
  reason TEXT NULL,
  auto INTEGER NOT NULL DEFAULT 0, -- 1 if system-initiated
  created_at INTEGER DEFAULT (strftime('%s','now')*1000)
);
`)

// Goal graph for hierarchical planning across horizons
sqlite.exec(`
CREATE TABLE IF NOT EXISTS goal_nodes (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL, -- 'daily'|'weekly'|'monthly'|'quarterly'|'yearly'|'exciting'
  title TEXT NOT NULL,
  date TEXT NULL, -- for daily or anchored goals
  start_date TEXT NULL, -- for ranged goals
  end_date TEXT NULL,
  created_at INTEGER DEFAULT (strftime('%s','now')*1000),
  updated_at INTEGER DEFAULT (strftime('%s','now')*1000)
);
CREATE TABLE IF NOT EXISTS goal_edges (
  id TEXT PRIMARY KEY,
  parent_id TEXT NOT NULL REFERENCES goal_nodes(id) ON DELETE CASCADE,
  child_id TEXT NOT NULL REFERENCES goal_nodes(id) ON DELETE CASCADE,
  relation TEXT NOT NULL DEFAULT 'parent'
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_goal_edge ON goal_edges(parent_id, child_id);
`)

// Mapping between daily goal slots and goal_nodes (optional, to unify with existing daily panel)
sqlite.exec(`
CREATE TABLE IF NOT EXISTS daily_goal_links (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  slot TEXT NOT NULL, -- 'goal1'|'goal2'|'goal3'|'weekly'|'monthly'|'quarterly'|'yearly'|'exciting'
  goal_node_id TEXT NOT NULL REFERENCES goal_nodes(id) ON DELETE CASCADE,
  created_at INTEGER DEFAULT (strftime('%s','now')*1000)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_goal_link ON daily_goal_links(date, slot);
`)


// Daily active window (for dark/inactive hours analytics)
sqlite.exec(`
CREATE TABLE IF NOT EXISTS daily_active_windows (
  date TEXT PRIMARY KEY,
  active_start_minute INTEGER NOT NULL,
  active_end_minute INTEGER NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s','now')*1000),
  updated_at INTEGER DEFAULT (strftime('%s','now')*1000)
);
`)


// Daily time analytics derived from active window
sqlite.exec(`
CREATE TABLE IF NOT EXISTS daily_time_analytics (
  date TEXT PRIMARY KEY,
  active_minutes INTEGER NOT NULL,
  inactive_minutes INTEGER NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s','now')*1000),
  updated_at INTEGER DEFAULT (strftime('%s','now')*1000)
);
`)
