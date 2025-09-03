import { NextRequest } from "next/server"
import { sqlite } from "@/lib/db"

export async function GET(req: NextRequest) {
  try {
    // Get the most recent note that has content
    const row = sqlite.prepare(`
      SELECT * FROM user_notes 
      WHERE content IS NOT NULL AND content != '' 
      ORDER BY date DESC 
      LIMIT 1
    `).get() as any
    
    if (!row) {
      return new Response(JSON.stringify({ 
        date: null,
        content: "",
        createdAt: null,
        updatedAt: null,
      }), { 
        status: 200, 
        headers: { 'Content-Type': 'application/json' } 
      })
    }
    
    const json = {
      date: row.date,
      content: row.content || "",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
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