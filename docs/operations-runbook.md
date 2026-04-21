# Glacier Operations Runbook

This app is still intentionally small, so the operations loop should stay lightweight: detect problems quickly, avoid silent Plaid sync failures, and keep a recoverable workspace backup before risky data changes.

## Health and Smoke Checks

Run the public smoke suite against production after deploys:

```bash
SMOKE_BASE_URL=https://personal-finances-mauve.vercel.app npm run smoke
```

The smoke check verifies the health endpoint, sign-in page, public policies, and public app profile. It is safe to run unauthenticated and should complete in a few seconds.

GitHub Actions also runs this smoke suite automatically when Vercel reports a successful Production deployment.

## Logs and Monitoring

Use the structured log event names in Vercel Runtime Logs when debugging incidents:

- `health.ok` and `health.failed` for database readiness.
- `workspace_export.success` and `workspace_export.failed` for backup downloads.
- `operations.status.ok` and `operations.status.failed` for Settings health checks.
- `plaid.sync.*` and `plaid.webhook.*` for Plaid ingestion.
- `client_error.reported` for browser-side exceptions reported by the app.
- `rate_limit.exceeded` for throttled API use.

Set `ERROR_ALERT_WEBHOOK_URL` to forward `logError` events to a webhook destination such as Slack, Discord, Sentry's generic ingestion endpoint, or another incident tool. If the destination expects a bearer token, set `ERROR_ALERT_WEBHOOK_TOKEN`.

For higher-volume usage, add a Vercel log drain or Sentry SDK destination and alert on `*.failed`, `client.error`, and repeated `rate_limit.exceeded` events.

## Recovery Exports

Authenticated users can download a workspace-scoped JSON backup from Settings. The export includes accounts, transactions, transaction splits, budgets, budget templates, categories, merchant rules, account snapshots, net worth snapshots, institutions, account links, and sanitized Plaid connection metadata.

Plaid access tokens are intentionally excluded from exports. Keep downloaded backups private because the file still contains financial transaction history.

Settings also includes a restore flow. Restore always previews the file first, requires explicit confirmation, replaces only the signed-in workspace's finance data, and remaps internal IDs into the current workspace. Restored Plaid connections cannot sync until the bank is reconnected because access tokens are never exported.

## Plaid Sync Operations

Background Plaid jobs are visible in Settings under Operations Status. A healthy workspace should have no failed jobs and no long-running `syncing` connections.

If sync looks stale:

1. Check Settings for failed jobs or errored connections.
2. Review Vercel logs for `plaid.sync.failed` or `plaid.webhook.failed`.
3. Trigger a manual sync from the app if needed.
4. Re-run the smoke suite after any deploy that touches auth, database, or Plaid routes.
