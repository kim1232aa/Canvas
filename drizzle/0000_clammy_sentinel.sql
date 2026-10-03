CREATE TABLE `canvas_entries` (
	`kind` text NOT NULL,
	`id` text NOT NULL,
	`object_key` text NOT NULL,
	`summary` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`kind`, `id`)
);
--> statement-breakpoint
CREATE INDEX `idx_canvas_entries_kind_updated` ON `canvas_entries` (`kind`,`updated_at`);--> statement-breakpoint
CREATE TABLE `canvas_settings` (
	`field` text PRIMARY KEY NOT NULL,
	`encrypted_value` text NOT NULL
);
