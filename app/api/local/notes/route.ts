import { NextRequest } from "next/server"
import { sqlite } from "@/lib/db"

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const date = url.searchParams.get('date') || new Date().toISOString().slice(0, 10) // Default to today YYYY-MM-DD
    
    const row = sqlite.prepare(`SELECT * FROM user_notes WHERE date = ?`).get(date) as any
    
    const json = {
      date,
      content: row?.content || "",
      createdAt: row?.created_at,
      updatedAt: row?.updated_at,
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const date = body?.date || new Date().toISOString().slice(0, 10) // Default to today YYYY-MM-DD
    const content = body?.content || ""
    
    // Use UPSERT (INSERT OR REPLACE) to handle both creation and updates
    sqlite.prepare(`
      INSERT OR REPLACE INTO user_notes (id, date, content, created_at, updated_at) 
      VALUES (?, ?, ?, 
        COALESCE((SELECT created_at FROM user_notes WHERE date = ?), strftime('%s','now')*1000),
        strftime('%s','now')*1000
      )
    `).run(`notes_${date}`, date, content, date)
    
    return new Response(JSON.stringify({ success: true, date, content }), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    })
  } catch (e: any) {
    console.error("Error saving note:", e)
    return new Response(
      JSON.stringify({ error: 'server_error', detail: String(e?.message || e) }), 
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}