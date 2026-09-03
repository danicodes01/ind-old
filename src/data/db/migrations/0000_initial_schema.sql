CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer DEFAULT 0 NOT NULL,
	`deleted_at` integer,
	`_sync_state` text DEFAULT 'local_only' NOT NULL,
	`_base_updated_at` integer,
	`_local_updated_at` integer NOT NULL,
	`name` text NOT NULL,
	`color_token` text NOT NULL,
	`currency` text NOT NULL,
	`base_pay_minor` integer,
	`pay_period` text NOT NULL,
	`pay_period_anchor` text,
	`week_starts_on` integer DEFAULT 0 NOT NULL,
	`day_start_hour` integer DEFAULT 0 NOT NULL,
	`overtime_daily_minutes` integer,
	`overtime_weekly_minutes` integer,
	`overtime_rate_basis_points` integer,
	`is_active` integer DEFAULT 1 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `jobs_sync_state_idx` ON `jobs` (`_sync_state`);--> statement-breakpoint
CREATE TABLE `local_account` (
	`id` integer PRIMARY KEY NOT NULL,
	`remote_user_id` text,
	`linked_at` integer
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`default_job_id` text,
	`locale_override` text,
	`pro_entitlement_cached` integer DEFAULT 0 NOT NULL,
	`pro_entitlement_checked_at` integer,
	FOREIGN KEY (`default_job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `shifts` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer DEFAULT 0 NOT NULL,
	`deleted_at` integer,
	`_sync_state` text DEFAULT 'local_only' NOT NULL,
	`_base_updated_at` integer,
	`_local_updated_at` integer NOT NULL,
	`job_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`work_date` text NOT NULL,
	`tz` text NOT NULL,
	`break_minutes` integer DEFAULT 0 NOT NULL,
	`pay_rate_minor_override` integer,
	`note` text,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `shifts_job_idx` ON `shifts` (`job_id`);--> statement-breakpoint
CREATE INDEX `shifts_work_date_idx` ON `shifts` (`work_date`);--> statement-breakpoint
CREATE INDEX `shifts_started_at_idx` ON `shifts` (`started_at`);--> statement-breakpoint
CREATE INDEX `shifts_sync_state_idx` ON `shifts` (`_sync_state`);--> statement-breakpoint
CREATE TABLE `sync_conflicts` (
	`id` text PRIMARY KEY NOT NULL,
	`table_name` text NOT NULL,
	`row_id` text NOT NULL,
	`losing_json` text NOT NULL,
	`detected_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_state` (
	`table_name` text PRIMARY KEY NOT NULL,
	`cursor_updated_at` integer,
	`cursor_id` text,
	`last_pulled_at` integer,
	`last_pushed_at` integer
);
--> statement-breakpoint
CREATE TABLE `tip_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer DEFAULT 0 NOT NULL,
	`deleted_at` integer,
	`_sync_state` text DEFAULT 'local_only' NOT NULL,
	`_base_updated_at` integer,
	`_local_updated_at` integer NOT NULL,
	`shift_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`note` text,
	FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tip_entries_shift_idx` ON `tip_entries` (`shift_id`);--> statement-breakpoint
CREATE INDEX `tip_entries_sync_state_idx` ON `tip_entries` (`_sync_state`);