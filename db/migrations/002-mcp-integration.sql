-- MCP (Model Context Protocol) Integration Schema
-- This schema is separate from regular Notion API integration

-- MCP Server connections and status
CREATE TABLE mcp_connections (
  id TEXT PRIMARY KEY DEFAULT 'notion-mcp',
  server_name TEXT NOT NULL DEFAULT 'Notion MCP',
  server_url TEXT NOT NULL,
  server_type TEXT NOT NULL DEFAULT 'notion',
  status TEXT DEFAULT 'disconnected', -- connected|disconnected|error
  last_health_check INTEGER,
  capabilities TEXT, -- JSON array of supported operations
  auth_method TEXT DEFAULT 'server-token',
  auth_data TEXT, -- Encrypted auth credentials (JSON)
  created_at INTEGER DEFAULT (strftime('%s','now')*1000),
  updated_at INTEGER DEFAULT (strftime('%s','now')*1000)
);

-- MCP-specific Notion databases
CREATE TABLE mcp_notion_databases (
  id TEXT PRIMARY KEY,
  mcp_database_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  properties TEXT NOT NULL, -- JSON array of property names/types
  url TEXT,
  last_synced_at INTEGER,
  sync_enabled INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (strftime('%s','now')*1000),
  updated_at INTEGER DEFAULT (strftime('%s','now')*1000)
);

-- MCP-specific Notion tasks/pages
CREATE TABLE mcp_notion_tasks (
  id TEXT PRIMARY KEY,
  mcp_page_id TEXT UNIQUE NOT NULL,
  mcp_database_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT,
  priority TEXT,
  url TEXT,
  color TEXT DEFAULT 'bg-blue-500',
  tags TEXT, -- JSON array
  due_date TEXT,
  properties TEXT, -- JSON object with all Notion properties
  created_time TEXT,
  last_edited_time TEXT,
  last_synced_at INTEGER DEFAULT (strftime('%s','now')*1000),
  sync_status TEXT DEFAULT 'synced', -- synced|pending|error|conflict
  -- Link to local task system
  local_task_id TEXT REFERENCES tasks(id),
  -- Track if this came from MCP vs regular API
  source TEXT DEFAULT 'mcp',
  FOREIGN KEY (mcp_database_id) REFERENCES mcp_notion_databases(mcp_database_id)
);

-- MCP operation logs for debugging and monitoring
CREATE TABLE mcp_operation_logs (
  id TEXT PRIMARY KEY,
  connection_id TEXT DEFAULT 'notion-mcp',
  operation_type TEXT NOT NULL, -- query|create|update|delete|sync
  operation_data TEXT, -- JSON with request/response data
  status TEXT NOT NULL, -- success|error|timeout
  error_message TEXT,
  duration_ms INTEGER,
  created_at INTEGER DEFAULT (strftime('%s','now')*1000),
  FOREIGN KEY (connection_id) REFERENCES mcp_connections(id)
);

-- MCP sync mappings between local and remote entities
CREATE TABLE mcp_sync_mappings (
  id TEXT PRIMARY KEY,
  local_entity_type TEXT NOT NULL, -- task|time_block|goal
  local_entity_id TEXT NOT NULL,
  mcp_entity_type TEXT NOT NULL, -- page|database|block
  mcp_entity_id TEXT NOT NULL,
  sync_direction TEXT DEFAULT 'bidirectional', -- to_mcp|from_mcp|bidirectional
  last_synced_at INTEGER,
  sync_conflicts TEXT, -- JSON array of conflict details
  auto_resolve INTEGER DEFAULT 1, -- Auto-resolve conflicts
  created_at INTEGER DEFAULT (strftime('%s','now')*1000),
  updated_at INTEGER DEFAULT (strftime('%s','now')*1000)
);

-- MCP webhook events (if MCP server supports webhooks)
CREATE TABLE mcp_webhook_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL, -- page_updated|page_created|database_updated
  mcp_entity_id TEXT NOT NULL,
  event_data TEXT NOT NULL, -- JSON with event details
  processed INTEGER DEFAULT 0,
  processed_at INTEGER,
  error_message TEXT,
  received_at INTEGER DEFAULT (strftime('%s','now')*1000)
);

-- Indexes for performance
CREATE INDEX idx_mcp_tasks_database ON mcp_notion_tasks(mcp_database_id);
CREATE INDEX idx_mcp_tasks_sync_status ON mcp_notion_tasks(sync_status);
CREATE INDEX idx_mcp_tasks_synced_at ON mcp_notion_tasks(last_synced_at);
CREATE INDEX idx_mcp_operations_type ON mcp_operation_logs(operation_type);
CREATE INDEX idx_mcp_operations_status ON mcp_operation_logs(status);
CREATE INDEX idx_mcp_operations_created ON mcp_operation_logs(created_at);
CREATE INDEX idx_mcp_sync_mappings_local ON mcp_sync_mappings(local_entity_type, local_entity_id);
CREATE INDEX idx_mcp_sync_mappings_mcp ON mcp_sync_mappings(mcp_entity_type, mcp_entity_id);
CREATE INDEX idx_mcp_webhooks_processed ON mcp_webhook_events(processed);

-- Sample data for testing (remove in production)
INSERT INTO mcp_connections (server_url, status, capabilities) VALUES 
('http://localhost:3001/mcp/notion', 'disconnected', '["query", "create", "update", "list_databases"]');

INSERT INTO mcp_notion_databases (id, mcp_database_id, name, description, properties) VALUES 
('mcp-db-1', 'notion-db-123', 'MCP Test Database', 'Testing MCP integration', 
 '["Title", "Status", "Priority", "Due Date", "Tags"]');

-- Migration helper function
PRAGMA user_version = 2; -- Increment version for MCP schema