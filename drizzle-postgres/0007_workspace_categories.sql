ALTER TABLE "categories" ADD COLUMN "workspace_id" integer;
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
UPDATE "categories"
SET "workspace_id" = (
  SELECT "id"
  FROM "workspaces"
  ORDER BY "id"
  LIMIT 1
)
WHERE "is_predefined" = false
  AND "workspace_id" IS NULL
  AND EXISTS (SELECT 1 FROM "workspaces");
--> statement-breakpoint
ALTER TABLE "categories" DROP CONSTRAINT IF EXISTS "categories_name_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "categories_workspace_name_unique" ON "categories" USING btree ("workspace_id","name");
