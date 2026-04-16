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

The app data is still stored in SQLite and all finance queries are currently global. So while auth is now present, true multi-user isolation is not complete yet.

Before inviting multiple friends, we still need to:

1. move the app database from SQLite to Supabase Postgres
2. add `workspace_id` or equivalent ownership fields to finance tables
3. scope every query and API route to the signed-in user/workspace
4. bind Plaid connections and encrypted access tokens to that workspace
5. backfill your existing local data into your own hosted account

## Recommended near-term deployment shape

### Safe right now

- Keep using your current Vercel deployment for the public Glacier pages.
- Configure Supabase auth locally and in a staging deployment.
- Set `AUTHORIZED_EMAILS` to just your own email while the tenancy migration is in flight.

### Safe after the database migration

- Disable `PUBLIC_PROFILE_ONLY`.
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
```

Keep your Supabase Site URL / redirect configuration aligned with:

- `http://localhost:3000` for local development
- your Vercel preview/production URL for hosted sign-in

## Suggested next implementation slice

1. create Postgres schema equivalents for the current Drizzle SQLite tables
2. introduce `workspace_id` on top-level finance entities
3. add a current-workspace helper to all finance queries
4. migrate one end-to-end flow first:
   accounts -> transactions -> budgets

That gives us a safe path to start inviting real testers without exposing your own data.
