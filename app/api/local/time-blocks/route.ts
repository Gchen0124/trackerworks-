import { NextRequest } from "next/server"
import { sqlite } from "@/lib/db"

function ensureBlocksForDay(date: string, duration: number) {
  const exists = sqlite.prepare(`SELECT 1 FROM time_blocks WHERE date = ? AND duration_min = ? LIMIT 1`).get(date, duration)
  if (exists) return
  const total = duration === 30 ? 48 : duration === 3 ? 480 : 1440
  const tx = sqlite.transaction(() => {
    for (let i = 0; i < total; i++) {
      const startMin = i * duration
      const endMin = startMin + duration
      const id = `${date}|${duration}|${startMin}`
      sqlite.prepare(`INSERT INTO time_blocks (id, date, duration_min, start_minute_index, end_minute_index, status, is_pinned) VALUES (?,?,?,?,?, 'future', 0)`) 
        .run(id, date, duration, startMin, endMin)
    }
  })
  tx()
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const date = searchParams.get('date') || new Date().toISOString().slice(0,10)
    const duration = parseInt(searchParams.get('duration') || '30', 10)
    if (![1,3,30].includes(duration)) return new Response(JSON.stringify({ error: 'invalid_duration' }), { status: 400 })

    ensureBlocksForDay(date, duration)

    const rows = sqlite.prepare(`SELECT * FROM time_blocks WHERE date = ? AND duration_min = ? ORDER BY start_minute_index ASC`).all(date, duration) as any[]
    const blocks = rows.map(r => ({
      id: r.id,
      date: r.date,
      startLocal: `${String(Math.floor(r.start_minute_index/60)).padStart(2,'0')}:${String(r.start_minute_index%60).padStart(2,'0')}`,
      endLocal: `${String(Math.floor(r.end_minute_index/60)).padStart(2,'0')}:${String(r.end_minute_index%60).padStart(2,'0')}`,
      status: r.status,
      isPinned: !!r.is_pinned,
    }))
    return new Response(JSON.stringify({ date, duration, blocks }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'server_error', detail: String(e?.message || e) }), { status: 500 })
  }
}

