# Notion Goals Sync Architecture

This document explains how Goal 1, 2, 3 are synced between the app and Notion.

## Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           NOTION DATABASES                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────┐         ┌─────────────────────────────┐   │
│  │   Daily Ritual DB       │         │    Task Calendar DB          │   │
│  │                         │         │                              │   │
│  │  - date (title)         │         │  - Task Plan (title)         │   │
│  │  - ✅Goal 1 ──────────────────────────> (relation to tasks)      │   │
│  │  - ✅Goal 2 ──────────────────────────> (relation to tasks)      │   │
│  │  - ✅Goal 3 ──────────────────────────> (relation to tasks)      │   │
│  │  - Weekly Goal          │         │  - Parent item (self-rel)    │   │
│  │                         │         │  - Sub-item (self-rel)       │   │
│  └─────────────────────────┘         │  - Status                    │   │
│                                      └─────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Loading Goals (App Startup)

```
┌──────────────────┐     GET /api/goals?date=YYYY-MM-DD     ┌──────────────┐
│  Today's Focus   │ ─────────────────────────────────────> │  Notion API  │
│     Panel        │ <───────────────────────────────────── │              │
│                  │     { goals: [...], goalIds: [...] }   └──────────────┘
│                  │
│                  │     GET /api/local/goals?date=...      ┌──────────────┐
│                  │ ─────────────────────────────────────> │  Local SQLite│
│                  │ <───────────────────────────────────── │              │
│                  │     { goals: [...] }  (no goalIds!)    └──────────────┘
└──────────────────┘

Priority: Notion goals > Local goals (fallback if Notion empty)
```

### 2. Selecting a Goal from Task Calendar

```
User clicks 🗄️ icon → Opens Task Calendar picker → Selects a task

┌──────────────────┐     POST /api/goals                    ┌──────────────┐
│  Today's Focus   │ ─────────────────────────────────────> │  Notion API  │
│     Panel        │     { date, goalIndex, goalId }        │              │
│                  │                                        │  Updates:    │
│                  │ <───────────────────────────────────── │  ✅Goal X    │
│                  │     { goals, goalIds }                 │  relation    │
└──────────────────┘                                        └──────────────┘
        │
        │ Dispatches: 'goalTaskSelected' event
        │             'dailyGoalsUpdated' event
        ▼
┌──────────────────┐
│  Nested Todos    │  Listens for events, updates notionGoalIds
│     Panel        │
└──────────────────┘
```

### 3. Fetching Subtasks for Nested Todos Panel

```
┌──────────────────┐     GET /api/notion/task-calendar/subitems?parentId=X
│  Nested Todos    │ ─────────────────────────────────────────────────────>
│     Panel        │
│                  │     Notion queries: "Parent item" relation contains X
│                  │ <─────────────────────────────────────────────────────
│                  │     { items: [{ id, title, status, hasSubitems }] }
└──────────────────┘
```

## Key Files

| File | Purpose |
|------|---------|
| `components/daily-goals.tsx` | Today's Focus panel - displays & syncs goals |
| `components/nested-todos-panel.tsx` | Side panel - shows goals & subtasks |
| `app/api/goals/route.ts` | GET/POST goals from/to Notion Daily Ritual |
| `app/api/local/goals/route.ts` | GET/POST goals from/to local SQLite |
| `app/api/notion/task-calendar/subitems/route.ts` | CRUD for task subtasks |
| `lib/notion.ts` | Notion client & property name config |

## Environment Variables

```bash
# .env.local
NOTION_API_KEY=ntn_xxx
NOTION_DAILY_RITUAL_DB=<database-id>
NOTION_TASK_CALENDAR_DB=<database-id>

# Property name overrides (must match EXACTLY with Notion)
NOTION_DR_DATE_PROP=date（daily ritual object）
NOTION_DR_GOAL1_PROP=✅Goal 1
NOTION_DR_GOAL2_PROP=✅ Goal 2   # Note: space after ✅
NOTION_DR_GOAL3_PROP=✅ Goal 3   # Note: space after ✅
```

## State Management

### Today's Focus Panel (`daily-goals.tsx`)

```typescript
// Goal titles (displayed to user)
const [goals, setGoals] = useState<string[]>(["", "", ""])

// Notion page IDs for each goal (needed for subtask fetching)
const [goalIds, setGoalIds] = useState<(string | null)[]>([null, null, null])
```

### Nested Todos Panel (`nested-todos-panel.tsx`)

```typescript
// Goal titles
const [goals, setGoals] = useState<string[]>(["", "", ""])

// Notion task IDs (used to fetch subtasks)
const [notionGoalIds, setNotionGoalIds] = useState<NotionGoalIds>({
  goal1: null,
  goal2: null,
  goal3: null
})

// Tree structure: key = "goal1|null" for root, "goal1|<parentId>" for nested
const [tree, setTree] = useState<Record<string, ItemRow[]>>({})
```

## Event System

| Event | Dispatched By | Listened By | Payload |
|-------|---------------|-------------|---------|
| `dailyGoalsUpdated` | daily-goals.tsx | nested-todos-panel.tsx | `{ goals, goalIds }` |
| `goalTaskSelected` | daily-goals.tsx | nested-todos-panel.tsx | `{ goalKey, taskId, title }` |

## Common Issues & Fixes

### Issue: Goals disappear when syncing one goal

**Cause:** API response overwrites all goals, clearing local-only ones.

**Fix (2026-01-07):** Only update the specific goal that was synced:
```typescript
// Before (bug)
setGoals(data.goals)
setGoalIds(data.goalIds)

// After (fixed)
setGoalIds(prev => {
  const next = [...prev]
  next[goalIndex] = data.goalIds[goalIndex]
  return next
})
```

### Issue: Nested todos panel shows "Goal 1" instead of actual title

**Cause:** `notionGoalIds` are null, so subtasks can't be fetched.

**Check:**
1. Were goals selected via the 🗄️ database picker? (not manually typed)
2. Are the Notion property names exact matches in `.env.local`?
3. Check console for `[NestedTodosPanel] Setting notionGoalIds:` log

### Issue: Subtasks not loading

**Cause:** The task doesn't have subtasks, or "Parent item" relation not set.

**Check:**
1. In Notion Task Calendar, verify subtasks have "Parent item" set to the goal task
2. Check server logs for `/api/notion/task-calendar/subitems` response

## Database Schema

### Local SQLite (`goals` table)

```sql
CREATE TABLE goals (
  date TEXT PRIMARY KEY,
  weekly_goal TEXT,
  goal1 TEXT,           -- Title only, no ID!
  goal2 TEXT,
  goal3 TEXT,
  exciting_goal TEXT,
  eoy_goal TEXT,
  monthly_goal TEXT,
  source TEXT,
  created_at INTEGER,
  updated_at INTEGER
)
```

Note: Local DB stores **titles only**, not goalIds. GoalIds only come from Notion.

### Notion Daily Ritual Properties

| Property | Type | Purpose |
|----------|------|---------|
| `date（daily ritual object）` | Title | Date identifier (YYYY-MM-DD) |
| `✅Goal 1` | Relation → Task Calendar | First goal for the day |
| `✅ Goal 2` | Relation → Task Calendar | Second goal |
| `✅ Goal 3` | Relation → Task Calendar | Third goal |
| `Weekly Goal` | Rich Text | Weekly objective |

### Notion Task Calendar Properties

| Property | Type | Purpose |
|----------|------|---------|
| `Task Plan` | Title | Task name |
| `Status` | Status | Not Started / In Progress / Done |
| `Parent item` | Relation → Self | Links to parent task |
| `Sub-item` | Relation → Self | Links to child tasks |

## Debugging

### Console Logs to Check

```javascript
// In nested-todos-panel.tsx
[NestedTodosPanel] Loaded goals from Notion: { goals, goalIds, ... }
[NestedTodosPanel] Setting notionGoalIds: [id1, id2, id3]
[loadList] Loading goal1, parentId:null, notionGoalId:<id>
[loadList] Fetching Notion subitems for goal1 from parent <id>
[loadList] Got X subitems for goal1: { items: [...] }

// In daily-goals.tsx
Goal X synced to Notion: { goals, goalIds, ... }
```

### Server Logs to Check

```
findDailyRitualByDate: Found page for YYYY-MM-DD via configured property
[/api/goals] Date: YYYY-MM-DD
[/api/goals] Goal 1 IDs: [<id>] Property: ✅Goal 1
[/api/goals] Goal 2 IDs: [<id>] Property: ✅ Goal 2
[/api/goals] Goal 3 IDs: [<id>] Property: ✅ Goal 3
```

### API Testing

```javascript
// Check goals from Notion
fetch('/api/goals?date=2026-01-07').then(r => r.json()).then(console.log)

// Check subtasks for a goal
fetch('/api/notion/task-calendar/subitems?parentId=<goalId>').then(r => r.json()).then(console.log)
```
