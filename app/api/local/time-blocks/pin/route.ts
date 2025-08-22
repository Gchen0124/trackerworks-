import { NextRequest } from "next/server"
import { sqlite } from "@/lib/db"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const blockId: string | undefined = body?.blockId
    const pinned: boolean | undefined = typeof body?.pinned === 'boolean' ? body.pinned : undefined
    if (!blockId || typeof pinned !== 'boolean') return new Response(JSON.stringify({ error: 'invalid_body' }), { status: 400 })
    sqlite.prepare(`UPDATE time_blocks SET is_pinned = ?, updated_at = strftime('%s','now')*1000 WHERE id = ?`) 
      .run(pinned ? 1 : 0, blockId)
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'server_error', detail: String(e?.message || e) }), { status: 500 })
  }
}

