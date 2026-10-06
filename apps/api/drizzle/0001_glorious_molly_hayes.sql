ALTER TABLE `turns` ADD `refined_text` text;--> statement-breakpoint
ALTER TABLE `turns` ADD `translation` text;--> statement-breakpoint
ALTER TABLE `turns` ADD `uncertain` integer DEFAULT false NOT NULL;