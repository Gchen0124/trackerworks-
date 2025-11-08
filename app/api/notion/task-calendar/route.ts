import { NextRequest } from "next/server"
import { getNotionClient, getNotionCredentials, NOTION_TASK_TITLE_PROP } from "@/lib/notion"

// Extract title from a page (assumes a single title property exists)
function getTitleFromPage(page: any): string {
  const props = page.properties || {}
  for (const key of Object.keys(props)) {
    const p = props[key]
    if (p?.type === "title") {
      const arr = p.title || []
      return arr.map((t: any) => t.plain_text).join("")
    }
  }
  return "Untitled"
}

export async function GET(req: NextRequest) {
  const credentials = getNotionCredentials()
  if (!credentials.taskCalDbId) {
    return new Response(JSON.stringify({ error: "Missing Notion Task Calendar database ID. Please configure it in settings." }), { status: 500 })
  }
  if (!credentials.token) {
    return new Response(JSON.stringify({ error: "Missing Notion token. Please configure it in settings." }), { status: 500 })
  }

  const notion = getNotionClient()

  const search = req.nextUrl.searchParams.get("search") || ""
  const pageSize = Math.min(Number(req.nextUrl.searchParams.get("limit") || 25), 100)

  try {
    const query: any = {
      database_id: credentials.taskCalDbId,
      page_size: pageSize,
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
    }

    // Basic search by title via filter if provided
    if (search) {
      query.filter = {
        property: NOTION_TASK_TITLE_PROP,
        title: { contains: search },
      } as any
    }

    const res = await notion.databases.query(query)

    const items = res.results.map((page: any) => ({
      id: page.id,
      title: getTitleFromPage(page),
      url: page.url,
      lastEdited: page.last_edited_time,
    }))

    return Response.json({ ok: true, items })
  } catch (error: any) {
    return new Response(
      JSON.stringify({ ok: false, error: error?.message || "Failed to list Task Calendar" }),
      { status: 500 },
    )
  }
}
