import { NextRequest } from "next/server"
import { sqlite } from "@/lib/db"

function todayISO(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export async function GET() {
  try {
    const date = todayISO()
    const row = sqlite.prepare(`SELECT * FROM daily_active_windows WHERE date = ?`).get(date) as any
    if (!row) {
      return new Response(JSON.stringify({ date, activeStartMinute: null, activeEndMinute: null }), { status: 200 })
    }
    return new Response(
      JSON.stringify({
        date: row.date,
        activeStartMinute: row.active_start_minute,
        activeEndMinute: row.active_end_minute,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'server_error', detail: String(e?.message || e) }), { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const start = Number(body?.activeStartMinute)
    const end = Number(body?.activeEndMinute)
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < 0 || start > 1440 || end > 1440) {
      return new Response(JSON.stringify({ error: 'invalid_input' }), { status: 400 })
    }
    const date = todayISO()
    sqlite.prepare(
      `INSERT INTO daily_active_windows(date, active_start_minute, active_end_minute) VALUES(?,?,?)
       ON CONFLICT(date) DO UPDATE SET active_start_minute=excluded.active_start_minute, active_end_minute=excluded.active_end_minute, updated_at = strftime('%s','now')*1000`
    ).run(date, start, end)
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'server_error', detail: String(e?.message || e) }), { status: 500 })
  }
}
// Upsert analytics on active-window updates
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const start = Number(body?.activeStartMinute)
    const end = Number(body?.activeEndMinute)
    if (!Number.isFinite(start) || !Number.isFinite(end)) return new Response(JSON.stringify({ error: 'invalid_input' }), { status: 400 })
    const date = todayISO()
    sqlite.prepare(
      `INSERT INTO daily_active_windows(date, active_start_minute, active_end_minute) VALUES(?,?,?)
       ON CONFLICT(date) DO UPDATE SET active_start_minute=excluded.active_start_minute, active_end_minute=excluded.active_end_minute, updated_at = strftime('%s','now')*1000`
    ).run(date, start, end)
    const active = Math.max(0, Math.min(1440, end - start))
    const inactive = 1440 - active
    sqlite.prepare(
      `INSERT INTO daily_time_analytics(date, active_minutes, inactive_minutes) VALUES(?,?,?)
       ON CONFLICT(date) DO UPDATE SET active_minutes=excluded.active_minutes, inactive_minutes=excluded.inactive_minutes, updated_at = strftime('%s','now')*1000`
    ).run(date, active, inactive)
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'server_error', detail: String(e?.message || e) }), { status: 500 })
  }
}


