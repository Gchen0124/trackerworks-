import { NextRequest } from "next/server"
import { getNotionClient, getNotionCredentials } from "@/lib/notion"

// Task status mapping:
// - unchecked (not started) = "Not started" in Notion
// - checked (done) = "Done" or "Complete" in Notion

type TaskStatusValue = "Not started" | "In progress" | "Done" | "Complete"

// POST: Update task status in Notion Task Calendar
// Body: { taskId: string, status: "not_started" | "done" }
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
    const taskId: string = body?.taskId
    const status: "not_started" | "done" | "in_progress" = body?.status

    if (!taskId) {
      return new Response(
        JSON.stringify({ error: "Missing taskId" }),
        { status: 400 }
      )
    }

    if (!status || !["not_started", "done", "in_progress"].includes(status)) {
      return new Response(
        JSON.stringify({ error: "Invalid status. Must be 'not_started', 'in_progress', or 'done'" }),
        { status: 400 }
      )
    }

    // Map our status to Notion status values
    let notionStatus: TaskStatusValue
    switch (status) {
      case "not_started":
        notionStatus = "Not started"
        break
      case "in_progress":
        notionStatus = "In progress"
        break
      case "done":
        notionStatus = "Done"
        break
      default:
        notionStatus = "Not started"
    }

    // Update the task's Status property in Notion
    await notion.pages.update({
      page_id: taskId,
      properties: {
        Status: {
          status: {
            name: notionStatus
          }
        }
      }
    })

    return Response.json({
      ok: true,
      taskId,
      status: notionStatus,
    })
  } catch (error: any) {
    console.error("/api/notion/task-calendar/status POST error", error)
    return new Response(
      JSON.stringify({ error: error?.message || "Failed to update task status" }),
      { status: 500 }
    )
  }
}

// GET: Get task status from Notion
// Query: ?taskId=xxx
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
  const taskId = req.nextUrl.searchParams.get("taskId")

  if (!taskId) {
    return new Response(
      JSON.stringify({ error: "Missing taskId" }),
      { status: 400 }
    )
  }

  try {
    const page: any = await notion.pages.retrieve({ page_id: taskId })
    const statusProp = page.properties?.Status

    let status = "not_started"
    if (statusProp?.status?.name) {
      const name = statusProp.status.name.toLowerCase()
      if (name === "done" || name === "complete") {
        status = "done"
      } else if (name === "in progress") {
        status = "in_progress"
      } else {
        status = "not_started"
      }
    }

    // Also get task title
    let title = ""
    for (const key of Object.keys(page.properties || {})) {
      const prop = page.properties[key]
      if (prop?.type === "title" && prop.title?.length > 0) {
        title = prop.title.map((t: any) => t.plain_text).join("")
        break
      }
    }

    return Response.json({
      ok: true,
      taskId,
      title,
      status,
      notionStatus: statusProp?.status?.name || null,
    })
  } catch (error: any) {
    console.error("/api/notion/task-calendar/status GET error", error)
    return new Response(
      JSON.stringify({ error: error?.message || "Failed to get task status" }),
      { status: 500 }
    )
  }
}
