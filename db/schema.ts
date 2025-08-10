import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"

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
