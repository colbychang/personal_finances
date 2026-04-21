CREATE TABLE "plaid_sync_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer,
	"connection_id" integer NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"run_after" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"started_at" text,
	"finished_at" text
);
--> statement-breakpoint
ALTER TABLE "plaid_sync_jobs" ADD CONSTRAINT "plaid_sync_jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "plaid_sync_jobs" ADD CONSTRAINT "plaid_sync_jobs_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "plaid_sync_jobs_status_run_after_idx" ON "plaid_sync_jobs" USING btree ("status","run_after");
--> statement-breakpoint
CREATE INDEX "plaid_sync_jobs_connection_status_idx" ON "plaid_sync_jobs" USING btree ("connection_id","status");
