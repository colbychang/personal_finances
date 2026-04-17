CREATE INDEX IF NOT EXISTS "transactions_workspace_effective_month_visible_idx"
  ON "transactions" (
    "workspace_id",
    (coalesce("override_month", substr("posted_at", 1, 7))),
    "posted_at" DESC,
    "id" DESC
  )
  WHERE "is_transfer" = false AND "is_excluded" = false;
