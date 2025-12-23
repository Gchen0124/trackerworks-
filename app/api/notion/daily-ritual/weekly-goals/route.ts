import { NextRequest } from "next/server"
import { getNotionClient, getNotionCredentials, DR_PROPS } from "@/lib/notion"

// Extract plain text from a property that could be rich_text, title, or rollup of arrays
function propToPlainStrings(prop: any): string[] {
  if (!prop) return []
  // direct text
  if (prop.type === "rich_text" || prop.type === "title") {
    const arr = prop[prop.type] || []
    return Array.isArray(arr) ? arr.map((t: any) => t.plain_text || "").filter(Boolean) : []
  }
  // rollup
  if (prop.type === "rollup") {
    const r = prop.rollup
    if (!r) return []
    // rollup can be array of rich_text or title in value
    if (r.type === "array" && Array.isArray(r.array)) {
      const out: string[] = []
      for (const item of r.array) {
        if (item?.type === "rich_text" || item?.type === "title") {
          const a = item[item.type] || []
          if (Array.isArray(a)) out.push(...a.map((t: any) => t.plain_text || "").filter(Boolean))
        }
      }
      return out
    }
    // sometimes rollup of number/date not applicable
    return []
  }
  return []
}

export async function GET(_req: NextRequest) {
  const credentials = getNotionCredentials()
  const notion = getNotionClient()

  if (!credentials.dailyRitualDbId) {
    return new Response(JSON.stringify({ ok: false, error: "Missing Notion Daily Ritual database ID. Please configure it in settings." }), { status: 500 })
  }

  if (!credentials.token) {
    return new Response(JSON.stringify({ ok: false, error: "Missing Notion token. Please configure it in settings." }), { status: 500 })
  }

  try {
    // Use dataSources.query for Notion SDK v5+ with 2025-09-03 API
    const res = await (notion as any).dataSources.query({
      data_source_id: credentials.dailyRitualDbId,
      page_size: 50,
      sorts: [
        { timestamp: "last_edited_time", direction: "descending" },
      ],
    })

    const set = new Set<string>()
    for (const page of res.results as any[]) {
      const p = page.properties?.[DR_PROPS.WEEKLY_GOAL]
      const vals = propToPlainStrings(p)
      for (const v of vals) {
        const trimmed = (v || "").trim()
        if (trimmed) set.add(trimmed)
      }
    }
    const items = Array.from(set)
    return Response.json({ ok: true, items })
  } catch (error: any) {
    return new Response(
      JSON.stringify({ ok: false, error: error?.message || "Failed to fetch weekly goals" }),
      { status: 500 },
    )
  }
}
