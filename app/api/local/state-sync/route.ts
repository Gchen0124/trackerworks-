import { NextRequest, NextResponse } from "next/server"
import { stateSync } from "@/lib/migrations"

// Enhanced state synchronization endpoints
// These work alongside your existing APIs without breaking them

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const action = searchParams.get('action')
    const itemId = searchParams.get('itemId')
    
    switch (action) {
      case 'task-completion':
        if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 })
        const isCompleted = await stateSync.getTaskCompletion(itemId)
        return NextResponse.json({ itemId, isCompleted })
        
      case 'bulk-completions':
        const itemIds = searchParams.get('itemIds')?.split(',') || []
        const completions: Record<string, boolean> = {}
        for (const id of itemIds) {
          completions[id] = await stateSync.getTaskCompletion(id)
        }
        return NextResponse.json({ completions })
        
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (error) {
    console.error('State sync GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action } = body
    
    switch (action) {
      case 'task-completion':
        const { itemId, completed } = body
        if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 })
        await stateSync.setTaskCompletion(itemId, Boolean(completed))
        return NextResponse.json({ success: true })
        
      case 'progress-response':
        const { blockId, responseType, options = {} } = body
        if (!blockId || !responseType) {
          return NextResponse.json({ error: 'blockId and responseType required' }, { status: 400 })
        }
        await stateSync.logProgressResponse(blockId, responseType, options)
        return NextResponse.json({ success: true })
        
      case 'drag-operation':
        const { operation } = body
        if (!operation) return NextResponse.json({ error: 'operation required' }, { status: 400 })
        await stateSync.logDragOperation(operation)
        return NextResponse.json({ success: true })
        
      case 'bulk-completions':
        const { completions } = body
        if (!completions || typeof completions !== 'object') {
          return NextResponse.json({ error: 'completions object required' }, { status: 400 })
        }
        
        for (const [itemId, completed] of Object.entries(completions)) {
          await stateSync.setTaskCompletion(itemId, Boolean(completed))
        }
        return NextResponse.json({ success: true })
        
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (error) {
    console.error('State sync POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}