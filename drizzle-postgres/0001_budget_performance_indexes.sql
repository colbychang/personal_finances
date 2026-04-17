CREATE INDEX IF NOT EXISTS "transactions_workspace_posted_at_idx"
  ON "transactions" ("workspace_id", "posted_at" DESC, "id" DESC);
