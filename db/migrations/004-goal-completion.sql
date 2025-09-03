-- Add goal completion tracking fields to goals table
ALTER TABLE goals ADD COLUMN weekly_goal_completed INTEGER DEFAULT 0;
ALTER TABLE goals ADD COLUMN goal1_completed INTEGER DEFAULT 0;  
ALTER TABLE goals ADD COLUMN goal2_completed INTEGER DEFAULT 0;
ALTER TABLE goals ADD COLUMN goal3_completed INTEGER DEFAULT 0;
ALTER TABLE goals ADD COLUMN exciting_goal_completed INTEGER DEFAULT 0;
ALTER TABLE goals ADD COLUMN eoy_goal_completed INTEGER DEFAULT 0;
ALTER TABLE goals ADD COLUMN monthly_goal_completed INTEGER DEFAULT 0;