import { NextRequest, NextResponse } from 'next/server'
import { getNotionClient, getNotionCredentials, DR_PROPS } from '@/lib/notion'

export const dynamic = 'force-dynamic'
const NOTION_TEXT_CHUNK_SIZE = 1800
const NOTION_APPEND_BATCH_SIZE = 90

// Get the property type for the configured date property
async function getDatePropType(notionClient: any, dailyRitualDbId: string): Promise<"date" | "title" | "rich_text" | "unknown"> {
  try {
    const db: any = await notionClient.dataSources.retrieve({ data_source_id: dailyRitualDbId })
    const prop = db?.properties?.[DR_PROPS.DATE]
    return (prop?.type as any) || "unknown"
  } catch {
    return "unknown"
  }
}

async function queryDailyRitualByFilter(notionClient: any, dailyRitualDbId: string, filter: any) {
  const response = await notionClient.dataSources.query({
    data_source_id: dailyRitualDbId,
    filter,
    page_size: 1,
  })
  return response.results?.[0] as any | undefined
}

// Find Daily Ritual page by date
async function findDailyRitualByDate(notionClient: any, dailyRitualDbId: string, dateStr: string) {
  // Strategy 1: configured date property
  const propType = await getDatePropType(notionClient, dailyRitualDbId)
  try {
    let filter: any
    if (propType === "date") {
      filter = { property: DR_PROPS.DATE, date: { equals: dateStr } }
    } else if (propType === "title") {
      filter = { property: DR_PROPS.DATE, title: { equals: dateStr } }
    } else if (propType === "rich_text") {
      filter = { property: DR_PROPS.DATE, rich_text: { equals: dateStr } }
    } else {
      filter = { property: DR_PROPS.DATE, title: { equals: dateStr } }
    }

    const page = await queryDailyRitualByFilter(notionClient, dailyRitualDbId, filter)
    if (page) return page
  } catch (e) {
    console.log("findDailyRitualByDate strategy 1 failed:", e)
  }

  // Strategy 2: known alternate date property names
  const fallbackDateProps = ["Date on Daily RItual", "Date on Daily Ritual"]
  for (const propName of fallbackDateProps) {
    try {
      const page = await queryDailyRitualByFilter(notionClient, dailyRitualDbId, {
        property: propName,
        date: { equals: dateStr },
      })
      if (page) return page
    } catch (e) {
      console.log(`findDailyRitualByDate fallback strategy failed for "${propName}":`, e)
    }
  }

  // Strategy 3: scan recent pages and match any date/title/rich_text property value
  try {
    const recentPages = await notionClient.dataSources.query({
      data_source_id: dailyRitualDbId,
      page_size: 100,
      sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
    })
    for (const page of recentPages.results || []) {
      const props = (page as any)?.properties || {}
      for (const prop of Object.values(props) as any[]) {
        if (!prop || typeof prop !== 'object') continue
        if (prop.type === 'date') {
          const start = prop.date?.start ? String(prop.date.start).slice(0, 10) : ''
          if (start === dateStr) return page as any
        }
        if (prop.type === 'title' || prop.type === 'rich_text') {
          const text = Array.isArray(prop[prop.type])
            ? prop[prop.type].map((t: any) => t?.plain_text || '').join('').trim()
            : ''
          if (text === dateStr) return page as any
        }
      }
    }
  } catch (e) {
    console.log("findDailyRitualByDate strategy 3 failed:", e)
  }

  return undefined
}

function isValidDateString(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function splitTextForNotion(text: string, maxLen = NOTION_TEXT_CHUNK_SIZE): string[] {
  if (!text) return ['']
  if (text.length <= maxLen) return [text]

  const lines = text.split('\n')
  const chunks: string[] = []
  let current = ''

  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line
    if (candidate.length <= maxLen) {
      current = candidate
      continue
    }

    if (current) {
      chunks.push(current)
      current = ''
    }

    if (line.length <= maxLen) {
      current = line
      continue
    }

    for (let i = 0; i < line.length; i += maxLen) {
      chunks.push(line.slice(i, i + maxLen))
    }
  }

  if (current) chunks.push(current)
  return chunks.length > 0 ? chunks : [text.slice(0, maxLen)]
}

function buildScheduleBlocks(scheduleData: any[], updatedAtLabel: string) {
  const scheduleMarkdown = formatScheduleAsMarkdown(scheduleData)
  const markdownChunks = splitTextForNotion(scheduleMarkdown)

  const children: any[] = [
    {
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: [
          {
            type: 'text',
            text: {
              content: `📅 Schedule Log - Updated ${updatedAtLabel}`,
            },
          },
        ],
      },
    },
  ]

  for (const chunk of markdownChunks) {
    children.push({
      object: 'block',
      type: 'code',
      code: {
        rich_text: [
          {
            type: 'text',
            text: {
              content: chunk,
            },
          },
        ],
        language: 'plain text',
      },
    })
  }

  children.push({
    object: 'block',
    type: 'divider',
    divider: {},
  })

  return { children, chunkCount: markdownChunks.length }
}

async function appendBlocksInBatches(notionClient: any, pageId: string, children: any[]) {
  for (let i = 0; i < children.length; i += NOTION_APPEND_BATCH_SIZE) {
    const batch = children.slice(i, i + NOTION_APPEND_BATCH_SIZE)
    await notionClient.blocks.children.append({
      block_id: pageId,
      children: batch,
    })
  }
}

// Save today's schedule to the Daily Ritual page
export async function POST(request: NextRequest) {
  try {
    const { scheduleData, date } = await request.json()

    if (!Array.isArray(scheduleData) || !isValidDateString(date)) {
      return NextResponse.json({ error: 'Missing scheduleData or date' }, { status: 400 })
    }

    const { dailyRitualDbId, token } = getNotionCredentials()
    if (!dailyRitualDbId) {
      return NextResponse.json({ error: 'Daily Ritual database not configured' }, { status: 400 })
    }
    if (!token) {
      return NextResponse.json({ error: 'Notion token not configured' }, { status: 400 })
    }

    const notion = getNotionClient()

    // Find the page for this date
    const page = await findDailyRitualByDate(notion, dailyRitualDbId, date)

    if (!page) {
      return NextResponse.json(
        {
          error: `No Daily Ritual page found for ${date}. Auto-save is search-only and will not create pages.`,
          needsPageCreation: true,
        },
        { status: 404 }
      )
    }

    const pageId = page.id

    const { children, chunkCount } = buildScheduleBlocks(scheduleData, new Date().toLocaleTimeString())
    await appendBlocksInBatches(notion, pageId, children)

    return NextResponse.json({
      success: true,
      pageId,
      chunksWritten: chunkCount,
      message: `Schedule saved to Daily Ritual page for ${date}`
    })
  } catch (error: any) {
    console.error('Error saving schedule to Notion:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to save schedule' },
      { status: 500 }
    )
  }
}

function formatScheduleAsMarkdown(scheduleData: any[]): string {
  if (!scheduleData || scheduleData.length === 0) {
    return 'No schedule data available'
  }

  // Group by status for better readability
  const completed = scheduleData.filter(b => b.is_completed === '1')
  const active = scheduleData.filter(b => b.is_active === '1')
  const planned = scheduleData.filter(b => b.task_title && b.is_completed !== '1' && b.is_active !== '1')

  let markdown = ''

  // Summary
  markdown += `Summary: ${completed.length} completed, ${active.length} active, ${planned.length} planned\n\n`

  // Completed tasks
  if (completed.length > 0) {
    markdown += '✅ COMPLETED:\n'
    completed.forEach(b => {
      markdown += `  ${b.start_time}-${b.end_time} (${b.duration_min}min) ${b.task_title || '(empty)'}`
      if (b.goal_label) markdown += ` [${b.goal_label}]`
      markdown += '\n'
    })
    markdown += '\n'
  }

  // Active task
  if (active.length > 0) {
    markdown += '⏳ ACTIVE:\n'
    active.forEach(b => {
      markdown += `  ${b.start_time}-${b.end_time} (${b.duration_min}min) ${b.task_title || '(empty)'}`
      if (b.goal_label) markdown += ` [${b.goal_label}]`
      markdown += '\n'
    })
    markdown += '\n'
  }

  // Planned tasks
  if (planned.length > 0) {
    markdown += '📋 PLANNED:\n'
    planned.forEach(b => {
      markdown += `  ${b.start_time}-${b.end_time} (${b.duration_min}min) ${b.task_title || '(empty)'}`
      if (b.goal_label) markdown += ` [${b.goal_label}]`
      markdown += '\n'
    })
  }

  return markdown
}
