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
