import { NextRequest } from "next/server"
import { getNotionClient, getNotionCredentials, DR_PROPS, formatDateYYYYMMDD } from "@/lib/notion"

// Property names for Goal 1, 2, 3 in Daily Ritual database
// These are relational properties that link to Task Calendar
// Use DR_PROPS from lib/notion.ts which supports env var overrides
const GOAL_RELATION_PROPS = {
  GOAL1: DR_PROPS.GOAL1,  // Default: "Goal 1", can be "✅Goal 1" via env
  GOAL2: DR_PROPS.GOAL2,  // Default: "Goal 2", can be "✅Goal 2" via env
  GOAL3: DR_PROPS.GOAL3,  // Default: "Goal 3", can be "✅Goal 3" via env
}

// Helper to extract plain text from a rich_text or title property
function richTextToPlain(property: any): string {
  const arr = property?.rich_text || property?.title
  if (!Array.isArray(arr)) return ""
  return arr.map((t: any) => t.plain_text).join("")
}

// Handle rich_text/title/rollup to strings
function propToPlainStrings(prop: any): string[] {
  if (!prop) return []
  if (prop.type === "rich_text" || prop.type === "title") {
    const arr = prop[prop.type] || []
    return Array.isArray(arr) ? arr.map((t: any) => t.plain_text || "").filter(Boolean) : []
  }
  if (prop.type === "rollup") {
    const r = prop.rollup
    if (r?.type === "array" && Array.isArray(r.array)) {
      const out: string[] = []
      for (const item of r.array) {
        if (item?.type === "rich_text" || item?.type === "title") {
          const a = item[item.type] || []
          if (Array.isArray(a)) out.push(...a.map((t: any) => t.plain_text || "").filter(Boolean))
        }
      }
      return out
    }
  }
  return []
}

async function getTaskTitle(notionClient: any, pageId: string): Promise<string> {
  try {
    const page: any = await notionClient.pages.retrieve({ page_id: pageId })
    const props = page.properties
    // Commonly the title is in the Name property (title type)
    for (const key of Object.keys(props)) {
      if (props[key].type === "title") {
        return richTextToPlain(props[key])
      }
    }
  } catch (e) {
    console.error("Failed to fetch task title for", pageId, e)
  }
  return ""
}

// Get the property type for the configured date property (date/title/rich_text)
async function getDatePropType(notionClient: any, dailyRitualDbId: string): Promise<"date" | "title" | "rich_text" | "unknown"> {
  try {
    // Use dataSources API for new Notion client v5+
    const db: any = await notionClient.dataSources.retrieve({ data_source_id: dailyRitualDbId })
    const prop = db?.properties?.[DR_PROPS.DATE]
    return (prop?.type as any) || "unknown"
  } catch {
    return "unknown"
  }
}

// Query the Daily Ritual DB by date string, adapting to property type
async function findDailyRitualByDate(notionClient: any, dailyRitualDbId: string, dateStr: string) {
  const propType = await getDatePropType(notionClient, dailyRitualDbId)
  let filter: any
  if (propType === "date") {
    filter = { property: DR_PROPS.DATE, date: { equals: dateStr } }
  } else if (propType === "title") {
    filter = { property: DR_PROPS.DATE, title: { equals: dateStr } }
  } else if (propType === "rich_text") {
    filter = { property: DR_PROPS.DATE, rich_text: { equals: dateStr } }
  } else {
    // Fallback: try date equals (most common for Daily Ritual)
    filter = { property: DR_PROPS.DATE, date: { equals: dateStr } }
  }
  // Use dataSources.query for new Notion client v5+
  const response = await notionClient.dataSources.query({
    data_source_id: dailyRitualDbId,
    filter,
    page_size: 1,
  })
  return response.results[0] as any | undefined
}

async function createDailyRitual(notionClient: any, dailyRitualDbId: string, dateStr: string) {
  // Create a minimal page with date set. Weekly/Goals left empty.
  const properties: any = {}
  const propType = await getDatePropType(notionClient, dailyRitualDbId)
  if (propType === "date") {
    properties[DR_PROPS.DATE] = { date: { start: dateStr } }
  } else if (propType === "title") {
    properties[DR_PROPS.DATE] = { title: [{ type: "text", text: { content: dateStr } }] }
  } else if (propType === "rich_text") {
    properties[DR_PROPS.DATE] = { rich_text: [{ type: "text", text: { content: dateStr } }] }
  } else {
    // Fallback to date (most common for Daily Ritual)
    properties[DR_PROPS.DATE] = { date: { start: dateStr } }
  }
  try {
    // Use data_source_id for new Notion client v5+
    const page = await notionClient.pages.create({
      parent: { type: 'data_source_id', data_source_id: dailyRitualDbId },
      properties,
    })
    return page as any
  } catch (e) {
    console.error("Failed to create Daily Ritual page", e)
    throw e
  }
}

function extractRelationIds(prop: any): string[] {
  if (!prop || prop.type !== "relation" || !Array.isArray(prop.relation)) return []
  return prop.relation.map((r: any) => r.id)
}

export async function GET(req: NextRequest) {
  const credentials = getNotionCredentials()
  if (!credentials.dailyRitualDbId || !credentials.taskCalDbId) {
    return new Response(
      JSON.stringify({ error: "Missing Notion database IDs. Please configure them in settings." }),
      { status: 500 },
    )
  }
  if (!credentials.token) {
    return new Response(
      JSON.stringify({ error: "Missing Notion token. Please configure it in settings." }),
      { status: 500 },
    )
  }

  const notion = getNotionClient()
  const dailyRitualDbId = credentials.dailyRitualDbId

  const now = new Date()
  const dateParam = req.nextUrl.searchParams.get("date")
  const dateStr = dateParam || formatDateYYYYMMDD(now)

  try {
    let page = await findDailyRitualByDate(notion, dailyRitualDbId, dateStr)
    if (!page) {
      // Create if missing (read or create new)
      page = await createDailyRitual(notion, dailyRitualDbId, dateStr)
    }

    const props = page.properties

    const weeklyProp = props?.[DR_PROPS.WEEKLY_GOAL]
    const weeklyGoal = weeklyProp ? (propToPlainStrings(weeklyProp)[0] || richTextToPlain(weeklyProp) || "") : ""

    const goal1Ids = extractRelationIds(props?.[DR_PROPS.GOAL1])
    const goal2Ids = extractRelationIds(props?.[DR_PROPS.GOAL2])
    const goal3Ids = extractRelationIds(props?.[DR_PROPS.GOAL3])

    const [g1, g2, g3] = await Promise.all([
      goal1Ids[0] ? getTaskTitle(notion, goal1Ids[0]) : Promise.resolve(""),
      goal2Ids[0] ? getTaskTitle(notion, goal2Ids[0]) : Promise.resolve(""),
      goal3Ids[0] ? getTaskTitle(notion, goal3Ids[0]) : Promise.resolve(""),
    ])

    return Response.json({
      date: dateStr,
      weeklyGoal,
      goals: [g1, g2, g3],
      // Include goal IDs for two-way sync
      goalIds: [goal1Ids[0] || null, goal2Ids[0] || null, goal3Ids[0] || null],
      pageId: page.id,
      source: "notion",
    })
  } catch (error) {
    console.error("/api/goals GET error", error)
    return new Response(JSON.stringify({ error: "Failed to fetch goals" }), { status: 500 })
  }
}

// POST: Update goals in Notion (two-way sync)
// Body: { date?: string, goalIds?: [string|null, string|null, string|null] }
// goalIds are Task Calendar page IDs to set as relations for Goal 1, 2, 3
export async function POST(req: NextRequest) {
  const credentials = getNotionCredentials()
  if (!credentials.dailyRitualDbId || !credentials.taskCalDbId) {
    return new Response(
      JSON.stringify({ error: "Missing Notion database IDs. Please configure them in settings." }),
      { status: 500 },
    )
  }
  if (!credentials.token) {
    return new Response(
      JSON.stringify({ error: "Missing Notion token. Please configure it in settings." }),
      { status: 500 },
    )
  }

  const notion = getNotionClient()
  const dailyRitualDbId = credentials.dailyRitualDbId

  try {
    const body = await req.json()
    const now = new Date()
    const dateStr = body?.date || formatDateYYYYMMDD(now)
    const goalIds: (string | null)[] = body?.goalIds || [null, null, null]

    // Find or create the Daily Ritual page for this date
    let page = await findDailyRitualByDate(notion, dailyRitualDbId, dateStr)
    if (!page) {
      page = await createDailyRitual(notion, dailyRitualDbId, dateStr)
    }

    // Build the properties update object for Goal 1, 2, 3 relations
    const properties: any = {}

    // Update ✅Goal 1
    if (goalIds[0] !== undefined) {
      properties[GOAL_RELATION_PROPS.GOAL1] = {
        relation: goalIds[0] ? [{ id: goalIds[0] }] : []
      }
    }

    // Update ✅Goal 2
    if (goalIds[1] !== undefined) {
      properties[GOAL_RELATION_PROPS.GOAL2] = {
        relation: goalIds[1] ? [{ id: goalIds[1] }] : []
      }
    }

    // Update ✅Goal 3
    if (goalIds[2] !== undefined) {
      properties[GOAL_RELATION_PROPS.GOAL3] = {
        relation: goalIds[2] ? [{ id: goalIds[2] }] : []
      }
    }

    // Only update if there are properties to update
    if (Object.keys(properties).length > 0) {
      await notion.pages.update({
        page_id: page.id,
        properties,
      })
    }

    // Fetch updated goal titles to return
    const [g1, g2, g3] = await Promise.all([
      goalIds[0] ? getTaskTitle(notion, goalIds[0]) : Promise.resolve(""),
      goalIds[1] ? getTaskTitle(notion, goalIds[1]) : Promise.resolve(""),
      goalIds[2] ? getTaskTitle(notion, goalIds[2]) : Promise.resolve(""),
    ])

    return Response.json({
      ok: true,
      date: dateStr,
      goals: [g1, g2, g3],
      goalIds: goalIds,
      pageId: page.id,
      source: "notion",
    })
  } catch (error: any) {
    console.error("/api/goals POST error", error)
    return new Response(
      JSON.stringify({ error: error?.message || "Failed to update goals" }),
      { status: 500 }
    )
  }
}
