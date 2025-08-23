import { sqlite } from "./db"
import fs from "fs"
import path from "path"

// Simple migration system - runs once per migration
export async function runMigrations() {
  // Create migrations table if it doesn't exist
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id TEXT PRIMARY KEY,
      applied_at INTEGER DEFAULT (strftime('%s','now')*1000)
    );
  `)

  const migrationsDir = path.join(process.cwd(), "db/migrations")
  if (!fs.existsSync(migrationsDir)) {
    console.log("No migrations directory found")
    return
  }

  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort()

  for (const file of migrationFiles) {
    const migrationId = file.replace('.sql', '')
    
    // Check if migration already applied
    const existing = sqlite.prepare(`
      SELECT id FROM migrations WHERE id = ?
    `).get(migrationId)

    if (existing) {
      continue // Skip already applied migrations
    }

    console.log(`Running migration: ${migrationId}`)
    
    try {
      const migrationPath = path.join(migrationsDir, file)
      const sql = fs.readFileSync(migrationPath, 'utf8')
      
      // Execute migration in a transaction
      const transaction = sqlite.transaction(() => {
        sqlite.exec(sql)
        sqlite.prepare(`
          INSERT INTO migrations (id) VALUES (?)
        `).run(migrationId)
      })
      
      transaction()
      console.log(`✅ Applied migration: ${migrationId}`)
      
    } catch (error) {
      console.error(`❌ Migration failed: ${migrationId}`, error)
      throw error
    }
  }
}

// Helper functions for gradual state sync adoption
export const stateSync = {
  // Gradually replace localStorage checkbox state with database
  async getTaskCompletion(itemId: string): Promise<boolean> {
    const row = sqlite.prepare(`
      SELECT is_completed FROM task_completions WHERE item_id = ?
    `).get(itemId) as { is_completed: number } | undefined

    return row ? Boolean(row.is_completed) : false
  },

  async setTaskCompletion(itemId: string, completed: boolean) {
    sqlite.prepare(`
      INSERT OR REPLACE INTO task_completions (id, item_id, is_completed, completed_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      `completion-${itemId}`,
      itemId,
      completed ? 1 : 0,
      completed ? Date.now() : null,
      Date.now()
    )
  },

  // Track progress popup responses for analytics
  async logProgressResponse(blockId: string, responseType: 'done' | 'still_doing' | 'stick_to_plan' | 'timeout', options: {
    responseTimeMs?: number,
    overrideTitle?: string,
    voiceTranscript?: string,
    affectedBlockIds?: string[]
  } = {}) {
    sqlite.prepare(`
      INSERT INTO progress_responses 
      (id, block_id, response_type, response_time_ms, override_title, voice_transcript, cascading_effects, responded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `response-${blockId}-${Date.now()}`,
      blockId,
      responseType,
      options.responseTimeMs || null,
      options.overrideTitle || null,
      options.voiceTranscript || null,
      options.affectedBlockIds ? JSON.stringify(options.affectedBlockIds) : null,
      Date.now()
    )
  },

  // Log drag operations for debugging and analytics
  async logDragOperation(operation: {
    type: 'simple_move' | 'expand_fill' | 'bulk_move'
    sourceBlockId?: string
    targetBlockIds: string[]
    taskData: any
    affectedBlocks?: string[]
    wasExpandMode?: boolean
    pinnedBlocksHit?: string[]
  }) {
    sqlite.prepare(`
      INSERT INTO drag_operations 
      (id, operation_type, source_block_id, target_block_ids, task_data, affected_blocks, was_expand_mode, pinned_blocks_encountered, executed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `drag-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      operation.type,
      operation.sourceBlockId || null,
      JSON.stringify(operation.targetBlockIds),
      JSON.stringify(operation.taskData),
      JSON.stringify(operation.affectedBlocks || []),
      operation.wasExpandMode ? 1 : 0,
      JSON.stringify(operation.pinnedBlocksHit || []),
      Date.now()
    )
  }
}