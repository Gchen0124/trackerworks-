import { NextRequest } from "next/server"
import { sqlite } from "@/lib/db"

function formatDate(d: string | Date) {
  const dd = typeof d === "string" ? new Date(d) : d
  return new Date(dd.getTime() - dd.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

const MODES: Record<string, number> = { "30m": 30, "3m": 3, "1m": 1 }

export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get("date") || formatDate(new Date())
    const mode = (req.nextUrl.searchParams.get("mode") || "30m").toLowerCase()
    const step = MODES[mode] || 30

    const rows = sqlite.prepare(
      `SELECT date, minute_index as minuteIndex, task_name as taskName, is_pinned as isPinned, status, label_override as labelOverride
       FROM blocks WHERE date = ?`
    ).all(date) as any[]

    const minutes: { taskName?: string; isPinned?: 0 | 1 | boolean; status?: string; labelOverride?: string }[] = Array.from({ length: 1440 }, () => ({}))
    for (const r of rows) {
      if (r.minuteIndex >= 0 && r.minuteIndex < 1440) {
        minutes[r.minuteIndex] = {
          taskName: r.taskName ?? undefined,
          isPinned: (r.isPinned ?? 0) ? true : false,
          status: r.status ?? undefined,
          labelOverride: r.labelOverride ?? undefined,
        }
      }
    }

    // Group into frames
    const frames: any[] = []
    for (let m = 0; m < 1440; m += step) {
      const slice = minutes.slice(m, m + step)
      // Determine dominant task/status
      const counts = new Map<string, number>()
      const statusCounts = new Map<string, number>()
      let pinnedCount = 0
      let label: string | undefined
      for (let i = 0; i < slice.length; i++) {
        const s = slice[i]
        if (!s) continue
        if (s.taskName) counts.set(s.taskName, (counts.get(s.taskName) || 0) + 1)
        if (s.status) statusCounts.set(s.status, (statusCounts.get(s.status) || 0) + 1)
        if (s.isPinned) pinnedCount++
        if (s.labelOverride) label = s.labelOverride
      }
      const dominantTask = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || ""
      const dominantStatus = Array.from(statusCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || (dominantTask ? "planned" : "")
      frames.push({ startMinute: m, endMinute: Math.min(m + step, 1440), taskName: dominantTask, status: dominantStatus, isPinned: pinnedCount > step / 2, labelOverride: label })
    }

    return Response.json({ date, mode, step, frames })
  } catch (e) {
    console.error("/api/local/blocks GET error", e)
    return new Response(JSON.stringify({ error: "Failed to read local blocks" }), { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const date = body?.date ? formatDate(body.date) : formatDate(new Date())
    const action: string = body?.action || ""

    const tx = sqlite.transaction((fn: () => void) => fn())

    if (action === "set_range") {
      const startMinute: number = body.startMinute
      const endMinute: number = body.endMinute // exclusive
      const taskName: string = body.taskName || ""
      const isPinned: boolean = !!body.isPinned
      const status: string | undefined = body.status
      const now = Date.now()

      tx(() => {
        const stmt = sqlite.prepare(`
          INSERT INTO blocks (date, minute_index, task_name, is_pinned, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(date, minute_index) DO UPDATE SET
            task_name=excluded.task_name,
            is_pinned=excluded.is_pinned,
            status=excluded.status,
            updated_at=excluded.updated_at
        `)
        for (let m = startMinute; m < endMinute && m < 1440; m++) {
          stmt.run(date, m, taskName, isPinned ? 1 : 0, status ?? null, now, now)
        }
      })

      return Response.json({ ok: true })
    }

    if (action === "postpone_range") {
      const startMinute: number = body.startMinute
      const length: number = body.length || 1
      const deltaMinutes: number = body.deltaMinutes || 1
      const carryPin: boolean = body.carryPin !== false
      const now = Date.now()

      // Read current rows
      const current = sqlite.prepare(`
        SELECT minute_index as minuteIndex, task_name as taskName, is_pinned as isPinned, status
        FROM blocks WHERE date = ? AND minute_index >= ? AND minute_index < ?
        ORDER BY minute_index ASC
      `).all(date, startMinute, Math.min(startMinute + length, 1440)) as any[]

      tx(() => {
        const delStmt = sqlite.prepare(`DELETE FROM blocks WHERE date = ? AND minute_index = ?`)
        const upsert = sqlite.prepare(`
          INSERT INTO blocks (date, minute_index, task_name, is_pinned, status, moved_from_minute, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(date, minute_index) DO UPDATE SET
            task_name=excluded.task_name,
            is_pinned=excluded.is_pinned,
            status=excluded.status,
            moved_from_minute=excluded.moved_from_minute,
            updated_at=excluded.updated_at
        `)
        for (const row of current) {
          const target = row.minuteIndex + deltaMinutes
          if (target < 0 || target >= 1440) continue
          // remove old row (optional), then write new row
          delStmt.run(date, row.minuteIndex)
          upsert.run(date, target, row.taskName, carryPin ? (row.isPinned ? 1 : 0) : 0, row.status, row.minuteIndex, now, now)
        }
      })

      return Response.json({ ok: true })
    }

    if (action === "pin_range") {
      const startMinute: number = body.startMinute
      const length: number = body.length || 1
      const isPinned: boolean = !!body.isPinned
      const now = Date.now()

      tx(() => {
        const upsert = sqlite.prepare(`
          INSERT INTO blocks (date, minute_index, is_pinned, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(date, minute_index) DO UPDATE SET
            is_pinned=excluded.is_pinned,
            updated_at=excluded.updated_at
        `)
        for (let m = startMinute; m < Math.min(startMinute + length, 1440); m++) {
          upsert.run(date, m, isPinned ? 1 : 0, now, now)
        }
      })

      return Response.json({ ok: true })
    }

    if (action === "rename_range") {
      const startMinute: number = body.startMinute
      const length: number = body.length || 1
      const label: string = body.label || ""
      const now = Date.now()
      tx(() => {
        const upsert = sqlite.prepare(`
          INSERT INTO blocks (date, minute_index, label_override, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(date, minute_index) DO UPDATE SET
            label_override=excluded.label_override,
            updated_at=excluded.updated_at
        `)
        for (let m = startMinute; m < Math.min(startMinute + length, 1440); m++) {
          upsert.run(date, m, label || null, now, now)
        }
      })
      return Response.json({ ok: true })
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400 })
  } catch (e) {
    console.error("/api/local/blocks POST error", e)
    return new Response(JSON.stringify({ error: "Failed to write local blocks" }), { status: 500 })
  }
}
