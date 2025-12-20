import { NextRequest } from "next/server"
import { getNotionClient, getNotionCredentials } from "@/lib/notion"

// Notion Task Calendar has "Sub-item" relation property that links to child tasks
// and "Parent item" relation property that links to parent task

// Helper to extract text from title property
function getTitle(page: any): string {
  for (const key of Object.keys(page.properties || {})) {
    const prop = page.properties[key]
    if (prop?.type === "title" && prop.title?.length > 0) {
      return prop.title.map((t: any) => t.plain_text).join("")
    }
  }
  return "Untitled"
}

// Helper to extract status
function getStatus(page: any): { name: string; normalized: "not_started" | "in_progress" | "done" } {
  const statusProp = page.properties?.Status
  const name = statusProp?.status?.name || "Not started"
  let normalized: "not_started" | "in_progress" | "done" = "not_started"

  const lower = name.toLowerCase()
  if (lower === "done" || lower === "complete") {
    normalized = "done"
  } else if (lower === "in progress") {
    normalized = "in_progress"
  }

  return { name, normalized }
}

// Helper to extract relation IDs
function getRelationIds(prop: any): string[] {
  if (!prop || prop.type !== "relation" || !Array.isArray(prop.relation)) return []
  return prop.relation.map((r: any) => r.id)
}

// GET: Get sub-items of a task from Notion
// Query: ?parentId=xxx
export async function GET(req: NextRequest) {
  const credentials = getNotionCredentials()
  if (!credentials.taskCalDbId) {
    return new Response(
      JSON.stringify({ error: "Missing Notion Task Calendar database ID. Please configure it in settings." }),
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
  const parentId = req.nextUrl.searchParams.get("parentId")

  if (!parentId) {
    return new Response(
      JSON.stringify({ error: "Missing parentId" }),
      { status: 400 }
    )
  }

  try {
    // Query tasks that have this parent in their "Parent item" relation
    // Use dataSources.query for new Notion client v5+
    const response = await (notion as any).dataSources.query({
      data_source_id: credentials.taskCalDbId,
      filter: {
        property: "Parent item",
        relation: {
          contains: parentId
        }
      },
      sorts: [
        { timestamp: "created_time", direction: "ascending" }
      ]
    })

    const items = response.results.map((page: any) => {
      const status = getStatus(page)
      const subItemIds = getRelationIds(page.properties?.["Sub-item"])

      return {
        id: page.id,
        title: getTitle(page),
        status: status.normalized,
        notionStatus: status.name,
        hasSubitems: subItemIds.length > 0,
        subitemIds: subItemIds,
        url: page.url,
        createdTime: page.created_time,
        lastEditedTime: page.last_edited_time,
      }
    })

    return Response.json({
      ok: true,
      parentId,
      items,
      count: items.length,
    })
  } catch (error: any) {
    console.error("/api/notion/task-calendar/subitems GET error", error)
    return new Response(
      JSON.stringify({ error: error?.message || "Failed to get sub-items" }),
      { status: 500 }
    )
  }
}

// POST: Create a new sub-item under a parent task
// Body: { parentId: string, title: string }
export async function POST(req: NextRequest) {
  const credentials = getNotionCredentials()
  if (!credentials.taskCalDbId) {
    return new Response(
      JSON.stringify({ error: "Missing Notion Task Calendar database ID. Please configure it in settings." }),
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

  try {
    const body = await req.json()
    const parentId: string = body?.parentId
    const title: string = body?.title || "New subtask"

    if (!parentId) {
      return new Response(
        JSON.stringify({ error: "Missing parentId" }),
        { status: 400 }
      )
    }

    // First, get the database schema to find the title property name
    // Use dataSources.retrieve for new Notion client v5+
    const dbSchema: any = await (notion as any).dataSources.retrieve({ data_source_id: credentials.taskCalDbId })
    let titlePropertyName = "Task Plan" // Default for Task Calendar

    for (const [name, prop] of Object.entries(dbSchema.properties || {})) {
      if ((prop as any).type === "title") {
        titlePropertyName = name
        break
      }
    }

    // Create the new sub-item
    const newPage: any = await notion.pages.create({
      parent: { database_id: credentials.taskCalDbId },
      properties: {
        [titlePropertyName]: {
          title: [{ text: { content: title } }]
        },
        "Parent item": {
          relation: [{ id: parentId }]
        },
        Status: {
          status: { name: "Not started" }
        }
      }
    })

    return Response.json({
      ok: true,
      item: {
        id: newPage.id,
        title,
        status: "not_started",
        notionStatus: "Not started",
        parentId,
        url: newPage.url,
      }
    })
  } catch (error: any) {
    console.error("/api/notion/task-calendar/subitems POST error", error)
    return new Response(
      JSON.stringify({ error: error?.message || "Failed to create sub-item" }),
      { status: 500 }
    )
  }
}

// DELETE: Delete a sub-item (archive in Notion)
// Body: { taskId: string }
export async function DELETE(req: NextRequest) {
  const credentials = getNotionCredentials()
  if (!credentials.token) {
    return new Response(
      JSON.stringify({ error: "Missing Notion token. Please configure it in settings." }),
      { status: 500 },
    )
  }

  const notion = getNotionClient()

  try {
    const body = await req.json()
    const taskId: string = body?.taskId

    if (!taskId) {
      return new Response(
        JSON.stringify({ error: "Missing taskId" }),
        { status: 400 }
      )
    }

    // Archive the page (Notion's way of deleting)
    await notion.pages.update({
      page_id: taskId,
      archived: true
    })

    return Response.json({
      ok: true,
      taskId,
      deleted: true
    })
  } catch (error: any) {
    console.error("/api/notion/task-calendar/subitems DELETE error", error)
    return new Response(
      JSON.stringify({ error: error?.message || "Failed to delete sub-item" }),
      { status: 500 }
    )
  }
}
