CREATE TABLE `account_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`external_key` text NOT NULL,
	`account_id` integer NOT NULL,
	`institution_name` text NOT NULL,
	`display_name` text NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_links_external_key_unique` ON `account_links` (`external_key`);--> statement-breakpoint
CREATE TABLE `account_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`day` text NOT NULL,
	`captured_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`balance_current` integer NOT NULL,
	`is_asset` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_snapshots_account_day_unique` ON `account_snapshots` (`account_id`,`day`);--> statement-breakpoint
CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`institution_id` integer NOT NULL,
	`external_ref` text,
	`name` text NOT NULL,
	`mask` text,
	`type` text NOT NULL,
	`subtype` text,
	`balance_current` integer DEFAULT 0 NOT NULL,
	`balance_available` integer,
	`is_asset` integer DEFAULT true NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_external_ref_unique` ON `accounts` (`external_ref`);--> statement-breakpoint
CREATE TABLE `budgets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`month` text NOT NULL,
	`category` text NOT NULL,
	`amount` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `budgets_month_category_unique` ON `budgets` (`month`,`category`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`icon` text,
	`is_predefined` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_unique` ON `categories` (`name`);--> statement-breakpoint
CREATE TABLE `connections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`institution_name` text NOT NULL,
	`provider` text NOT NULL,
	`access_token` text,
	`item_id` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`transactions_cursor` text,
	`is_encrypted` integer DEFAULT false NOT NULL,
	`last_sync_at` text,
	`last_sync_status` text,
	`last_sync_error` text
);
--> statement-breakpoint
CREATE TABLE `institutions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`provider` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`plaid_institution_id` text,
	`last_sync_at` text
);
--> statement-breakpoint
CREATE TABLE `merchant_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`merchant_key` text NOT NULL,
	`label` text NOT NULL,
	`category` text NOT NULL,
	`is_transfer` integer DEFAULT false NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `merchant_rules_merchant_key_unique` ON `merchant_rules` (`merchant_key`);--> statement-breakpoint
CREATE TABLE `snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`month` text NOT NULL,
	`assets` integer NOT NULL,
	`liabilities` integer NOT NULL,
	`net_worth` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `snapshots_month_unique` ON `snapshots` (`month`);--> statement-breakpoint
CREATE TABLE `transaction_splits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`transaction_id` integer NOT NULL,
	`category` text NOT NULL,
	`amount` integer NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`external_id` text,
	`posted_at` text NOT NULL,
	`name` text NOT NULL,
	`merchant` text,
	`amount` integer NOT NULL,
	`category` text,
	`pending` integer DEFAULT false NOT NULL,
	`notes` text,
	`category_override` text,
	`is_transfer` integer DEFAULT false NOT NULL,
	`review_state` text DEFAULT 'none' NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
