CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer DEFAULT 0 NOT NULL,
	`deleted_at` integer,
	`_sync_state` text DEFAULT 'local_only' NOT NULL,
	`_base_updated_at` integer,
	`_local_updated_at` integer NOT NULL,
	`date` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`category` text,
	`job_id` text,
	`note` text,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `expenses_date_idx` ON `expenses` (`date`);--> statement-breakpoint
CREATE INDEX `expenses_job_idx` ON `expenses` (`job_id`);--> statement-breakpoint
CREATE INDEX `expenses_sync_state_idx` ON `expenses` (`_sync_state`);--> statement-breakpoint
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
	`withholds_tax` integer,
	`tips_covered` integer,
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
	`week_starts_on` integer DEFAULT 0 NOT NULL,
	`tax_enabled` integer DEFAULT 0 NOT NULL,
	`set_aside_percent_bp` integer,
	`tax_reminders_enabled` integer DEFAULT 0 NOT NULL,
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
	`status` text DEFAULT 'worked' NOT NULL,
	`scheduled_start_at` integer,
	`scheduled_end_at` integer,
	`started_at` integer,
	`ended_at` integer,
	`series_id` text,
	`work_date` text NOT NULL,
	`tz` text NOT NULL,
	`break_minutes` integer DEFAULT 0 NOT NULL,
	`pay_rate_minor_override` integer,
	`tips_cash_minor` integer DEFAULT 0 NOT NULL,
	`tips_card_minor` integer DEFAULT 0 NOT NULL,
	`tips_other_minor` integer DEFAULT 0 NOT NULL,
	`tip_out_minor` integer DEFAULT 0 NOT NULL,
	`note` text,
	`feeling` integer,
	`_external_event_id` text,
	`_external_calendar` text,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "shifts_has_a_time" CHECK("shifts"."scheduled_start_at" IS NOT NULL OR "shifts"."started_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX `shifts_job_idx` ON `shifts` (`job_id`);--> statement-breakpoint
CREATE INDEX `shifts_work_date_idx` ON `shifts` (`work_date`);--> statement-breakpoint
CREATE INDEX `shifts_status_idx` ON `shifts` (`status`);--> statement-breakpoint
CREATE INDEX `shifts_started_at_idx` ON `shifts` (`started_at`);--> statement-breakpoint
CREATE INDEX `shifts_series_idx` ON `shifts` (`series_id`);--> statement-breakpoint
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
