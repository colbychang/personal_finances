# Supabase + Vercel rollout

This repo now includes the first auth layer for a hosted beta:

- Supabase email/password authentication
- cookie-backed SSR sessions
- route protection through `src/proxy.ts`
- an optional `AUTHORIZED_EMAILS` allowlist for small staged access

## What is ready now

- `sign-in` and `sign-up` pages
- email confirmation callback handling
- protected app routes and protected API routes
- a simple sign-out control in the footer
- an `access-pending` screen for non-allowlisted users

## What is not ready yet

The app runtime is now pointed at Postgres, finance queries are workspace-aware,
and the automated test suite has been converted to `PGlite`. The hosted rollout
still needs these final pieces before you should invite multiple friends:

1. create the real Supabase project and add the env vars locally + in Vercel
2. run the one-time SQLite -> Postgres importer against your real hosted workspace
3. verify the full Plaid + auth + workspace flow against Supabase/Vercel end to end

## Recommended near-term deployment shape

### Safe right now

- Keep using your current Vercel deployment for the public Glacier pages if the Supabase envs are not ready yet.
- Configure Supabase auth locally and in a staging deployment.
- Set `AUTHORIZED_EMAILS` to just your own email while the first hosted import/verification is in flight.

### Safe after the hosted import

- Disable `PUBLIC_PROFILE_ONLY` if you set it manually.
- Point the app at Supabase Postgres instead of local SQLite.
- Expand `AUTHORIZED_EMAILS` to your first one or two testers.
- After query scoping is proven, remove the allowlist if you want open sign-up.

## Environment variables

Set these locally and in Vercel:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_SITE_URL=https://your-app.vercel.app
AUTHORIZED_EMAILS=colby.chang@gmail.com
DATABASE_POOL_MAX=5
DATABASE_STATEMENT_TIMEOUT_MS=15000
DATABASE_LOCK_TIMEOUT_MS=5000
```

For the database runtime, also set:

```env
DATABASE_URL=postgresql://postgres.your-project-ref:password@aws-1-your-region.pooler.supabase.com:6543/postgres
```

Use Supabase's transaction pooler connection string for `DATABASE_URL` on Vercel. For the current hosted beta, `DATABASE_POOL_MAX=5` is a better fit for the heavier aggregate pages, and `DATABASE_STATEMENT_TIMEOUT_MS` / `DATABASE_LOCK_TIMEOUT_MS` keep those requests from hanging forever if a query stalls.

For local debugging, the direct Supabase database host can be more stable than the pooler. A practical split is:

- local: direct `db.<project-ref>.supabase.co:5432`
- Vercel: transaction pooler `aws-...pooler.supabase.com:6543`

Keep your Supabase Site URL / redirect configuration aligned with:

- `http://localhost:3000` for local development
- your Vercel preview/production URL for hosted sign-in

For the first hosted rollout, configure these exact auth URLs in Supabase:

- Site URL:
  - `https://your-project.vercel.app`
- Redirect URLs:
  - `http://localhost:3000/auth/confirm`
  - `https://your-project.vercel.app/auth/confirm`
  - your custom domain equivalent later, if you add one

For Plaid in production, also configure:

- `PLAID_REDIRECT_URI=https://your-project.vercel.app/plaid/oauth`
- the same URL allowlisted in the Plaid Dashboard

## Suggested next implementation slice

1. create your Supabase project and set `DATABASE_URL` plus the auth env vars locally and in Vercel
2. sign in once so your hosted personal workspace exists
3. run `npm run db:import-legacy -- --sqlite=./finance.db --workspace-id=<your workspace id>`
4. verify accounts, transactions, budgets, and Plaid reconnects in the hosted app
5. then expand `AUTHORIZED_EMAILS` to your first one or two testers

That gives you a safer first hosted beta without exposing your data to other testers.
