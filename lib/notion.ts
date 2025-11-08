import { Client } from "@notionhq/client"
import { sqlite } from "@/lib/db"

// Centralized Notion client + helpers
// Now supports both env variables (for backwards compatibility) and database credentials
// Priority: Database credentials > Environment variables

// Get credentials from database or fallback to env variables
export function getNotionCredentials() {
  try {
    const row = sqlite.prepare(`SELECT notion_token, notion_daily_ritual_db_id, notion_task_cal_db_id FROM user_settings WHERE id = 1`).get() as any
    return {
      token: row?.notion_token || process.env.NOTION_TOKEN || "",
      dailyRitualDbId: row?.notion_daily_ritual_db_id || process.env.NOTION_DAILY_RITUAL_DB_ID || "",
      taskCalDbId: row?.notion_task_cal_db_id || process.env.NOTION_TASK_CAL_DB_ID || "",
    }
  } catch (error) {
    // Fallback to env variables if database read fails
    return {
      token: process.env.NOTION_TOKEN || "",
      dailyRitualDbId: process.env.NOTION_DAILY_RITUAL_DB_ID || "",
      taskCalDbId: process.env.NOTION_TASK_CAL_DB_ID || "",
    }
  }
}

// Create Notion client with credentials
export function getNotionClient() {
  const { token } = getNotionCredentials()
  return new Client({ auth: token })
}

// Legacy exports for backwards compatibility
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
