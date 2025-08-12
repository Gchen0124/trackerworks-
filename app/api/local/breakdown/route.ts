import { NextRequest } from "next/server"
import { sqlite } from "@/lib/db"

// Breakdown Items API (Phase 1)
// - GET /api/local/breakdown?parentId=... | goalId=... | scopeType=task|microstep
// - POST replace children list for a parent (or goal) with new items
//   Body: { parentId?: string, goalId?: string, scopeType: 'task'|'microstep', items: Array<{ id?: string, title: string, estimate_min?: number, order_index?: number }> }
// - PUT update subset: Body: { items: Array<{ id: string, title?: string, estimate_min?: number, order_index?: number }> }
// - DELETE delete: Body: { ids: string[] }

function now() { return Date.now() }

function ensureId() {
  try { return crypto.randomUUID() } catch { return Math.random().toString(36).slice(2) }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const parentId = searchParams.get("parentId")
  const goalId = searchParams.get("goalId")
  const scopeType = searchParams.get("scopeType")

  let where = ""
  const args: any[] = []
  if (parentId) { where += (where ? " AND " : " WHERE ") + "parent_id = ?"; args.push(parentId) }
  if (goalId) { where += (where ? " AND " : " WHERE ") + "goal_id = ?"; args.push(goalId) }
  if (scopeType) { where += (where ? " AND " : " WHERE ") + "scope_type = ?"; args.push(scopeType) }

  const stmt = sqlite.prepare(`SELECT * FROM breakdown_items ${where} ORDER BY order_index ASC, created_at ASC`)
  const rows = stmt.all(...args)
  return new Response(JSON.stringify({ items: rows }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parentId: string | undefined = body?.parentId || undefined
    const goalId: string | undefined = body?.goalId || undefined
    const scopeType: 'task'|'microstep' = body?.scopeType
    const items: Array<{ id?: string, title: string, estimate_min?: number, order_index?: number }> = body?.items || []

    if (!scopeType) return new Response(JSON.stringify({ error: 'Missing scopeType' }), { status: 400 })
    if (!parentId && !goalId) return new Response(JSON.stringify({ error: 'Must provide parentId or goalId' }), { status: 400 })

    const tx = sqlite.transaction((payload: typeof items) => {
      // Delete existing children for this scope
      let where = "scope_type = ?"
      const args: any[] = [scopeType]
      if (parentId) { where += " AND parent_id = ?"; args.push(parentId) }
      if (goalId) { where += " AND goal_id = ?"; args.push(goalId) }
      sqlite.prepare(`DELETE FROM breakdown_items WHERE ${where}`).run(...args)

      const insert = sqlite.prepare(`INSERT INTO breakdown_items (id, parent_id, scope_type, goal_id, title, estimate_min, order_index, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`)
      const ts = now()
      payload.forEach((it, idx) => {
        const id = it.id || ensureId()
        insert.run(
          id,
          parentId ?? null,
          scopeType,
          goalId ?? null,
          it.title?.toString() || '',
          typeof it.estimate_min === 'number' ? it.estimate_min : null,
          typeof it.order_index === 'number' ? it.order_index! : idx,
          ts,
          ts,
        )
      })
    })

    tx(items)
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'server_error', detail: String(e?.message || e) }), { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const items: Array<{ id: string, title?: string, estimate_min?: number, order_index?: number }> = body?.items || []
    if (!Array.isArray(items) || items.length === 0) return new Response(JSON.stringify({ error: 'No items' }), { status: 400 })

    const updTitle = sqlite.prepare(`UPDATE breakdown_items SET title = ?, updated_at = ? WHERE id = ?`)
    const updEst = sqlite.prepare(`UPDATE breakdown_items SET estimate_min = ?, updated_at = ? WHERE id = ?`)
    const updOrder = sqlite.prepare(`UPDATE breakdown_items SET order_index = ?, updated_at = ? WHERE id = ?`)

    const ts = now()
    const tx = sqlite.transaction((arr: typeof items) => {
      arr.forEach((it) => {
        if (typeof it.title === 'string') updTitle.run(it.title, ts, it.id)
        if (typeof it.estimate_min === 'number') updEst.run(it.estimate_min, ts, it.id)
        if (typeof it.order_index === 'number') updOrder.run(it.order_index, ts, it.id)
      })
    })

    tx(items)
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'server_error', detail: String(e?.message || e) }), { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const ids: string[] = body?.ids || []
    if (!Array.isArray(ids) || ids.length === 0) return new Response(JSON.stringify({ error: 'No ids' }), { status: 400 })
    const del = sqlite.prepare(`DELETE FROM breakdown_items WHERE id = ?`)
    const tx = sqlite.transaction((arr: string[]) => {
      arr.forEach((id) => del.run(id))
    })
    tx(ids)
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'server_error', detail: String(e?.message || e) }), { status: 500 })
  }
}
