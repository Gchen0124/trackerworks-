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
