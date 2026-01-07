# Notion Time Logging Plan - Plan vs Reality Tracking

**Created:** 2026-01-07
**Status:** Design Complete - Ready for Implementation

## Project Overview

Enhance TrackerWorks to sync time block data (plan vs reality) with Notion in real-time, supporting flexible granularity (1/3/30-minute modes) and hierarchical task structures.

## Current State

### Existing Notion Integration

TrackerWorks already has working Notion integration:

**Connected Databases:**
1. **Daily Ritual Database** (`1edd6707-fb13-8012-a386-000b3bfa7427`)
   - One page per day
   - Properties: Date, Weekly Goal, Goal 1, Goal 2, Goal 3
   - **Direction:** Pull FROM Notion → TrackerWorks

2. **Task Calendar Database** (`1eed6707-fb13-80e7-b06e-000b4e2ed93c`)
   - Task inventory
   - Properties: Title, Status, Priority, Tags, Due Date, Description
   - **Direction:** Pull FROM Notion → TrackerWorks

**Credentials Location:**
- `.env.local`: Contains API key and database IDs
- Local SQLite DB: Stores user settings with Notion credentials
- Priority: Database credentials > Environment variables

### Current Gap

❌ **No write-back capability** - App pulls tasks from Notion but doesn't log what actually happened
❌ **No plan vs reality tracking** - Can't compare scheduled vs actual time usage
❌ **No time block history** - Completed blocks aren't persisted to Notion

## User Requirements

### From User Discussion

**Question 1: Where should we write the time log data in Notion?**

**Answer:**
> "Can we use a relational database so that, for example, every single day will have a schedule breaking down into three minutes, sometimes into 10 minutes, and sometimes into 30 minutes? We want to have the time blocks of different sizes, but simultaneously we need to fill in the whole day's schedule with plan and reality tracking. And we do have tasks already existing in the task calendar, and it's about sometimes the task is not planned, but they pop up right now. All the time blocks are not connected with either task. I think we need to think more about the holistic picture of this. Like the Star Wars, we want to achieve and the plan better."

**Interpretation:**
- Need relational database structure
- Support variable time block sizes (1/3/10/30 minutes)
- Track full day's schedule
- Handle both planned tasks and unexpected pop-ups
- Holistic, comprehensive tracking system

---

**Question 2: What granularity should we use for logging?**

**Answer:**
> "both 3min, 10min, 30min, depending on the user's behavior, all 3min might be too intense, sometimes they define a 30 min task and then go into 3min for sub-tasks. for example one 30 min big task user decide, then go to 3min mode and do 1 subtask per 3 min, maybe rest for 2-mins, so get 8 subtasks done for 30 min"

**Interpretation:**
- Support all granularities: 1/3/10/30 minutes
- Hierarchical structure: 30-min parent → 3-min children
- Use case: Big task (30min) breaks down into subtasks (3min each)
- Example: 30-min block contains 8× 3-min subtasks + breaks

---

**Question 3: When should we sync to Notion?**

**Answer:**
> "Real-time (on completion)"

**Interpretation:**
- Sync immediately when time block completes
- No batching or delayed syncing
- Write to Notion as soon as user responds to progress check

## Proposed Solution

### Architecture: Three-Database System

```
┌─────────────────────┐
│  Daily Ritual DB    │ ← Existing
│  (Date Pages)       │
│  - Weekly Goal      │
│  - 3 Daily Goals    │
└──────────┬──────────┘
           │
           │ (Relation)
           │
┌──────────▼──────────────────────┐
│  Time Blocks Log DB (NEW)       │ ← Create This
│  - Plan vs Reality              │
│  - Hierarchical Structure       │
│  - All Granularities            │
└──────────┬──────────────────────┘
           │
           │ (Relation)
           │
┌──────────▼──────────┐
│  Task Calendar DB   │ ← Existing
│  (Task Inventory)   │
│  - All Tasks        │
└─────────────────────┘
```

### New Database: Time Blocks Log

**Purpose:** Track every time block with plan vs reality data

**Properties:**

| Property Name | Type | Description |
|--------------|------|-------------|
| **Title** | Title | Auto-generated: "2026-01-07 10:00 AM (30min)" |
| **Date** | Date | Which day (no time) |
| **Block Start** | Date | Exact start time with timestamp |
| **Block End** | Date | Exact end time with timestamp |
| **Block Duration** | Select | "1-minute", "3-minute", "10-minute", "30-minute" |
| **Granularity Mode** | Select | User's active mode: "micro (1min)", "detailed (3min)", "standard (30min)" |
| **Parent Block** | Relation | Link to parent Time Block (for hierarchical structure) |
| **Child Blocks** | Relation | Reverse relation - children of this block |
| **Task (Planned)** | Relation | Link to Task Calendar - what was scheduled |
| **Task Title (Planned)** | Text | Text of planned task (for custom/ad-hoc tasks) |
| **Task (Actual)** | Relation | Link to Task Calendar - what was actually done |
| **Task Title (Actual)** | Text | Text of actual task (for unplanned work) |
| **Status** | Select | "Planned", "In Progress", "Completed", "Disrupted", "Skipped", "Interrupted" |
| **Completion Response** | Select | "Done", "Still Doing", "Stick to Plan", "Timeout" |
| **Response Time (ms)** | Number | How long user took to respond to progress check |
| **Was Pinned** | Checkbox | Whether block was protected from rescheduling |
| **Is Active** | Checkbox | Currently running timer |
| **Goal Tags** | Multi-select | Which daily goals this relates to (Goal 1, Goal 2, Goal 3) |
| **Daily Ritual Page** | Relation | Link back to date page in Daily Ritual DB |
| **Voice Transcript** | Text | If user responded via voice |
| **Notes** | Rich Text | Additional context or comments |
| **Synced At** | Date | When this was written to Notion |
| **Created Time** | Created time | Auto |
| **Last Edited Time** | Last edited time | Auto |

### How It Works: Usage Scenarios

#### Scenario 1: Standard 30-Minute Planning

```
User action:
- Opens app in 30-minute mode
- Assigns "Write report" to 10:00-10:30 AM block
- Timer runs, user completes at 10:30
- Clicks "Done" in progress popup

Notion sync creates:
┌─────────────────────────────────┐
│ Time Block Entry                │
├─────────────────────────────────┤
│ Title: "2026-01-07 10:00 (30m)" │
│ Block Start: 10:00 AM           │
│ Block Duration: 30-minute       │
│ Task (Planned): "Write report"  │
│ Task (Actual): "Write report"   │
│ Status: Completed               │
│ Completion Response: Done       │
│ Daily Ritual Page: [2026-01-07] │
└─────────────────────────────────┘
```

#### Scenario 2: Hierarchical - 30min Parent with 3min Children

```
User action:
1. Plans "Write report" for 10:00-10:30 (30-min mode)
2. Switches to 3-min mode
3. Creates subtasks:
   - 10:00-10:03: "Outline structure"
   - 10:03-10:06: "Research data"
   - 10:06-10:09: "Write intro"
   - ... (continues for 30 minutes)

Notion sync creates:
┌─────────────────────────────────┐
│ PARENT Block                    │
├─────────────────────────────────┤
│ Title: "2026-01-07 10:00 (30m)" │
│ Block Duration: 30-minute       │
│ Task (Planned): "Write report"  │
│ Child Blocks: [10 children]     │
└─────────────────────────────────┘
         │
         ├──► ┌──────────────────────┐
         │    │ CHILD Block 1        │
         │    │ 10:00-10:03 (3min)   │
         │    │ Parent: [30min block]│
         │    │ Task: "Outline..."   │
         │    └──────────────────────┘
         │
         ├──► ┌──────────────────────┐
         │    │ CHILD Block 2        │
         │    │ 10:03-10:06 (3min)   │
         │    │ Task: "Research..."  │
         │    └──────────────────────┘
         │
         └──► ... (8 more children)
```

#### Scenario 3: Plan vs Reality - Disruption

```
User action:
- Planned: "Write report" at 10:00-10:30
- Actual: Urgent email arrives, switches task
- Timer popup asks what happened
- User clicks "Still Doing" and overrides to "Answer urgent email"

Notion sync creates:
┌────────────────────────────────────┐
│ Time Block Entry                   │
├────────────────────────────────────┤
│ Title: "2026-01-07 10:00 (30m)"    │
│ Task (Planned): "Write report"     │
│ Task Title (Actual): "Urgent email"│
│ Status: Disrupted                  │
│ Completion Response: Still Doing   │
│ Response Time: 3450ms              │
└────────────────────────────────────┘
```

#### Scenario 4: Unplanned Pop-up Task

```
User action:
- No task planned for 2:00-2:30 PM
- Ad-hoc task appears: "Fix bug"
- User manually assigns and completes

Notion sync creates:
┌─────────────────────────────────┐
│ Time Block Entry                │
├─────────────────────────────────┤
│ Title: "2026-01-07 14:00 (30m)" │
│ Task (Planned): [empty]         │
│ Task Title (Actual): "Fix bug"  │
│ Status: Completed               │
│ Notes: "Unplanned work"         │
└─────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Database Creation

**Task:** Create "Time Blocks Log" database in Notion

**Using:** Notion MCP integration (already configured)

**Steps:**
1. Use `mcp__notion__notion-create-database` tool
2. Set up all properties as specified above
3. Create relations to Daily Ritual DB and Task Calendar DB
4. Get database ID for configuration

**Deliverable:** New Notion database ready to receive time block data

---

### Phase 2: Environment Configuration

**Task:** Add database ID to app configuration

**Files to modify:**
- `.env.local` - Add `NOTION_TIME_BLOCKS_LOG_DB=<database-id>`
- `db/schema.ts` - Add `notion_time_blocks_db_id TEXT` to `user_settings` table
- `lib/notion.ts` - Add getter for time blocks DB ID

**Code changes:**
```typescript
// lib/notion.ts
export function getNotionCredentials() {
  const row = sqlite.prepare(`
    SELECT notion_token,
           notion_daily_ritual_db_id,
           notion_task_cal_db_id,
           notion_time_blocks_db_id
    FROM user_settings WHERE id = 1
  `).get() as any

  return {
    token: row?.notion_token || process.env.NOTION_API_KEY || "",
    dailyRitualDbId: row?.notion_daily_ritual_db_id || process.env.NOTION_DAILY_RITUAL_DB || "",
    taskCalDbId: row?.notion_task_cal_db_id || process.env.NOTION_TASK_CALENDAR_DB || "",
    timeBlocksDbId: row?.notion_time_blocks_db_id || process.env.NOTION_TIME_BLOCKS_LOG_DB || "",
  }
}
```

---

### Phase 3: API Route for Syncing

**Task:** Create endpoint to write time blocks to Notion

**New file:** `app/api/notion/time-blocks/sync/route.ts`

**Functionality:**
- Accepts time block data from frontend
- Creates Notion page in Time Blocks Log database
- Sets all properties (plan, actual, status, timing, etc.)
- Creates parent-child relations for hierarchical blocks
- Links to Daily Ritual date page
- Links to Task Calendar entries when applicable
- Returns Notion page ID for tracking

**Request payload:**
```typescript
interface TimeBlockSyncRequest {
  date: string                    // "2026-01-07"
  blockStartTime: string          // "10:00"
  blockEndTime: string            // "10:30"
  durationMinutes: number         // 1, 3, 10, or 30
  granularityMode: "1min" | "3min" | "30min"
  parentBlockNotionId?: string    // For hierarchical structure
  plannedTask?: {
    notionPageId?: string         // If from Task Calendar
    title: string
  }
  actualTask?: {
    notionPageId?: string
    title: string
  }
  status: "Completed" | "Disrupted" | "Skipped" | "Interrupted"
  completionResponse: "Done" | "Still Doing" | "Stick to Plan" | "Timeout"
  responseTimeMs?: number
  wasPinned: boolean
  goalTags: string[]              // ["Goal 1", "Goal 2", etc.]
  voiceTranscript?: string
  notes?: string
}
```

**Response:**
```typescript
interface TimeBlockSyncResponse {
  success: boolean
  notionPageId?: string
  error?: string
}
```

---

### Phase 4: Local Database Tracking

**Task:** Track sync status in local SQLite database

**Schema additions:**

```typescript
// db/schema.ts

// New table: notion_sync_queue
export const notionSyncQueue = sqliteTable("notion_sync_queue", {
  id: text("id").primaryKey(),
  blockId: text("block_id").notNull().references(() => timeBlocks.id),
  syncStatus: text("sync_status").notNull(), // "pending", "syncing", "success", "failed"
  notionPageId: text("notion_page_id"),
  syncAttempts: integer("sync_attempts").default(0),
  lastError: text("last_error"),
  createdAt: integer("created_at"),
  syncedAt: integer("synced_at"),
})

// Update time_blocks table
export const timeBlocks = sqliteTable("time_blocks", {
  // ... existing fields ...
  notionPageId: text("notion_page_id"),        // Store Notion page ID after sync
  notionSyncedAt: integer("notion_synced_at"), // When synced
})
```

**Functionality:**
- Queue blocks for syncing
- Retry failed syncs
- Store Notion page IDs locally
- Track sync status per block

---

### Phase 5: Frontend Integration

**Task:** Integrate sync calls into main TimeTracker component

**File to modify:** `app/page.tsx`

**Integration points:**

**1. On Progress Check Response:**
```typescript
// In handleProgressResponse function (around line 1800)
const handleProgressResponse = async (responseType: string) => {
  // ... existing completion logic ...

  // NEW: Sync to Notion
  if (currentBlock) {
    const syncData = {
      date: formatDateYYYYMMDD(new Date()),
      blockStartTime: currentBlock.startTime,
      blockEndTime: currentBlock.endTime,
      durationMinutes: blockDurationMinutes,
      granularityMode: blockDurationMinutes === 30 ? "30min" :
                       blockDurationMinutes === 3 ? "3min" : "1min",
      plannedTask: {
        title: currentBlock.task?.title || "",
        notionPageId: currentBlock.task?.notionPageId,
      },
      actualTask: {
        title: responseType === "still_doing" ? overrideTitle : currentBlock.task?.title,
      },
      status: responseType === "done" ? "Completed" : "Disrupted",
      completionResponse: responseType,
      responseTimeMs: Date.now() - popupStartTime,
      wasPinned: currentBlock.isPinned,
      goalTags: currentBlock.goal ? [currentBlock.goal.label] : [],
    }

    await fetch("/api/notion/time-blocks/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(syncData),
    })
  }
}
```

**2. On Mode Switch (Hierarchical Structure):**
```typescript
// When switching from 30min → 3min mode
// Create parent-child relationships

if (previousMode === "30min" && newMode === "3min") {
  // Get all 3-min blocks that fit within a 30-min parent
  const parentBlocks = get30MinParents(currentDate)

  for (const parentBlock of parentBlocks) {
    if (parentBlock.notionPageId) {
      // Sync child blocks with parent reference
      const childBlocks = get3MinChildren(parentBlock)
      for (const child of childBlocks) {
        await syncChildBlock(child, parentBlock.notionPageId)
      }
    }
  }
}
```

**3. Background Sync for Failed Blocks:**
```typescript
// Periodic retry of failed syncs
useEffect(() => {
  const interval = setInterval(async () => {
    const response = await fetch("/api/local/notion-sync/retry-failed")
    // Retry failed syncs in background
  }, 60000) // Every minute

  return () => clearInterval(interval)
}, [])
```

---

### Phase 6: UI Enhancements

**Task:** Add visual indicators for sync status

**Components to update:**

**1. Time Block Cards** - Show sync status
```tsx
{/* In TimeBlockCard component */}
{block.notionSyncedAt && (
  <div className="text-xs text-green-500 flex items-center gap-1">
    <CheckIcon className="w-3 h-3" />
    Synced to Notion
  </div>
)}

{block.syncStatus === "pending" && (
  <div className="text-xs text-yellow-500 flex items-center gap-1">
    <ClockIcon className="w-3 h-3" />
    Syncing...
  </div>
)}
```

**2. Settings Panel** - Notion Time Blocks DB configuration
```tsx
// In components/notion-settings.tsx
<Input
  placeholder="Time Blocks Log Database ID"
  value={timeBlocksDbId}
  onChange={(e) => setTimeBlocksDbId(e.target.value)}
/>
```

**3. Sync Status Dashboard** (Optional)
- Show sync statistics
- Failed sync count
- Manual retry button
- View synced blocks in Notion

---

### Phase 7: Testing Checklist

**Unit Tests:**
- [ ] API route handles all time block scenarios
- [ ] Parent-child relationships created correctly
- [ ] Plan vs reality data captured accurately
- [ ] Error handling for failed API calls
- [ ] Retry logic for failed syncs

**Integration Tests:**
- [ ] 30-minute block syncs with all properties
- [ ] 3-minute blocks sync as children of 30-min parents
- [ ] Mode switching maintains hierarchical structure
- [ ] Disrupted blocks show correct plan vs actual
- [ ] Unplanned tasks sync with empty plan field
- [ ] Voice transcripts captured correctly
- [ ] Goal tags linked properly

**E2E Tests:**
- [ ] Complete a time block → check Notion
- [ ] Switch modes → verify parent-child in Notion
- [ ] Disrupt a block → verify plan vs actual in Notion
- [ ] Network failure → verify retry works
- [ ] Daily view in Notion shows full schedule

**Manual Testing:**
- [ ] Open Notion, navigate to date page
- [ ] Verify all time blocks appear as relations
- [ ] Check Time Blocks Log for detailed entries
- [ ] Confirm parent-child structure visible
- [ ] Test plan vs reality comparison
- [ ] Verify real-time sync (< 5 second delay)

## Technical Considerations

### API Rate Limits

**Notion API Limits:**
- 3 requests per second
- ~1000 requests per 5 minutes

**Our Usage:**
- 3-min mode: ~480 blocks/day = ~480 API calls
- Real-time sync: Spread across 16 active hours
- Average: ~30 syncs/hour = 0.5/minute (well within limits)

**Mitigation:**
- Queue syncs with rate limiting
- Batch child blocks when possible
- Retry with exponential backoff

### Data Privacy

- All data stored locally first (SQLite)
- Notion sync is one-way (app → Notion)
- No sensitive data in plain text
- User controls what syncs via settings

### Performance

**Optimization strategies:**
- Debounce rapid mode switches (don't sync intermediate states)
- Cache Daily Ritual page lookups
- Batch child block creation
- Background worker for retry queue

### Error Handling

**Scenarios:**
1. **Network offline** → Queue locally, retry when online
2. **Invalid credentials** → Show error, prompt re-auth
3. **Database not found** → Guide user to create in settings
4. **Rate limit exceeded** → Exponential backoff, queue

**User notifications:**
- Toast on successful sync
- Persistent warning on failed syncs
- Manual retry button in settings

## Future Enhancements

### Phase 2 Features (Post-MVP)

1. **Bi-directional Sync**
   - Pull time blocks FROM Notion (for multi-device)
   - Conflict resolution

2. **Analytics Dashboard in Notion**
   - Daily completion rate
   - Plan accuracy percentage
   - Most disruptive times of day
   - Goal progress tracking

3. **Calendar Integration**
   - Sync with Google/Outlook calendars
   - Two-way event sync
   - Meeting blocks auto-populate

4. **Templates & Presets**
   - Save common schedules
   - Morning/afternoon routines
   - Import from Notion template pages

5. **AI Insights**
   - Predict task duration based on history
   - Suggest optimal scheduling
   - Identify productivity patterns

## Success Metrics

### MVP Success Criteria

✅ **Functional:**
- [ ] Time blocks sync to Notion within 5 seconds
- [ ] Plan vs reality data accurately captured
- [ ] Hierarchical structure (30min → 3min) works
- [ ] All three granularities (1/3/30min) supported
- [ ] Zero data loss (all blocks eventually sync)

✅ **User Experience:**
- [ ] No noticeable UI lag when syncing
- [ ] Clear sync status indicators
- [ ] Easy Notion setup (< 2 minutes)
- [ ] Helpful error messages

✅ **Reliability:**
- [ ] 99% sync success rate
- [ ] Failed syncs retry automatically
- [ ] Works offline (queues for later)

## Implementation Timeline

**Phase 1-2:** Database setup & configuration (1-2 hours)
**Phase 3-4:** API route & local tracking (2-3 hours)
**Phase 5:** Frontend integration (3-4 hours)
**Phase 6:** UI enhancements (1-2 hours)
**Phase 7:** Testing & refinement (2-3 hours)

**Total estimated time:** 10-15 hours

## Decision Log

### Key Design Decisions

1. **Why separate Time Blocks Log database?**
   - Keeps Daily Ritual pages clean
   - Enables powerful querying and analytics
   - Supports unlimited time blocks per day
   - Better relational structure

2. **Why real-time sync instead of batching?**
   - User wants immediate feedback
   - Reduces risk of data loss
   - Enables multi-device in future
   - API limits are not a concern

3. **Why hierarchical parent-child structure?**
   - Matches user mental model (big task → subtasks)
   - Preserves context when switching modes
   - Enables aggregated views (30min summary)
   - Supports flexible planning strategies

4. **Why store both notionPageId and task title?**
   - Not all tasks come from Task Calendar
   - Ad-hoc tasks need titles
   - Redundancy aids debugging
   - Faster display (no API lookup needed)

## Appendix

### Existing Codebase Context

**Key Files:**
- `app/page.tsx` - Main TimeTracker component (3,147 lines)
- `lib/notion.ts` - Notion client & helpers
- `db/schema.ts` - Local database schema
- `components/notion-tasks.tsx` - Task selector UI
- `components/progress-check-popup.tsx` - Completion popup

**Existing Notion Integration:**
- API routes: `app/api/notion/daily-ritual/`, `app/api/notion/task-calendar/`
- Pull data only (no writes)
- Uses Notion SDK v5.4.0
- API version: 2025-09-03

**Local Database:**
- SQLite with Better-SQLite3
- Drizzle ORM
- 26+ tables with rich relations
- Location: `data/app.db`

### Notion Database URLs

After creation, databases will be accessible at:
- Time Blocks Log: `https://notion.so/<workspace>/<database-id>`
- Can be embedded in Daily Ritual pages as linked databases
- Filterable by date, status, goals, etc.

### Example Notion Queries

**View 1: Today's Schedule**
```
Filter: Date = Today
Sort: Block Start (ascending)
Group by: Granularity Mode
```

**View 2: Plan vs Reality Mismatches**
```
Filter: Status = Disrupted OR Task (Planned) ≠ Task (Actual)
Sort: Date (descending)
```

**View 3: Goal Progress**
```
Filter: Goal Tags contains "Goal 1"
Group by: Status
Calculate: % Completed
```

---

## Next Steps

1. **Get user confirmation** on this plan
2. **Create Time Blocks Log database** in Notion
3. **Begin Phase 1 implementation**
4. **Test with single time block** before full rollout
5. **Iterate based on real usage**

---

**Questions or concerns?** Let's discuss before implementation begins.
