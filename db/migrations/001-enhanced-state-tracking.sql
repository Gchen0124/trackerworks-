-- Enhanced Database Schema for Frontend State Synchronization
-- This migration adds new tables WITHOUT modifying existing functionality

-- Task completion tracking (replaces localStorage checkboxes)
CREATE TABLE IF NOT EXISTS task_completions (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL, -- references breakdown_items.id or goal reference
  is_completed INTEGER DEFAULT 0,
  completed_at INTEGER NULL,
  session_id TEXT NULL, -- for daily reset logic
  created_at INTEGER DEFAULT (strftime('%s','now')*1000),
  updated_at INTEGER DEFAULT (strftime('%s','now')*1000)
);
CREATE INDEX IF NOT EXISTS idx_task_completions_item ON task_completions(item_id);
CREATE INDEX IF NOT EXISTS idx_task_completions_session ON task_completions(session_id);

-- Enhanced time blocks (extends existing time_blocks with frontend state)
CREATE TABLE IF NOT EXISTS time_blocks_state (
  block_id TEXT PRIMARY KEY, -- references time_blocks.id
  is_active INTEGER DEFAULT 0,
  is_completed INTEGER DEFAULT 0,
  is_recently_moved INTEGER DEFAULT 0,
  -- Task assignment (structured)
  task_id TEXT NULL,
  task_title TEXT NULL,
  task_type TEXT NULL, -- calendar|notion|custom
  task_color TEXT NULL,
  -- Goal assignment (separate from task)
  goal_id TEXT NULL,
  goal_label TEXT NULL,
  goal_color TEXT NULL,
  updated_at INTEGER DEFAULT (strftime('%s','now')*1000)
);
CREATE INDEX IF NOT EXISTS idx_blocks_state_active ON time_blocks_state(is_active);
CREATE INDEX IF NOT EXISTS idx_blocks_state_recently_moved ON time_blocks_state(is_recently_moved);

-- Progress check popup responses (15-second timeout interactions)
CREATE TABLE IF NOT EXISTS progress_responses (
  id TEXT PRIMARY KEY,
  block_id TEXT NOT NULL,
  response_type TEXT NOT NULL, -- done|still_doing|stick_to_plan|timeout
  response_time_ms INTEGER NULL, -- how long user took to respond
  override_title TEXT NULL, -- for "still doing" with custom title
  voice_transcript TEXT NULL, -- what user said (if voice used)
  cascading_effects TEXT NULL, -- JSON: affected block IDs
  responded_at INTEGER DEFAULT (strftime('%s','now')*1000)
);
CREATE INDEX IF NOT EXISTS idx_progress_responses_block ON progress_responses(block_id);
CREATE INDEX IF NOT EXISTS idx_progress_responses_type ON progress_responses(response_type);

-- Drag and drop operation audit trail
CREATE TABLE IF NOT EXISTS drag_operations (
  id TEXT PRIMARY KEY,
  operation_type TEXT NOT NULL, -- simple_move|expand_fill|bulk_move
  source_block_id TEXT NULL,
  target_block_ids TEXT NULL, -- JSON array
  task_data TEXT NULL, -- JSON: the task that was moved
  affected_blocks TEXT NULL, -- JSON: postponed/rescheduled blocks
  was_expand_mode INTEGER DEFAULT 0,
  pinned_blocks_encountered TEXT NULL, -- JSON: blocks that resisted movement
  executed_at INTEGER DEFAULT (strftime('%s','now')*1000)
);
CREATE INDEX IF NOT EXISTS idx_drag_operations_type ON drag_operations(operation_type);
CREATE INDEX IF NOT EXISTS idx_drag_operations_executed ON drag_operations(executed_at);

-- Multi-select and planning mode state
CREATE TABLE IF NOT EXISTS selection_state (
  id TEXT PRIMARY KEY DEFAULT 'current',
  session_id TEXT NOT NULL,
  selected_block_ids TEXT NULL, -- JSON array
  last_anchor_id TEXT NULL,
  planning_active INTEGER DEFAULT 0,
  planning_start_block_id TEXT NULL,
  planning_end_block_id TEXT NULL,
  planning_task_data TEXT NULL, -- JSON: task being planned
  updated_at INTEGER DEFAULT (strftime('%s','now')*1000)
);

-- Timer state persistence
CREATE TABLE IF NOT EXISTS timer_state (
  id TEXT PRIMARY KEY DEFAULT 'current',
  current_block_id TEXT NULL,
  is_running INTEGER DEFAULT 0,
  started_at INTEGER NULL,
  elapsed_seconds INTEGER DEFAULT 0,
  current_task TEXT NULL, -- JSON task object
  updated_at INTEGER DEFAULT (strftime('%s','now')*1000)
);

-- UI preferences and settings
CREATE TABLE IF NOT EXISTS ui_preferences (
  id TEXT PRIMARY KEY DEFAULT 'current',
  block_duration_minutes INTEGER DEFAULT 30,
  enable_half_hour_alerts INTEGER DEFAULT 0,
  show_nested_todos INTEGER DEFAULT 1,
  gradient_index INTEGER DEFAULT 0,
  updated_at INTEGER DEFAULT (strftime('%s','now')*1000)
);
INSERT OR IGNORE INTO ui_preferences (id) VALUES ('current');

-- Block snapshots for mode switching (1min/3min/30min preservation)
CREATE TABLE IF NOT EXISTS block_snapshots (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  duration_min INTEGER NOT NULL, -- 1, 3, or 30
  snapshot_data TEXT NOT NULL, -- JSON: full timeBlocks array
  created_at INTEGER DEFAULT (strftime('%s','now')*1000)
);
CREATE INDEX IF NOT EXISTS idx_snapshots_date_duration ON block_snapshots(date, duration_min);