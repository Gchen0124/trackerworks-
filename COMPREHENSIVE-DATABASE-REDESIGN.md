# Comprehensive Database Redesign for TrackerWorks

## Executive Summary

This redesign addresses critical limitations in the current database architecture and prepares the system for advanced features including wearable integration, predictive analytics, and seamless Apple ecosystem synchronization.

## Current Architecture Analysis

### Design Caveats Identified:

1. **State Fragmentation**: 37+ useState calls in frontend not synchronized with database
2. **No Time-Series Data**: Missing historical tracking for behavioral analysis
3. **Monolithic Block Structure**: Single table trying to handle too many concerns
4. **Limited Predictive Capability**: No behavioral pattern storage
5. **No Wearable Integration**: Missing device connectivity infrastructure
6. **Apple Ecosystem Gap**: No bidirectional sync with Reminders/Calendar

## Proposed Database Architecture

### Core Time Tracking System

```sql
-- Enhanced time blocks with immutable history
CREATE TABLE time_blocks (
  id TEXT PRIMARY KEY, -- format: date|duration|startMin
  date TEXT NOT NULL,
  duration_min INTEGER NOT NULL,
  start_minute_index INTEGER NOT NULL,
  end_minute_index INTEGER NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s','now')*1000),
  updated_at INTEGER DEFAULT (strftime('%s','now')*1000)
);

-- Time block states (separate table for state tracking)
CREATE TABLE block_states (
  id TEXT PRIMARY KEY,
  block_id TEXT NOT NULL REFERENCES time_blocks(id),
  status TEXT NOT NULL, -- future|current|past|completed|disrupted|paused
  is_active BOOLEAN DEFAULT FALSE,
  is_completed BOOLEAN DEFAULT FALSE,
  is_pinned BOOLEAN DEFAULT FALSE,
  is_recently_moved BOOLEAN DEFAULT FALSE,
  started_at INTEGER,
  completed_at INTEGER,
  effective_from INTEGER DEFAULT (strftime('%s','now')*1000),
  effective_to INTEGER -- NULL for current state
);

-- Historical state changes for analytics
CREATE TABLE block_state_history (
  id TEXT PRIMARY KEY,
  block_id TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT,
  trigger_source TEXT, -- user|system|timer|wearable|prediction
  metadata TEXT, -- JSON for additional context
  changed_at INTEGER DEFAULT (strftime('%s','now')*1000)
);
```

### Task & Goal Management

```sql
-- Enhanced tasks with predictive metadata
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL, -- custom|calendar|notion|apple_reminder|voice|ai_suggested
  priority INTEGER DEFAULT 0, -- 0-5 scale
  estimated_duration_min INTEGER,
  actual_duration_min INTEGER,
  energy_level_required INTEGER, -- 1-5 scale
  focus_type TEXT, -- deep|shallow|creative|administrative
  context_tags TEXT, -- JSON array: ["coding", "meeting", "email"]
  source_id TEXT, -- External ID from Calendar/Notion/Reminders
  source_metadata TEXT, -- JSON with sync data
  created_at INTEGER DEFAULT (strftime('%s','now')*1000),
  updated_at INTEGER DEFAULT (strftime('%s','now')*1000)
);

-- Task-block assignments with history
CREATE TABLE task_assignments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  block_id TEXT NOT NULL REFERENCES time_blocks(id),
  assignment_type TEXT NOT NULL, -- planned|in_progress|completed|rescheduled
  assigned_at INTEGER DEFAULT (strftime('%s','now')*1000),
  completed_at INTEGER,
  reschedule_reason TEXT,
  performance_rating INTEGER -- 1-5 user satisfaction
);

-- Enhanced goals with hierarchical structure
CREATE TABLE goals (
  id TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES goals(id),
  type TEXT NOT NULL, -- daily|weekly|monthly|quarterly|yearly|exciting|project
  title TEXT NOT NULL,
  description TEXT,
  target_date TEXT,
  start_date TEXT,
  completion_percentage INTEGER DEFAULT 0,
  priority INTEGER DEFAULT 0,
  color TEXT DEFAULT 'blue',
  created_at INTEGER DEFAULT (strftime('%s','now')*1000),
  updated_at INTEGER DEFAULT (strftime('%s','now')*1000)
);
```

### Behavioral Analytics & Predictive System

```sql
-- User behavior patterns for AI predictions
CREATE TABLE behavior_patterns (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default',
  pattern_type TEXT NOT NULL, -- productivity_curve|task_completion|interruption|energy_levels
  time_context TEXT NOT NULL, -- time_of_day|day_of_week|date_range
  context_data TEXT NOT NULL, -- JSON with pattern specifics
  confidence_score REAL DEFAULT 0.0, -- 0.0-1.0
  sample_size INTEGER DEFAULT 1,
  last_updated INTEGER DEFAULT (strftime('%s','now')*1000),
  created_at INTEGER DEFAULT (strftime('%s','now')*1000)
);

-- Productivity metrics by time periods
CREATE TABLE productivity_metrics (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  hour_of_day INTEGER NOT NULL, -- 0-23
  tasks_completed INTEGER DEFAULT 0,
  total_focus_time_min INTEGER DEFAULT 0,
  interruption_count INTEGER DEFAULT 0,
  energy_level_avg REAL DEFAULT 0.0, -- From wearable data
  mood_score INTEGER DEFAULT 0, -- 1-5 user reported
  environment_score INTEGER DEFAULT 0, -- noise, lighting from sensors
  calculated_at INTEGER DEFAULT (strftime('%s','now')*1000)
);

-- AI-generated task suggestions
CREATE TABLE task_suggestions (
  id TEXT PRIMARY KEY,
  suggested_block_id TEXT REFERENCES time_blocks(id),
  task_id TEXT REFERENCES tasks(id), -- If suggesting existing task
  suggested_title TEXT, -- If suggesting new task
  suggestion_type TEXT NOT NULL, -- reschedule|new_task|break|focus_block
  confidence_score REAL NOT NULL,
  reasoning TEXT, -- Human-readable explanation
  model_version TEXT NOT NULL,
  accepted_at INTEGER,
  rejected_at INTEGER,
  created_at INTEGER DEFAULT (strftime('%s','now')*1000)
);
```

### Wearable Device Integration

```sql
-- Connected devices registry
CREATE TABLE wearable_devices (
  id TEXT PRIMARY KEY,
  device_name TEXT NOT NULL,
  device_type TEXT NOT NULL, -- apple_watch|other_watch|glasses|earphones|ring|band
  brand TEXT NOT NULL, -- apple|samsung|fitbit|oura|whoop
  model TEXT,
  unique_identifier TEXT NOT NULL, -- Device UUID/Serial
  connection_status TEXT DEFAULT 'disconnected', -- connected|disconnected|syncing|error
  last_sync_at INTEGER,
  capabilities TEXT, -- JSON array: ["heart_rate", "steps", "sleep", "location"]
  sync_preferences TEXT, -- JSON configuration
  added_at INTEGER DEFAULT (strftime('%s','now')*1000),
  updated_at INTEGER DEFAULT (strftime('%s','now')*1000)
);

-- Real-time biometric data from wearables
CREATE TABLE biometric_data (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES wearable_devices(id),
  data_type TEXT NOT NULL, -- heart_rate|steps|sleep|stress|focus|location
  value REAL NOT NULL,
  unit TEXT NOT NULL, -- bpm|count|hours|percent|meters
  context TEXT, -- JSON with additional metadata
  recorded_at INTEGER NOT NULL, -- Device timestamp
  synced_at INTEGER DEFAULT (strftime('%s','now')*1000)
);

-- Activity recognition from wearables
CREATE TABLE activity_recognition (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES wearable_devices(id),
  activity_type TEXT NOT NULL, -- sitting|standing|walking|running|typing|meeting
  confidence_score REAL NOT NULL, -- 0.0-1.0
  start_time INTEGER NOT NULL,
  end_time INTEGER,
  context_data TEXT, -- JSON with additional sensors data
  created_at INTEGER DEFAULT (strftime('%s','now')*1000)
);

-- Focus/attention tracking from smart glasses/earphones
CREATE TABLE focus_sessions (
  id TEXT PRIMARY KEY,
  device_id TEXT REFERENCES wearable_devices(id),
  block_id TEXT REFERENCES time_blocks(id),
  task_id TEXT REFERENCES tasks(id),
  focus_score REAL, -- 0.0-1.0 from eye tracking/brain signals
  interruption_count INTEGER DEFAULT 0,
  attention_spans TEXT, -- JSON array of focused periods
  distractions TEXT, -- JSON array of distraction events
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  quality_rating INTEGER -- 1-5 user reported
);
```

### Apple Ecosystem Integration

```sql
-- Apple Reminders bidirectional sync
CREATE TABLE apple_reminders (
  id TEXT PRIMARY KEY,
  apple_id TEXT UNIQUE NOT NULL, -- Apple's internal ID
  list_name TEXT NOT NULL,
  title TEXT NOT NULL,
  notes TEXT,
  due_date INTEGER,
  priority INTEGER, -- 0-9 Apple scale
  completed_at INTEGER,
  apple_created_at INTEGER,
  apple_modified_at INTEGER,
  last_synced_at INTEGER,
  sync_status TEXT DEFAULT 'pending', -- synced|pending|conflict|error
  local_task_id TEXT REFERENCES tasks(id), -- Link to our task
  sync_direction TEXT, -- from_apple|to_apple|bidirectional
  created_at INTEGER DEFAULT (strftime('%s','now')*1000),
  updated_at INTEGER DEFAULT (strftime('%s','now')*1000)
);

-- Apple Calendar events sync
CREATE TABLE apple_calendar_events (
  id TEXT PRIMARY KEY,
  apple_event_id TEXT UNIQUE NOT NULL,
  calendar_name TEXT NOT NULL,
  title TEXT NOT NULL,
  location TEXT,
  notes TEXT,
  start_time INTEGER NOT NULL,
  end_time INTEGER NOT NULL,
  is_all_day BOOLEAN DEFAULT FALSE,
  recurrence_rule TEXT, -- RRULE string
  attendees TEXT, -- JSON array
  apple_created_at INTEGER,
  apple_modified_at INTEGER,
  last_synced_at INTEGER,
  sync_status TEXT DEFAULT 'pending',
  local_task_id TEXT REFERENCES tasks(id),
  auto_blocked_time_blocks TEXT, -- JSON array of block IDs
  created_at INTEGER DEFAULT (strftime('%s','now')*1000),
  updated_at INTEGER DEFAULT (strftime('%s','now')*1000)
);

-- Sync conflict resolution
CREATE TABLE sync_conflicts (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL, -- reminder|calendar_event|task
  entity_id TEXT NOT NULL,
  conflict_type TEXT NOT NULL, -- modification|deletion|creation
  local_data TEXT NOT NULL, -- JSON snapshot
  remote_data TEXT NOT NULL, -- JSON snapshot
  resolution_strategy TEXT, -- manual|prefer_local|prefer_remote|merge
  resolved_at INTEGER,
  resolved_by TEXT, -- user|system|auto
  created_at INTEGER DEFAULT (strftime('%s','now')*1000)
);

-- Apple ecosystem preferences
CREATE TABLE apple_sync_preferences (
  id TEXT PRIMARY KEY DEFAULT 'default',
  enabled BOOLEAN DEFAULT TRUE,
  sync_reminders BOOLEAN DEFAULT TRUE,
  sync_calendar BOOLEAN DEFAULT TRUE,
  reminder_lists TEXT, -- JSON array of list names to sync
  calendar_names TEXT, -- JSON array of calendar names to sync
  auto_create_time_blocks BOOLEAN DEFAULT TRUE,
  sync_frequency_min INTEGER DEFAULT 5, -- How often to sync
  conflict_resolution TEXT DEFAULT 'manual', -- manual|prefer_local|prefer_remote
  updated_at INTEGER DEFAULT (strftime('%s','now')*1000)
);
```

### User Context & Environment

```sql
-- Location context for task optimization
CREATE TABLE location_contexts (
  id TEXT PRIMARY KEY,
  location_name TEXT NOT NULL, -- home|office|cafe|coworking
  coordinates TEXT, -- JSON lat/lng
  wifi_ssid TEXT,
  noise_level INTEGER, -- 1-5 scale
  lighting_quality INTEGER, -- 1-5 scale
  optimal_task_types TEXT, -- JSON array
  productivity_multiplier REAL DEFAULT 1.0,
  created_at INTEGER DEFAULT (strftime('%s','now')*1000),
  updated_at INTEGER DEFAULT (strftime('%s','now')*1000)
);

-- Environmental sensors data
CREATE TABLE environmental_data (
  id TEXT PRIMARY KEY,
  location_id TEXT REFERENCES location_contexts(id),
  sensor_type TEXT NOT NULL, -- noise|light|temperature|air_quality
  value REAL NOT NULL,
  unit TEXT NOT NULL,
  recorded_at INTEGER DEFAULT (strftime('%s','now')*1000)
);

-- User preferences and adaptive settings
CREATE TABLE user_preferences (
  id TEXT PRIMARY KEY DEFAULT 'default',
  -- Time blocking preferences
  default_block_duration INTEGER DEFAULT 30,
  preferred_work_hours_start INTEGER DEFAULT 540, -- 9 AM in minutes
  preferred_work_hours_end INTEGER DEFAULT 1020, -- 5 PM in minutes
  break_frequency_min INTEGER DEFAULT 90,
  deep_work_threshold_min INTEGER DEFAULT 60,
  
  -- AI and prediction preferences
  enable_ai_suggestions BOOLEAN DEFAULT TRUE,
  ai_confidence_threshold REAL DEFAULT 0.7,
  auto_reschedule BOOLEAN DEFAULT FALSE,
  predictive_blocking BOOLEAN DEFAULT TRUE,
  
  -- Notification preferences
  enable_focus_reminders BOOLEAN DEFAULT TRUE,
  enable_break_suggestions BOOLEAN DEFAULT TRUE,
  enable_wearable_alerts BOOLEAN DEFAULT TRUE,
  quiet_hours_start INTEGER DEFAULT 1320, -- 10 PM
  quiet_hours_end INTEGER DEFAULT 420, -- 7 AM
  
  -- Integration preferences
  apple_ecosystem_sync BOOLEAN DEFAULT TRUE,
  wearable_integration BOOLEAN DEFAULT TRUE,
  voice_commands BOOLEAN DEFAULT TRUE,
  
  updated_at INTEGER DEFAULT (strftime('%s','now')*1000)
);
```

### Analytics & Reporting

```sql
-- Daily productivity reports
CREATE TABLE daily_reports (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  total_planned_blocks INTEGER,
  completed_blocks INTEGER,
  completion_rate REAL,
  total_focus_time_min INTEGER,
  average_task_duration REAL,
  interruption_count INTEGER,
  peak_productivity_hour INTEGER,
  energy_correlation REAL, -- Correlation with biometric data
  location_effectiveness TEXT, -- JSON with location performance
  top_distractions TEXT, -- JSON array
  achievements TEXT, -- JSON array of milestones
  generated_at INTEGER DEFAULT (strftime('%s','now')*1000)
);

-- Long-term trend analysis
CREATE TABLE trend_analysis (
  id TEXT PRIMARY KEY,
  analysis_type TEXT NOT NULL, -- weekly|monthly|quarterly
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  metrics TEXT NOT NULL, -- JSON with calculated metrics
  insights TEXT, -- AI-generated insights
  recommendations TEXT, -- JSON array of suggestions
  confidence_score REAL,
  generated_at INTEGER DEFAULT (strftime('%s','now')*1000)
);
```

## Migration Strategy

### Phase 1: Foundation (Immediate)
1. Extend existing schema with new tables
2. Implement gradual state sync from frontend
3. Add wearable device registration

### Phase 2: Apple Integration (Week 2-3)
1. Apple Reminders API integration
2. Calendar sync implementation
3. Conflict resolution system

### Phase 3: Predictive Analytics (Month 2)
1. Behavior pattern analysis
2. AI suggestion engine
3. Advanced productivity metrics

### Phase 4: Advanced Features (Month 3+)
1. Environmental context awareness
2. Advanced biometric correlations
3. Predictive time blocking

## Key Benefits

1. **Complete State Synchronization**: All frontend state backed by database
2. **Historical Analytics**: Full behavioral pattern analysis
3. **Predictive Intelligence**: AI-powered task scheduling and suggestions
4. **Seamless Apple Integration**: Two-way sync with Reminders and Calendar
5. **Wearable Intelligence**: Biometric-driven productivity optimization
6. **Context Awareness**: Location and environment-based task optimization
7. **Comprehensive Reporting**: Deep insights into productivity patterns

## Implementation Notes

- All timestamps in milliseconds for consistency
- JSON columns for flexible metadata storage
- Proper foreign key relationships for data integrity
- Indexed columns for performance
- Conflict resolution strategies for sync operations
- Privacy-first approach for biometric data