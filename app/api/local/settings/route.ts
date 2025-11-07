import { NextRequest } from "next/server"
import { sqlite } from "@/lib/db"

export async function GET() {
  try {
    const row = sqlite.prepare(`SELECT * FROM user_settings WHERE id = 1`).get() as any
    const normalizeInterval = (value: unknown) => {
      if (typeof value !== 'number') return 30
      if (value === 15 || value === 30 || value === 0) return value
      if (value === 1) return 30
      if (value <= 0) return 0
      return value < 22 ? 15 : 30
    }
    const json = {
      blockDurationMinutes: row?.block_duration_minutes ?? 30,
      alertIntervalMinutes: normalizeInterval(row?.enable_half_hour_alerts),
      timeZone: row?.time_zone || 'UTC',
      notionToken: row?.notion_token || '',
      notionDailyRitualDbId: row?.notion_daily_ritual_db_id || '',
      notionTaskCalDbId: row?.notion_task_cal_db_id || '',
    }
    return new Response(JSON.stringify(json), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'server_error', detail: String(e?.message || e) }), { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const blockDurationMinutes = typeof body?.blockDurationMinutes === 'number' ? body.blockDurationMinutes : undefined
    const allowedIntervals = new Set([0, 15, 30])
    let alertIntervalMinutes: number | undefined
    if (typeof body?.alertIntervalMinutes === 'number') {
      const next = Math.floor(body.alertIntervalMinutes)
      alertIntervalMinutes = allowedIntervals.has(next) ? next : undefined
    } else if (typeof body?.enableHalfHourAlerts === 'boolean') {
      alertIntervalMinutes = body.enableHalfHourAlerts ? 30 : 0
    }
    const timeZone = typeof body?.timeZone === 'string' ? body.timeZone : undefined
    const notionToken = typeof body?.notionToken === 'string' ? body.notionToken : undefined
    const notionDailyRitualDbId = typeof body?.notionDailyRitualDbId === 'string' ? body.notionDailyRitualDbId : undefined
    const notionTaskCalDbId = typeof body?.notionTaskCalDbId === 'string' ? body.notionTaskCalDbId : undefined

    const prev = sqlite.prepare(`SELECT * FROM user_settings WHERE id = 1`).get() as any

    const next = {
      block_duration_minutes: blockDurationMinutes ?? prev?.block_duration_minutes ?? 30,
      enable_half_hour_alerts: alertIntervalMinutes ?? prev?.enable_half_hour_alerts ?? 30,
      time_zone: timeZone ?? (prev?.time_zone ?? 'UTC'),
      notion_token: notionToken !== undefined ? notionToken : (prev?.notion_token ?? ''),
      notion_daily_ritual_db_id: notionDailyRitualDbId !== undefined ? notionDailyRitualDbId : (prev?.notion_daily_ritual_db_id ?? ''),
      notion_task_cal_db_id: notionTaskCalDbId !== undefined ? notionTaskCalDbId : (prev?.notion_task_cal_db_id ?? ''),
    }

    sqlite.prepare(`UPDATE user_settings SET block_duration_minutes = ?, enable_half_hour_alerts = ?, time_zone = ?, notion_token = ?, notion_daily_ritual_db_id = ?, notion_task_cal_db_id = ?, updated_at = strftime('%s','now')*1000 WHERE id = 1`)
      .run(next.block_duration_minutes, next.enable_half_hour_alerts, next.time_zone, next.notion_token, next.notion_daily_ritual_db_id, next.notion_task_cal_db_id)

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'server_error', detail: String(e?.message || e) }), { status: 500 })
  }
}
