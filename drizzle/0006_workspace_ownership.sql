ALTER TABLE `institutions` ADD `workspace_id` integer;
--> statement-breakpoint
ALTER TABLE `accounts` ADD `workspace_id` integer;
--> statement-breakpoint
DROP INDEX `accounts_external_ref_unique`;
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_workspace_external_ref_unique` ON `accounts` (`workspace_id`,`external_ref`);
--> statement-breakpoint
ALTER TABLE `transactions` ADD `workspace_id` integer;
--> statement-breakpoint
ALTER TABLE `budgets` ADD `workspace_id` integer;
--> statement-breakpoint
DROP INDEX `budgets_month_category_unique`;
--> statement-breakpoint
CREATE UNIQUE INDEX `budgets_workspace_month_category_unique` ON `budgets` (`workspace_id`,`month`,`category`);
--> statement-breakpoint
ALTER TABLE `budget_templates` ADD `workspace_id` integer;
--> statement-breakpoint
DROP INDEX `budget_templates_category_unique`;
--> statement-breakpoint
CREATE UNIQUE INDEX `budget_templates_workspace_category_unique` ON `budget_templates` (`workspace_id`,`category`);
--> statement-breakpoint
ALTER TABLE `snapshots` ADD `workspace_id` integer;
--> statement-breakpoint
DROP INDEX `snapshots_month_unique`;
--> statement-breakpoint
CREATE UNIQUE INDEX `snapshots_workspace_month_unique` ON `snapshots` (`workspace_id`,`month`);
--> statement-breakpoint
ALTER TABLE `connections` ADD `workspace_id` integer;
--> statement-breakpoint
ALTER TABLE `merchant_rules` ADD `workspace_id` integer;
--> statement-breakpoint
DROP INDEX `merchant_rules_merchant_key_unique`;
--> statement-breakpoint
CREATE UNIQUE INDEX `merchant_rules_workspace_merchant_key_unique` ON `merchant_rules` (`workspace_id`,`merchant_key`);
--> statement-breakpoint
ALTER TABLE `account_links` ADD `workspace_id` integer;
--> statement-breakpoint
DROP INDEX `account_links_external_key_unique`;
--> statement-breakpoint
CREATE UNIQUE INDEX `account_links_workspace_external_key_unique` ON `account_links` (`workspace_id`,`external_key`);
