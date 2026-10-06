CREATE TABLE `recordings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`audio_path` text NOT NULL,
	`duration_sec` real,
	`status` text DEFAULT 'uploaded' NOT NULL,
	`meeting_type` text,
	`error_message` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recordings_user_idx` ON `recordings` (`user_id`);--> statement-breakpoint
CREATE TABLE `summaries` (
	`recording_id` text PRIMARY KEY NOT NULL,
	`summary` text NOT NULL,
	`topics` text NOT NULL,
	`decisions` text NOT NULL,
	`action_items` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`recording_id`) REFERENCES `recordings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `turns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recording_id` text NOT NULL,
	`idx` integer NOT NULL,
	`speaker` text NOT NULL,
	`start` real NOT NULL,
	`end` real NOT NULL,
	`text` text NOT NULL,
	`confidence` real NOT NULL,
	`overlap` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`recording_id`) REFERENCES `recordings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `turns_recording_idx` ON `turns` (`recording_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);