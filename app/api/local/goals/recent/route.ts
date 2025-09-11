import { NextRequest } from "next/server"
import { sqlite } from "@/lib/db"

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const date = url.searchParams.get('date') || new Date().toISOString().slice(0, 10)
    
    // Look for most recent goals within the last 7 days that have content
    const searchDate = new Date(date)
    const results = []
    
    for (let i = 1; i <= 7; i++) {
      searchDate.setDate(searchDate.getDate() - 1)
      const searchDateStr = searchDate.toISOString().slice(0, 10)
      
      const row = sqlite.prepare(`
        SELECT * FROM goals 
        WHERE date = ? 
        AND (
          weekly_goal IS NOT NULL AND weekly_goal != '' OR
          goal1 IS NOT NULL AND goal1 != '' OR
          goal2 IS NOT NULL AND goal2 != '' OR
          goal3 IS NOT NULL AND goal3 != '' OR
          exciting_goal IS NOT NULL AND exciting_goal != '' OR
          eoy_goal IS NOT NULL AND eoy_goal != '' OR
          monthly_goal IS NOT NULL AND monthly_goal != ''
        )
      `).get(searchDateStr) as any
      
      if (row) {
        const json = {
          date: row.date,
          weeklyGoal: row.weekly_goal || "",
          goals: [row.goal1 || "", row.goal2 || "", row.goal3 || ""],
          excitingGoal: row.exciting_goal || "",
          eoyGoal: row.eoy_goal || "",
          monthlyGoal: row.monthly_goal || "",
          source: row.source || "local",
          daysAgo: i
        }
        
        return new Response(JSON.stringify(json), { 
          status: 200, 
          headers: { 'Content-Type': 'application/json' } 
        })
      }
    }
    
    // No goals found in the last 7 days
    return new Response(JSON.stringify({ 
      date,
      weeklyGoal: "",
      goals: ["", "", ""],
      excitingGoal: "",
      eoyGoal: "",
      monthlyGoal: "",
      source: "local",
      daysAgo: null
    }), { 
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