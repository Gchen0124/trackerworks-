import { NextRequest } from "next/server"
import { getNotionClient, getNotionCredentials, DR_PROPS, formatDateYYYYMMDD } from "@/lib/notion"

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
    const db: any = await notionClient.databases.retrieve({ database_id: dailyRitualDbId })
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
    // Fallback: try title equals
    filter = { property: DR_PROPS.DATE, title: { equals: dateStr } }
  }
  const response = await notionClient.databases.query({
    database_id: dailyRitualDbId,
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
    // Fallback best-effort to title
    properties[DR_PROPS.DATE] = { title: [{ type: "text", text: { content: dateStr } }] }
  }
  try {
    const page = await notionClient.pages.create({
      parent: { database_id: dailyRitualDbId },
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
      pageId: page.id,
      source: "notion",
    })
  } catch (error) {
    console.error("/api/goals GET error", error)
    return new Response(JSON.stringify({ error: "Failed to fetch goals" }), { status: 500 })
  }
}
