# Data Retention and Deletion Procedure

## Retention Baseline

Glacier Finance Tracker retains consumer financial data only while it is needed to provide the budgeting and finance tracking experience, unless a user requests deletion sooner.

| Data Type | Retention |
| --- | --- |
| Plaid access tokens | Retained while a bank connection is active; deleted on disconnect or workspace deletion |
| Plaid-derived accounts and transactions | Retained while the user keeps the workspace or linked institution active |
| Budgets, categories, merchant rules, snapshots | Retained while the user keeps the workspace active |
| Backups exported by users | Controlled by the user after download; the app does not retain downloaded backup files |
| Production logs | Retained according to Vercel/Supabase provider retention settings |

## User-Initiated Deletion

Users can:

- Disconnect an individual Plaid institution, which removes associated local connection/account/transaction data.
- Delete their workspace/account data through Settings.
- Request manual deletion by contacting the app owner.

## Operator Deletion Procedure

When a user requests deletion:

1. Verify the requester controls the account email.
2. Export a backup only if the user explicitly requests it before deletion.
3. Remove Plaid Items where access tokens are still available.
4. Delete workspace-scoped finance data from the production database.
5. Delete workspace membership and workspace records where appropriate.
6. Delete the Supabase Auth user if `SUPABASE_SERVICE_ROLE_KEY` is configured.
7. Record completion date and any exceptions.

## Review

Review this procedure quarterly and after any change to data model, Plaid integration, hosting provider, or privacy requirements.

Owner: Colby Chang  
Last reviewed: 2026-04-21
