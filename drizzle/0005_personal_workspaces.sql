CREATE TABLE `workspaces` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_slug_unique` ON `workspaces` (`slug`);
--> statement-breakpoint
CREATE TABLE `workspace_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` integer NOT NULL,
	`auth_user_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'owner' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_members_workspace_auth_user_unique` ON `workspace_members` (`workspace_id`,`auth_user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_members_auth_user_unique` ON `workspace_members` (`auth_user_id`);
