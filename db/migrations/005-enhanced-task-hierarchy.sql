-- Enhanced task hierarchy and features
ALTER TABLE breakdown_items ADD COLUMN depth_level INTEGER DEFAULT 0;
ALTER TABLE breakdown_items ADD COLUMN is_completed INTEGER DEFAULT 0;
ALTER TABLE breakdown_items ADD COLUMN priority INTEGER DEFAULT 1; -- 1=low, 2=medium, 3=high
ALTER TABLE breakdown_items ADD COLUMN due_date TEXT; -- ISO date string
ALTER TABLE breakdown_items ADD COLUMN tags TEXT; -- JSON array of tags
ALTER TABLE breakdown_items ADD COLUMN notes TEXT; -- Additional notes for task
ALTER TABLE breakdown_items ADD COLUMN assigned_to TEXT; -- Future: user assignment
ALTER TABLE breakdown_items ADD COLUMN estimated_hours REAL; -- More precise time estimates

-- Index for better query performance on hierarchical data
CREATE INDEX IF NOT EXISTS idx_breakdown_parent_goal ON breakdown_items(parent_id, goal_id);
CREATE INDEX IF NOT EXISTS idx_breakdown_depth ON breakdown_items(depth_level);
CREATE INDEX IF NOT EXISTS idx_breakdown_completion ON breakdown_items(is_completed);

-- Update existing records with proper depth levels
UPDATE breakdown_items SET depth_level = 0 WHERE parent_id IS NULL;

-- For existing child items, set depth_level = 1 (we'll handle deeper levels via triggers)
UPDATE breakdown_items SET depth_level = 1 WHERE parent_id IS NOT NULL AND depth_level = 0;