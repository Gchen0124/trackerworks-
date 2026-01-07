import { NextRequest, NextResponse } from 'next/server'
import { getNotionClient, getNotionCredentials, DR_PROPS } from '@/lib/notion'

export const dynamic = 'force-dynamic'

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

// Find Daily Ritual page by date
async function findDailyRitualByDate(notionClient: any, dailyRitualDbId: string, dateStr: string) {
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

    const response = await notionClient.dataSources.query({
      data_source_id: dailyRitualDbId,
      filter,
      page_size: 1,
    })

    if (response.results.length > 0) {
      return response.results[0] as any
    }
  } catch (e) {
    console.log("findDailyRitualByDate failed:", e)
  }
  return undefined
}

// Save today's schedule to the Daily Ritual page
export async function POST(request: NextRequest) {
  try {
    const { scheduleData, date } = await request.json()

    if (!scheduleData || !date) {
      return NextResponse.json({ error: 'Missing scheduleData or date' }, { status: 400 })
    }

    const { dailyRitualDbId } = getNotionCredentials()
    if (!dailyRitualDbId) {
      return NextResponse.json({ error: 'Daily Ritual database not configured' }, { status: 400 })
    }

    const notion = getNotionClient()

    // Find the page for this date
    const page = await findDailyRitualByDate(notion, dailyRitualDbId, date)

    if (!page) {
      return NextResponse.json({
        error: `No Daily Ritual page found for ${date}. Please create it in Notion first.`,
        needsPageCreation: true
      }, { status: 404 })
    }

    const pageId = page.id

    // Format the schedule data as a nice table in markdown
    const scheduleMarkdown = formatScheduleAsMarkdown(scheduleData)

    // Append the schedule to the page content
    await notion.blocks.children.append({
      block_id: pageId,
      children: [
        {
          object: 'block',
          type: 'heading_2',
          heading_2: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: `📅 Schedule Log - Updated ${new Date().toLocaleTimeString()}`,
                },
              },
            ],
          },
        },
        {
          object: 'block',
          type: 'code',
          code: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: scheduleMarkdown,
                },
              },
            ],
            language: 'plain text',
          },
        },
        {
          object: 'block',
          type: 'divider',
          divider: {},
        },
      ],
    })

    return NextResponse.json({
      success: true,
      pageId,
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
