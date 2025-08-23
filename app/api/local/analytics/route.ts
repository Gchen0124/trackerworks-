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
    const row = sqlite.prepare(`SELECT * FROM daily_time_analytics WHERE date = ?`).get(date) as any
    if (!row) {
      // Derive from active_window if present
      const win = sqlite.prepare(`SELECT * FROM daily_active_windows WHERE date = ?`).get(date) as any
      if (win) {
        const active = Math.max(0, Math.min(1440, (win.active_end_minute - win.active_start_minute)))
        const inactive = 1440 - active
        return new Response(JSON.stringify({ date, activeMinutes: active, inactiveMinutes: inactive }), { status: 200 })
      }
      return new Response(JSON.stringify({ date, activeMinutes: null, inactiveMinutes: null }), { status: 200 })
    }
    return new Response(JSON.stringify({ date: row.date, activeMinutes: row.active_minutes, inactiveMinutes: row.inactive_minutes }), { status: 200 })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'server_error', detail: String(e?.message || e) }), { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const date = todayISO()
    const body = await req.json().catch(() => ({}))
    const active = Number(body?.activeMinutes)
    const inactive = Number(body?.inactiveMinutes)
    if (!Number.isFinite(active) || !Number.isFinite(inactive)) return new Response(JSON.stringify({ error: 'invalid_input' }), { status: 400 })
    sqlite.prepare(
      `INSERT INTO daily_time_analytics(date, active_minutes, inactive_minutes) VALUES(?,?,?)
       ON CONFLICT(date) DO UPDATE SET active_minutes=excluded.active_minutes, inactive_minutes=excluded.inactive_minutes, updated_at = strftime('%s','now')*1000`
    ).run(date, active, inactive)
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'server_error', detail: String(e?.message || e) }), { status: 500 })
  }
}

