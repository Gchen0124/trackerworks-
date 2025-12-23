import { NextRequest } from "next/server"
import { getNotionClient, getNotionCredentials } from "@/lib/notion"

export async function GET(_req: NextRequest) {
  const credentials = getNotionCredentials()
  const notion = getNotionClient()

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

  try {
    // Use dataSources API for Notion SDK v5+ with 2025-09-03 API
    const [drSchema, tcSchema] = await Promise.all([
      (notion as any).dataSources.retrieve({ data_source_id: credentials.dailyRitualDbId }),
      (notion as any).dataSources.retrieve({ data_source_id: credentials.taskCalDbId }),
    ])

    // Minimal queries to confirm access
    const [drSample, tcSample] = await Promise.all([
      (notion as any).dataSources.query({ data_source_id: credentials.dailyRitualDbId, page_size: 1 }),
      (notion as any).dataSources.query({ data_source_id: credentials.taskCalDbId, page_size: 1 }),
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
