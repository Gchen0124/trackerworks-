import { NextRequest } from "next/server"
import { sqlite } from "@/lib/db"

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const date = url.searchParams.get('date') || new Date().toISOString().slice(0, 10)
    
    // Get yesterday's date
    const yesterday = new Date(date)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().slice(0, 10)
    
    // Get yesterday's goals
    const row = sqlite.prepare(`SELECT * FROM goals WHERE date = ?`).get(yesterdayStr) as any
    
    if (!row) {
      return new Response(JSON.stringify({ 
        date: yesterdayStr,
        weeklyGoal: "",
        goals: ["", "", ""],
        excitingGoal: "",
        eoyGoal: "",
        monthlyGoal: "",
        source: "local"
      }), { 
        status: 200, 
        headers: { 'Content-Type': 'application/json' } 
      })
    }
    
    const json = {
      date: yesterdayStr,
      weeklyGoal: row.weekly_goal || "",
      goals: [row.goal1 || "", row.goal2 || "", row.goal3 || ""],
      excitingGoal: row.exciting_goal || "",
      eoyGoal: row.eoy_goal || "",
      monthlyGoal: row.monthly_goal || "",
      source: row.source || "local"
    }
    
    return new Response(JSON.stringify(json), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    })
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: 'server_error', detail: String(e?.message || e) }), 
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}