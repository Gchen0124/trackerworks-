import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core"

// Enhanced Goals with completion tracking
export const goals = sqliteTable("goals", {
  date: text("date").primaryKey(),
  weeklyGoal: text("weekly_goal"),
  goal1: text("goal1"),
  goal2: text("goal2"),
  goal3: text("goal3"),
  excitingGoal: text("exciting_goal"),
  eoyGoal: text("eoy_goal"),
  monthlyGoal: text("monthly_goal"),
  source: text("source"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(() => Date.now()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(() => Date.now()),
})

// Task completion states (replaces localStorage)
export const taskCompletions = sqliteTable("task_completions", {
  id: text("id").primaryKey(),
  itemId: text("item_id").notNull(), // breakdown_items.id or goal reference
  isCompleted: integer("is_completed", { mode: "boolean" }).default(false),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  sessionId: text("session_id"), // For daily reset logic
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(() => Date.now()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(() => Date.now()),
})

// Enhanced time blocks with all frontend state
export const timeBlocks = sqliteTable("time_blocks", {
  id: text("id").primaryKey(), // format: date|duration|startMin
  date: text("date").notNull(),
  durationMin: integer("duration_min").notNull(),
  startMinuteIndex: integer("start_minute_index").notNull(),
  endMinuteIndex: integer("end_minute_index").notNull(),
  status: text("status").default("future"), // future|current|past|completed|disrupted|paused
  isPinned: integer("is_pinned", { mode: "boolean" }).default(false),
  isActive: integer("is_active", { mode: "boolean" }).default(false),
  isCompleted: integer("is_completed", { mode: "boolean" }).default(false),
  isRecentlyMoved: integer("is_recently_moved", { mode: "boolean" }).default(false),
  // Task assignment
  taskId: text("task_id"),
  taskTitle: text("task_title"),
  taskType: text("task_type"), // calendar|notion|custom
  taskColor: text("task_color"),
  // Goal assignment (separate from task)
  goalId: text("goal_id"),
  goalLabel: text("goal_label"),
  goalColor: text("goal_color"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(() => Date.now()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(() => Date.now()),
})

// Progress check popup responses
export const progressResponses = sqliteTable("progress_responses", {
  id: text("id").primaryKey(),
  blockId: text("block_id").notNull(),
  responseType: text("response_type").notNull(), // done|still_doing|stick_to_plan|timeout
  responseTimeMs: integer("response_time_ms"), // How long user took to respond
  overrideTitle: text("override_title"), // For "still doing" with custom title
  voiceTranscript: text("voice_transcript"), // What user said (if voice used)
  cascadingEffects: text("cascading_effects", { mode: "json" }), // JSON: affected block IDs
  respondedAt: integer("responded_at", { mode: "timestamp_ms" }).default(() => Date.now()),
})

// Drag and drop operation history
export const dragOperations = sqliteTable("drag_operations", {
  id: text("id").primaryKey(),
  operationType: text("operation_type").notNull(), // simple_move|expand_fill|bulk_move
  sourceBlockId: text("source_block_id"),
  targetBlockIds: text("target_block_ids", { mode: "json" }), // JSON array
  taskData: text("task_data", { mode: "json" }), // The task that was moved
  affectedBlocks: text("affected_blocks", { mode: "json" }), // Postponed/rescheduled blocks
  wasExpandMode: integer("was_expand_mode", { mode: "boolean" }).default(false),
  pinnedBlocksEncountered: text("pinned_blocks_encountered", { mode: "json" }),
  executedAt: integer("executed_at", { mode: "timestamp_ms" }).default(() => Date.now()),
})

// Planning mode selections (multi-block drag preview)
export const planningSelections = sqliteTable("planning_selections", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(), // Browser session
  startBlockId: text("start_block_id"),
  endBlockId: text("end_block_id"),
  selectedBlockIds: text("selected_block_ids", { mode: "json" }), // JSON array
  taskToFill: text("task_to_fill", { mode: "json" }), // Task being dragged
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(() => Date.now()),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
})

// Multi-select state persistence
export const multiSelectSessions = sqliteTable("multi_select_sessions", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  selectedBlockIds: text("selected_block_ids", { mode: "json" }),
  lastAnchorId: text("last_anchor_id"),
  bulkMoveActive: integer("bulk_move_active", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(() => Date.now()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(() => Date.now()),
})

// Timer and current task state
export const timerSessions = sqliteTable("timer_sessions", {
  id: text("id").primaryKey(),
  currentBlockId: text("current_block_id"),
  isRunning: integer("is_running", { mode: "boolean" }).default(false),
  startedAt: integer("started_at", { mode: "timestamp_ms" }),
  elapsedSeconds: integer("elapsed_seconds").default(0),
  currentTask: text("current_task", { mode: "json" }), // JSON task object
  autoStartEnabled: integer("auto_start_enabled", { mode: "boolean" }).default(true),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(() => Date.now()),
})

// Block duration and display preferences
export const userPreferences = sqliteTable("user_preferences", {
  id: text("id").primaryKey().default("default"),
  blockDurationMinutes: integer("block_duration_minutes").default(30),
  enableHalfHourAlerts: integer("enable_half_hour_alerts", { mode: "boolean" }).default(false),
  showNestedTodos: integer("show_nested_todos", { mode: "boolean" }).default(true),
  gradientIndex: integer("gradient_index").default(0),
  lastActiveWindowStart: integer("last_active_window_start"),
  lastActiveWindowEnd: integer("last_active_window_end"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(() => Date.now()),
})

// Snapshot preservation for mode switching
export const blockSnapshots = sqliteTable("block_snapshots", {
  id: text("id").primaryKey(),
  date: text("date").notNull(),
  durationMin: integer("duration_min").notNull(), // 1, 3, or 30
  snapshotData: text("snapshot_data", { mode: "json" }), // Full time blocks array
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(() => Date.now()),
})
