import { NextRequest } from "next/server"
import { sqlite } from "@/lib/db"

function ensureId() { try { return crypto.randomUUID() } catch { return Math.random().toString(36).slice(2) } }

const ALLOWED = new Set(['completed','disrupted','paused','future','current','past'])

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const blockId: string | undefined = body?.blockId
    const status: string | undefined = body?.status
    const reason: string | undefined = body?.reason
    if (!blockId || !status || !ALLOWED.has(status)) return new Response(JSON.stringify({ error: 'invalid_body' }), { status: 400 })

    const now = Date.now()
    sqlite.prepare(`UPDATE time_blocks SET status = ?, updated_at = ? WHERE id = ?`).run(status, now, blockId)

    if (status === 'completed' || status === 'disrupted' || status === 'paused') {
      const ins = sqlite.prepare(`INSERT INTO progress_events (id, block_id, type, at, meta) VALUES (?,?,?,?,?)`)
      ins.run(ensureId(), blockId, status, now, reason ? JSON.stringify({ reason }) : null)
    }

    const row = sqlite.prepare(`SELECT * FROM time_blocks WHERE id = ?`).get(blockId) as any
    const json = {
      id: row.id,
      date: row.date,
      startLocal: `${String(Math.floor(row.start_minute_index/60)).padStart(2,'0')}:${String(row.start_minute_index%60).padStart(2,'0')}`,
      endLocal: `${String(Math.floor(row.end_minute_index/60)).padStart(2,'0')}:${String(row.end_minute_index%60).padStart(2,'0')}`,
      status: row.status,
      isPinned: !!row.is_pinned,
    }
    return new Response(JSON.stringify({ ok: true, block: json }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'server_error', detail: String(e?.message || e) }), { status: 500 })
  }
}

