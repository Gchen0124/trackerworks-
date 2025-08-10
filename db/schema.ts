import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core"
import { sql } from "drizzle-orm"

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
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(sql`(strftime('%s','now')*1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(sql`(strftime('%s','now')*1000)`),
})

// Minute-slice blocks for a day. One row per minute in the day when populated.
export const blocks = sqliteTable(
  "blocks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(), // YYYY-MM-DD
    minuteIndex: integer("minute_index").notNull(), // 0..1439
    taskName: text("task_name"),
    isPinned: integer("is_pinned", { mode: "boolean" }).default(false).notNull(),
    status: text("status"), // planned | done | interrupted | missed | pushed
    labelOverride: text("label_override"), // for "I did blabla instead"
    movedFromMinute: integer("moved_from_minute"), // lineage when postponed
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(sql`(strftime('%s','now')*1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(sql`(strftime('%s','now')*1000)`),
  },
  (t) => ({
    dateMinuteIdx: uniqueIndex("blocks_date_minute_idx").on(t.date, t.minuteIndex),
    dateIdx: index("blocks_date_idx").on(t.date),
    statusIdx: index("blocks_status_idx").on(t.date, t.status),
  })
)

export const blockHistory = sqliteTable("block_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  minuteIndex: integer("minute_index").notNull(),
  action: text("action").notNull(), // assign | complete | postpone | pin | unpin | rename | timeout
  payload: text("payload"), // JSON string
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(sql`(strftime('%s','now')*1000)`),
})
