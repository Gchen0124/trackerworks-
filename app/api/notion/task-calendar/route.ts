import { NextRequest } from "next/server"
import { getNotionClient, getNotionCredentials, NOTION_TASK_TITLE_PROP } from "@/lib/notion"
import { NotionTaskItem } from "@/types/notion"

type NotionPropertyValue = {
  type?: string
  [key: string]: any
}

function richTextToPlain(property: NotionPropertyValue | undefined) {
  if (!property) return ""
  if (property.type === "title" || property.type === "rich_text") {
    const arr = property[property.type] || []
    if (!Array.isArray(arr)) return ""
    return arr.map((t: any) => t.plain_text || t.text?.content || "").join("").trim()
  }
  return ""
}

function getTitleFromPage(page: any): string {
  const props = page.properties || {}
  for (const key of Object.keys(props)) {
    const prop = props[key] as NotionPropertyValue
    if (prop?.type === "title") {
      const title = richTextToPlain(prop)
      if (title) return title
    }
  }
  return "Untitled"
}

function findProperty(
  props: Record<string, NotionPropertyValue>,
  predicate: (name: string, value: NotionPropertyValue) => boolean,
) {
  for (const [name, value] of Object.entries(props)) {
    if (!value) continue
    if (predicate(name, value)) {
      return { name, value }
    }
  }
  return undefined
}

const DESCRIPTION_MATCHERS = /description|summary|note|context|detail/i
const PRIORITY_MATCHERS = /priority|impact|importance/i
const DUE_DATE_MATCHERS = /due|deadline|date/i
const TAG_MATCHERS = /tag|category|area|pillar|project/i

function extractStatus(props: Record<string, NotionPropertyValue>) {
  const statusEntry =
    findProperty(props, (_name, value) => value.type === "status") ||
    findProperty(props, (name, value) => value.type === "select" && /status/i.test(name))

  if (!statusEntry) return undefined

  if (statusEntry.value.type === "status" && statusEntry.value.status) {
    return {
      name: statusEntry.value.status.name,
      color: statusEntry.value.status.color,
    }
  }

  if (statusEntry.value.type === "select" && statusEntry.value.select) {
    return {
      name: statusEntry.value.select.name,
      color: statusEntry.value.select.color,
    }
  }

  return undefined
}

function extractPriority(props: Record<string, NotionPropertyValue>) {
  const priorityEntry =
    findProperty(props, (name, value) => value.type === "select" && PRIORITY_MATCHERS.test(name)) ||
    findProperty(props, (_name, value) => value.type === "select")

  return priorityEntry?.value?.select?.name || undefined
}

function extractTags(props: Record<string, NotionPropertyValue>) {
  const tagsEntry =
    findProperty(props, (name, value) => value.type === "multi_select" && TAG_MATCHERS.test(name)) ||
    findProperty(props, (_name, value) => value.type === "multi_select")

  if (!tagsEntry?.value?.multi_select) return []
  return tagsEntry.value.multi_select.map((tag: any) => tag?.name).filter(Boolean)
}

function extractDueDate(props: Record<string, NotionPropertyValue>) {
  const dateEntry =
    findProperty(props, (name, value) => value.type === "date" && DUE_DATE_MATCHERS.test(name)) ||
    findProperty(props, (_name, value) => value.type === "date")

  return dateEntry?.value?.date?.start || undefined
}

function extractDescription(props: Record<string, NotionPropertyValue>) {
  const descriptionEntry =
    findProperty(props, (name, value) => value.type === "rich_text" && DESCRIPTION_MATCHERS.test(name)) ||
    findProperty(props, (_name, value) => value.type === "rich_text")

  const text = richTextToPlain(descriptionEntry?.value)
  return text || undefined
}

function getDatabaseTitle(schema: any) {
  const arr = schema?.title
  if (!Array.isArray(arr)) return "Notion Database"
  const title = arr.map((t: any) => t.plain_text || t.text?.content || "").join("").trim()
  return title || "Notion Database"
}

function resolveTitlePropertyName(schema: any) {
  const properties = schema?.properties || {}
  if (properties[NOTION_TASK_TITLE_PROP]?.type === "title") {
    return NOTION_TASK_TITLE_PROP
  }
  for (const [name, value] of Object.entries(properties)) {
    if ((value as NotionPropertyValue)?.type === "title") {
      return name
    }
  }
  return NOTION_TASK_TITLE_PROP
}

function mapPageToTask(
  page: any,
  fallbackDatabaseId: string,
  databaseTitle: string,
): NotionTaskItem {
  const props: Record<string, NotionPropertyValue> = page.properties || {}
  const status = extractStatus(props)
  const priority = extractPriority(props)
  const tags = extractTags(props)
  const dueDate = extractDueDate(props)
  const description = extractDescription(props)

  return {
    id: page.id,
    title: getTitleFromPage(page),
    url: page.url,
    status,
    priority,
    tags,
    description,
    dueDate,
    databaseId: page.parent?.database_id || fallbackDatabaseId,
    databaseName: databaseTitle,
    createdTime: page.created_time,
    lastEditedTime: page.last_edited_time,
    source: "notion",
  }
}

export async function GET(req: NextRequest) {
  const credentials = getNotionCredentials()
  if (!credentials.taskCalDbId) {
    return new Response(
      JSON.stringify({ ok: false, error: "Missing Notion Task Calendar database ID. Please configure it in settings." }),
      { status: 500 },
    )
  }
  if (!credentials.token) {
    return new Response(
      JSON.stringify({ ok: false, error: "Missing Notion token. Please configure it in settings." }),
      { status: 500 },
    )
  }

  const notion = getNotionClient()
  const search = (req.nextUrl.searchParams.get("search") || "").trim()
  const cursor = req.nextUrl.searchParams.get("cursor") || undefined
  const pageSize = Math.min(Number(req.nextUrl.searchParams.get("limit") || 50), 100)

  try {
    // Use dataSources API for Notion SDK v5+ with 2025-09-03 API
    const databaseSchema = await (notion as any).dataSources.retrieve({ data_source_id: credentials.taskCalDbId })
    const databaseTitle = getDatabaseTitle(databaseSchema)
    const titleProperty = resolveTitlePropertyName(databaseSchema)

    // Use dataSources.query for Notion SDK v5+ with 2025-09-03 API
    const query: Record<string, any> = {
      data_source_id: credentials.taskCalDbId,
      page_size: pageSize,
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
    }

    if (cursor) {
      query.start_cursor = cursor
    }

    if (search) {
      query.filter = {
        property: titleProperty,
        title: { contains: search },
      }
    }

    const res = await (notion as any).dataSources.query(query)
    const items: NotionTaskItem[] = res.results.map((page: any) =>
      mapPageToTask(page, credentials.taskCalDbId, databaseTitle),
    )

    return Response.json({
      ok: true,
      items,
      hasMore: res.has_more,
      nextCursor: res.next_cursor,
      database: {
        id: credentials.taskCalDbId,
        title: databaseTitle,
      },
    })
  } catch (error: any) {
    return new Response(
      JSON.stringify({ ok: false, error: error?.message || "Failed to list Task Calendar" }),
      { status: 500 },
    )
  }
}
