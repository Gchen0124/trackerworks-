import { Client } from "@notionhq/client"

// Centralized Notion client + helpers
// Configure via .env.local
// - NOTION_TOKEN
// - NOTION_DAILY_RITUAL_DB_ID
// - NOTION_TASK_CAL_DB_ID
// Optional overrides for property names (defaults assumed below):
// - NOTION_DR_DATE_PROP (default: "Date")
// - NOTION_DR_WEEKLY_GOAL_PROP (default: "Weekly Goal")
// - NOTION_DR_GOAL1_PROP (default: "Goal 1")
// - NOTION_DR_GOAL2_PROP (default: "Goal 2")
// - NOTION_DR_GOAL3_PROP (default: "Goal 3")

export const notion = new Client({ auth: process.env.NOTION_TOKEN })

export const NOTION_DAILY_RITUAL_DB_ID = process.env.NOTION_DAILY_RITUAL_DB_ID || ""
export const NOTION_TASK_CAL_DB_ID = process.env.NOTION_TASK_CAL_DB_ID || ""
export const NOTION_TASK_TITLE_PROP = process.env.NOTION_TASK_TITLE_PROP || "Name"

export const DR_PROPS = {
  DATE: process.env.NOTION_DR_DATE_PROP || "Date",
  WEEKLY_GOAL: process.env.NOTION_DR_WEEKLY_GOAL_PROP || "Weekly Goal",
  GOAL1: process.env.NOTION_DR_GOAL1_PROP || "Goal 1",
  GOAL2: process.env.NOTION_DR_GOAL2_PROP || "Goal 2",
  GOAL3: process.env.NOTION_DR_GOAL3_PROP || "Goal 3",
}

export function formatDateYYYYMMDD(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}
