CREATE SCHEMA IF NOT EXISTS "app_private";
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS "auth";
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regprocedure('auth.uid()') IS NULL THEN
    EXECUTE '
      CREATE FUNCTION auth.uid()
      RETURNS uuid
      LANGUAGE sql
      STABLE
      AS $function$
        SELECT NULLIF(current_setting(''request.jwt.claim.sub'', true), '''')::uuid
      $function$
    ';
  END IF;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "app_private"."current_user_workspace_ids"()
RETURNS SETOF integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT "workspace_id"
  FROM "workspace_members"
  WHERE "auth_user_id" = (SELECT auth.uid())::text
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "app_private"."current_user_workspace_ids"() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "app_private"."current_user_workspace_ids"() TO authenticated;
--> statement-breakpoint
ALTER TABLE "workspaces" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "workspace_members" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "institutions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "transactions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "budgets" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "budget_templates" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "snapshots" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "connections" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "plaid_sync_jobs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "merchant_rules" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "account_snapshots" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "account_links" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "transaction_splits" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "workspaces_select_workspace_member" ON "workspaces";
--> statement-breakpoint
CREATE POLICY "workspaces_select_workspace_member"
ON "workspaces"
FOR SELECT
TO authenticated
USING ("id" IN (SELECT "app_private"."current_user_workspace_ids"()));
--> statement-breakpoint
DROP POLICY IF EXISTS "workspace_members_select_workspace_member" ON "workspace_members";
--> statement-breakpoint
CREATE POLICY "workspace_members_select_workspace_member"
ON "workspace_members"
FOR SELECT
TO authenticated
USING ("workspace_id" IN (SELECT "app_private"."current_user_workspace_ids"()));
--> statement-breakpoint
DROP POLICY IF EXISTS "institutions_select_workspace_member" ON "institutions";
--> statement-breakpoint
CREATE POLICY "institutions_select_workspace_member"
ON "institutions"
FOR SELECT
TO authenticated
USING ("workspace_id" IN (SELECT "app_private"."current_user_workspace_ids"()));
--> statement-breakpoint
DROP POLICY IF EXISTS "accounts_select_workspace_member" ON "accounts";
--> statement-breakpoint
CREATE POLICY "accounts_select_workspace_member"
ON "accounts"
FOR SELECT
TO authenticated
USING ("workspace_id" IN (SELECT "app_private"."current_user_workspace_ids"()));
--> statement-breakpoint
DROP POLICY IF EXISTS "transactions_select_workspace_member" ON "transactions";
--> statement-breakpoint
CREATE POLICY "transactions_select_workspace_member"
ON "transactions"
FOR SELECT
TO authenticated
USING ("workspace_id" IN (SELECT "app_private"."current_user_workspace_ids"()));
--> statement-breakpoint
DROP POLICY IF EXISTS "budgets_select_workspace_member" ON "budgets";
--> statement-breakpoint
CREATE POLICY "budgets_select_workspace_member"
ON "budgets"
FOR SELECT
TO authenticated
USING ("workspace_id" IN (SELECT "app_private"."current_user_workspace_ids"()));
--> statement-breakpoint
DROP POLICY IF EXISTS "budget_templates_select_workspace_member" ON "budget_templates";
--> statement-breakpoint
CREATE POLICY "budget_templates_select_workspace_member"
ON "budget_templates"
FOR SELECT
TO authenticated
USING ("workspace_id" IN (SELECT "app_private"."current_user_workspace_ids"()));
--> statement-breakpoint
DROP POLICY IF EXISTS "snapshots_select_workspace_member" ON "snapshots";
--> statement-breakpoint
CREATE POLICY "snapshots_select_workspace_member"
ON "snapshots"
FOR SELECT
TO authenticated
USING ("workspace_id" IN (SELECT "app_private"."current_user_workspace_ids"()));
--> statement-breakpoint
DROP POLICY IF EXISTS "connections_select_workspace_member" ON "connections";
--> statement-breakpoint
CREATE POLICY "connections_select_workspace_member"
ON "connections"
FOR SELECT
TO authenticated
USING ("workspace_id" IN (SELECT "app_private"."current_user_workspace_ids"()));
--> statement-breakpoint
DROP POLICY IF EXISTS "plaid_sync_jobs_select_workspace_member" ON "plaid_sync_jobs";
--> statement-breakpoint
CREATE POLICY "plaid_sync_jobs_select_workspace_member"
ON "plaid_sync_jobs"
FOR SELECT
TO authenticated
USING ("workspace_id" IN (SELECT "app_private"."current_user_workspace_ids"()));
--> statement-breakpoint
DROP POLICY IF EXISTS "merchant_rules_select_workspace_member" ON "merchant_rules";
--> statement-breakpoint
CREATE POLICY "merchant_rules_select_workspace_member"
ON "merchant_rules"
FOR SELECT
TO authenticated
USING ("workspace_id" IN (SELECT "app_private"."current_user_workspace_ids"()));
--> statement-breakpoint
DROP POLICY IF EXISTS "account_links_select_workspace_member" ON "account_links";
--> statement-breakpoint
CREATE POLICY "account_links_select_workspace_member"
ON "account_links"
FOR SELECT
TO authenticated
USING ("workspace_id" IN (SELECT "app_private"."current_user_workspace_ids"()));
--> statement-breakpoint
DROP POLICY IF EXISTS "categories_select_workspace_member" ON "categories";
--> statement-breakpoint
CREATE POLICY "categories_select_workspace_member"
ON "categories"
FOR SELECT
TO authenticated
USING (
  ("workspace_id" IS NULL AND "is_predefined" = true)
  OR "workspace_id" IN (SELECT "app_private"."current_user_workspace_ids"())
);
--> statement-breakpoint
DROP POLICY IF EXISTS "account_snapshots_select_workspace_member" ON "account_snapshots";
--> statement-breakpoint
CREATE POLICY "account_snapshots_select_workspace_member"
ON "account_snapshots"
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM "accounts"
    WHERE "accounts"."id" = "account_snapshots"."account_id"
      AND "accounts"."workspace_id" IN (SELECT "app_private"."current_user_workspace_ids"())
  )
);
--> statement-breakpoint
DROP POLICY IF EXISTS "transaction_splits_select_workspace_member" ON "transaction_splits";
--> statement-breakpoint
CREATE POLICY "transaction_splits_select_workspace_member"
ON "transaction_splits"
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM "transactions"
    WHERE "transactions"."id" = "transaction_splits"."transaction_id"
      AND "transactions"."workspace_id" IN (SELECT "app_private"."current_user_workspace_ids"())
  )
);
