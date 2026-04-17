CREATE INDEX IF NOT EXISTS "accounts_workspace_type_idx"
  ON "accounts" ("workspace_id", "type");
