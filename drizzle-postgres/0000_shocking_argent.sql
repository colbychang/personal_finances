CREATE TABLE "account_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer,
	"provider" text NOT NULL,
	"external_key" text NOT NULL,
	"connection_id" integer NOT NULL,
	"account_id" integer NOT NULL,
	"institution_name" text NOT NULL,
	"display_name" text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"day" text NOT NULL,
	"captured_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"balance_current" integer NOT NULL,
	"is_asset" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer,
	"institution_id" integer NOT NULL,
	"external_ref" text,
	"name" text NOT NULL,
	"mask" text,
	"type" text NOT NULL,
	"subtype" text,
	"balance_current" integer DEFAULT 0 NOT NULL,
	"balance_available" integer,
	"is_asset" boolean DEFAULT true NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer,
	"category" text NOT NULL,
	"amount" integer NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer,
	"month" text NOT NULL,
	"category" text NOT NULL,
	"amount" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"icon" text,
	"is_predefined" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer,
	"institution_name" text NOT NULL,
	"provider" text NOT NULL,
	"access_token" text,
	"item_id" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"transactions_cursor" text,
	"is_encrypted" boolean DEFAULT false NOT NULL,
	"last_sync_at" text,
	"last_sync_status" text,
	"last_sync_error" text
);
--> statement-breakpoint
CREATE TABLE "institutions" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer,
	"name" text NOT NULL,
	"provider" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"plaid_institution_id" text,
	"last_sync_at" text
);
--> statement-breakpoint
CREATE TABLE "merchant_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer,
	"merchant_key" text NOT NULL,
	"label" text NOT NULL,
	"category" text NOT NULL,
	"is_transfer" boolean DEFAULT false NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer,
	"month" text NOT NULL,
	"assets" integer NOT NULL,
	"liabilities" integer NOT NULL,
	"net_worth" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_splits" (
	"id" serial PRIMARY KEY NOT NULL,
	"transaction_id" integer NOT NULL,
	"category" text NOT NULL,
	"amount" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer,
	"account_id" integer NOT NULL,
	"external_id" text,
	"posted_at" text NOT NULL,
	"override_month" text,
	"name" text NOT NULL,
	"merchant" text,
	"amount" integer NOT NULL,
	"category" text,
	"pending" boolean DEFAULT false NOT NULL,
	"notes" text,
	"category_override" text,
	"is_transfer" boolean DEFAULT false NOT NULL,
	"is_excluded" boolean DEFAULT false NOT NULL,
	"review_state" text DEFAULT 'none' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"auth_user_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'owner' NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "workspaces_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "account_links" ADD CONSTRAINT "account_links_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_links" ADD CONSTRAINT "account_links_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_links" ADD CONSTRAINT "account_links_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_snapshots" ADD CONSTRAINT "account_snapshots_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_templates" ADD CONSTRAINT "budget_templates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_rules" ADD CONSTRAINT "merchant_rules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_links_workspace_external_key_unique" ON "account_links" USING btree ("workspace_id","external_key");--> statement-breakpoint
CREATE UNIQUE INDEX "account_snapshots_account_day_unique" ON "account_snapshots" USING btree ("account_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_workspace_external_ref_unique" ON "accounts" USING btree ("workspace_id","external_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_templates_workspace_category_unique" ON "budget_templates" USING btree ("workspace_id","category");--> statement-breakpoint
CREATE UNIQUE INDEX "budgets_workspace_month_category_unique" ON "budgets" USING btree ("workspace_id","month","category");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_rules_workspace_merchant_key_unique" ON "merchant_rules" USING btree ("workspace_id","merchant_key");--> statement-breakpoint
CREATE UNIQUE INDEX "snapshots_workspace_month_unique" ON "snapshots" USING btree ("workspace_id","month");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_members_workspace_auth_user_unique" ON "workspace_members" USING btree ("workspace_id","auth_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_members_auth_user_unique" ON "workspace_members" USING btree ("auth_user_id");