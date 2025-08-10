CREATE TABLE `block_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`minute_index` integer NOT NULL,
	`action` text NOT NULL,
	`payload` text,
	`created_at` integer DEFAULT (strftime('%s','now')*1000)
);
--> statement-breakpoint
CREATE TABLE `blocks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`minute_index` integer NOT NULL,
	`task_name` text,
	`is_pinned` integer DEFAULT false NOT NULL,
	`status` text,
	`label_override` text,
	`moved_from_minute` integer,
	`created_at` integer DEFAULT (strftime('%s','now')*1000),
	`updated_at` integer DEFAULT (strftime('%s','now')*1000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `blocks_date_minute_idx` ON `blocks` (`date`,`minute_index`);--> statement-breakpoint
CREATE INDEX `blocks_date_idx` ON `blocks` (`date`);--> statement-breakpoint
CREATE INDEX `blocks_status_idx` ON `blocks` (`date`,`status`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_goals` (
	`date` text PRIMARY KEY NOT NULL,
	`weekly_goal` text,
	`goal1` text,
	`goal2` text,
	`goal3` text,
	`exciting_goal` text,
	`eoy_goal` text,
	`monthly_goal` text,
	`source` text,
	`created_at` integer DEFAULT (strftime('%s','now')*1000),
	`updated_at` integer DEFAULT (strftime('%s','now')*1000)
);
--> statement-breakpoint
INSERT INTO `__new_goals`("date", "weekly_goal", "goal1", "goal2", "goal3", "exciting_goal", "eoy_goal", "monthly_goal", "source", "created_at", "updated_at") SELECT "date", "weekly_goal", "goal1", "goal2", "goal3", "exciting_goal", "eoy_goal", "monthly_goal", "source", "created_at", "updated_at" FROM `goals`;--> statement-breakpoint
DROP TABLE `goals`;--> statement-breakpoint
ALTER TABLE `__new_goals` RENAME TO `goals`;--> statement-breakpoint
PRAGMA foreign_keys=ON;