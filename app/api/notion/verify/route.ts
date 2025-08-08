import { NextRequest } from "next/server"
import { notion, NOTION_DAILY_RITUAL_DB_ID, NOTION_TASK_CAL_DB_ID } from "@/lib/notion"

export async function GET(_req: NextRequest) {
  if (!NOTION_DAILY_RITUAL_DB_ID || !NOTION_TASK_CAL_DB_ID) {
    return new Response(
      JSON.stringify({ error: "Missing NOTION_DAILY_RITUAL_DB_ID or NOTION_TASK_CAL_DB_ID env." }),
      { status: 500 },
    )
  }

  try {
    const [drSchema, tcSchema] = await Promise.all([
      notion.databases.retrieve({ database_id: NOTION_DAILY_RITUAL_DB_ID }),
      notion.databases.retrieve({ database_id: NOTION_TASK_CAL_DB_ID }),
    ])

    // Minimal queries to confirm access
    const [drSample, tcSample] = await Promise.all([
      notion.databases.query({ database_id: NOTION_DAILY_RITUAL_DB_ID, page_size: 1 }),
      notion.databases.query({ database_id: NOTION_TASK_CAL_DB_ID, page_size: 1 }),
    ])

    const drTitleArr = (drSchema as any)?.title || []
    const tcTitleArr = (tcSchema as any)?.title || []
    const drTitle = Array.isArray(drTitleArr)
      ? (drTitleArr as Array<{ plain_text?: string }>).map((t) => t.plain_text || "").join("")
      : ""
    const tcTitle = Array.isArray(tcTitleArr)
      ? (tcTitleArr as Array<{ plain_text?: string }>).map((t) => t.plain_text || "").join("")
      : ""

    return Response.json({
      ok: true,
      dailyRitual: {
        id: (drSchema as any).id,
        title: drTitle,
        properties: Object.keys((drSchema as any).properties || {}),
        sampleCount: drSample.results.length,
      },
      taskCalendar: {
        id: (tcSchema as any).id,
        title: tcTitle,
        properties: Object.keys((tcSchema as any).properties || {}),
        sampleCount: tcSample.results.length,
      },
    })
  } catch (error: any) {
    return new Response(
      JSON.stringify({ ok: false, error: error?.message || "Failed to verify Notion access" }),
      { status: 500 },
    )
  }
}
