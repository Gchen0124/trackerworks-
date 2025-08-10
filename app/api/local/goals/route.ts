import { NextRequest } from "next/server"
import { sqlite } from "@/lib/db"

function formatDate(d: string | Date) {
  const dd = typeof d === "string" ? new Date(d) : d
  return new Date(dd.getTime() - dd.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get("date") || formatDate(new Date())
    const row = sqlite.prepare(
      `SELECT date, weekly_goal as weeklyGoal, goal1, goal2, goal3, exciting_goal as excitingGoal, eoy_goal as eoyGoal, monthly_goal as monthlyGoal, source FROM goals WHERE date = ?`
    ).get(date) as any

    if (!row) {
      // Return empty local snapshot
      return Response.json({
        date,
        weeklyGoal: "",
        goals: ["", "", ""],
        excitingGoal: "",
        eoyGoal: "",
        monthlyGoal: "",
        source: "local",
      })
    }

    return Response.json({
      date: row.date,
      weeklyGoal: row.weeklyGoal || "",
      goals: [row.goal1 || "", row.goal2 || "", row.goal3 || ""],
      excitingGoal: row.excitingGoal || "",
      eoyGoal: row.eoyGoal || "",
      monthlyGoal: row.monthlyGoal || "",
      source: row.source || "local",
    })
  } catch (e) {
    console.error("/api/local/goals GET error", e)
    return new Response(JSON.stringify({ error: "Failed to read local goals" }), { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const date = body?.date ? formatDate(body.date) : formatDate(new Date())
    const weeklyGoal: string = body?.weeklyGoal || ""
    const goals: string[] = Array.isArray(body?.goals) ? body.goals : ["", "", ""]
    const excitingGoal: string = body?.excitingGoal || ""
    const eoyGoal: string = body?.eoyGoal || ""
    const monthlyGoal: string = body?.monthlyGoal || ""

    const now = Date.now()
    const insert = sqlite.prepare(`
      INSERT INTO goals (date, weekly_goal, goal1, goal2, goal3, exciting_goal, eoy_goal, monthly_goal, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'local', ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        weekly_goal=excluded.weekly_goal,
        goal1=excluded.goal1,
        goal2=excluded.goal2,
        goal3=excluded.goal3,
        exciting_goal=excluded.exciting_goal,
        eoy_goal=excluded.eoy_goal,
        monthly_goal=excluded.monthly_goal,
        source='local',
        updated_at=excluded.updated_at
    `)
    insert.run(
      date,
      weeklyGoal,
      goals[0] || "",
      goals[1] || "",
      goals[2] || "",
      excitingGoal,
      eoyGoal,
      monthlyGoal,
      now,
      now,
    )

    return Response.json({ ok: true })
  } catch (e) {
    console.error("/api/local/goals POST error", e)
    return new Response(JSON.stringify({ error: "Failed to write local goals" }), { status: 500 })
  }
}
