# Glacier Operations Runbook

This app is still intentionally small, so the operations loop should stay lightweight: detect problems quickly, avoid silent Plaid sync failures, and keep a recoverable workspace backup before risky data changes.

## Health and Smoke Checks

Run the public smoke suite against production after deploys:

```bash
SMOKE_BASE_URL=https://personal-finances-mauve.vercel.app npm run smoke
```

The smoke check verifies the health endpoint, sign-in page, public policies, and public app profile. It is safe to run unauthenticated and should complete in a few seconds.

## Logs and Monitoring

Use the structured log event names in Vercel Runtime Logs when debugging incidents:

- `health.ok` and `health.failed` for database readiness.
- `workspace_export.success` and `workspace_export.failed` for backup downloads.
- `operations.status.ok` and `operations.status.failed` for Settings health checks.
- `plaid.sync.*` and `plaid.webhook.*` for Plaid ingestion.
- `client_error.reported` for browser-side exceptions reported by the app.
- `rate_limit.exceeded` for throttled API use.

If errors become frequent, add a Vercel log drain or Sentry destination and alert on `*.failed`, `client_error.reported`, and repeated `rate_limit.exceeded` events.

## Recovery Exports

Authenticated users can download a workspace-scoped JSON backup from Settings. The export includes accounts, transactions, transaction splits, budgets, budget templates, categories, merchant rules, account snapshots, net worth snapshots, institutions, account links, and sanitized Plaid connection metadata.

Plaid access tokens are intentionally excluded from exports. Keep downloaded backups private because the file still contains financial transaction history.

## Plaid Sync Operations

Background Plaid jobs are visible in Settings under Operations Status. A healthy workspace should have no failed jobs and no long-running `syncing` connections.

If sync looks stale:

1. Check Settings for failed jobs or errored connections.
2. Review Vercel logs for `plaid.sync.failed` or `plaid.webhook.failed`.
3. Trigger a manual sync from the app if needed.
4. Re-run the smoke suite after any deploy that touches auth, database, or Plaid routes.
