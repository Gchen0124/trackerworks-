const Database = require("better-sqlite3")
const fs = require("fs")
const path = require("path")

const defaultPath = process.env.LOCAL_SQLITE_PATH || path.resolve(process.cwd(), "data/app.db")

// Ensure data directory exists
const dir = path.dirname(defaultPath)
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true })
}

const sqlite = new Database(defaultPath)

async function runMigrations() {
  console.log('🚀 Initializing enhanced database schema...')
  
  try {
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
        console.log(`⏭️  Migration already applied: ${migrationId}`)
        continue // Skip already applied migrations
      }

      console.log(`🔄 Running migration: ${migrationId}`)
      
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

    console.log('')
    console.log('✅ Enhanced database schema ready!')
    console.log('')
    console.log('Next steps:')
    console.log('1. Your existing app will continue working exactly as before')
    console.log('2. Gradually adopt enhanced state hooks in components:')
    console.log('   - useTaskCompletions() for checkbox persistence')
    console.log('   - useProgressTracking() for popup analytics')
    console.log('   - useDragTracking() for drag operation history')
    console.log('3. Enable database sync per component with enableDatabaseSync: true')
    console.log('')
    console.log('The enhanced schema is now ready for gradual adoption!')
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error)
    process.exit(1)
  } finally {
    sqlite.close()
  }
}

runMigrations()