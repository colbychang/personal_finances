# Vercel Deployment Guide

Last updated: April 17, 2026

## Recommendation

Use Vercel now for the full hosted app, not just the public-facing Glacier pages.

The app is now wired for:

- Supabase Auth
- Supabase/Postgres runtime access
- workspace-scoped finance data
- one-time SQLite import into hosted Postgres

The remaining work is mainly operational:

- add the real environment variables in Vercel
- configure Supabase auth URLs
- deploy once
- import your current local finance data
- verify the hosted app end to end

## Why

The current application uses:

- Supabase Auth for password-based sign-in
- Postgres via `postgres` + Drizzle at runtime
- a one-time SQLite importer for moving your local `finance.db` into hosted Postgres

Relevant files:

- `src/db/index.ts`
- `drizzle.config.ts`
- `src/db/import-legacy-sqlite.ts`

That means the app can now run fully on Vercel, but only after the Supabase
database/auth env vars are present.

## Why Vercel Is The Right Next Step

It gives you:

- a stable public HTTPS URL for Supabase auth callbacks
- a stable public HTTPS URL for Plaid OAuth registration and redirects
- a clean place to run the actual multi-user beta
- an easy path from `your-project.vercel.app` to a custom domain later

## Vercel Setup Steps

### 1. Push the repo to GitHub

Create or update the GitHub repository for this project and push the branch you
want to deploy.

### 2. Create a new Vercel project

In Vercel:

- Import the GitHub repository
- Let Vercel detect Next.js automatically
- Keep the default build command unless you intentionally customize it

### 3. Add environment variables

For the real hosted app, set these in Vercel:

- `DATABASE_URL`
  Use the Supabase transaction pooler connection string.
- `DATABASE_POOL_MAX`
  Start with `5`
- `DATABASE_STATEMENT_TIMEOUT_MS`
  Start with `15000`
- `DATABASE_LOCK_TIMEOUT_MS`
  Start with `5000`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL`
  Example: `https://your-project.vercel.app`
- `PLAID_CLIENT_ID`
- `PLAID_SECRET`
- `PLAID_ENV`
  `production`
- `PLAID_REDIRECT_URI`
  Example: `https://your-project.vercel.app/plaid/oauth`
- `PLAID_TOKEN_ENCRYPTION_KEY`
- `OPENAI_API_KEY`

The repo includes a `vercel-build` script with these defaults:

- if `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are present, it builds the full app
- otherwise it falls back to `PUBLIC_PROFILE_ONLY=1`

So for the real hosted rollout, you do not need to set `PUBLIC_PROFILE_ONLY`.

### 4. Deploy

After deployment, use the stable Vercel URL:

- website URL for Plaid registration:
  `https://your-project.vercel.app/glacier`
- auth callback base:
  `https://your-project.vercel.app`
- Plaid OAuth redirect:
  `https://your-project.vercel.app/plaid/oauth`

### 5. Add a custom domain later

Once you have a better permanent URL, update Plaid and use:

- `https://your-domain.example/glacier`

instead.

## Supabase Auth Setup

In Supabase Auth settings, set:

- Site URL:
  - `https://your-project.vercel.app`
- Redirect URLs:
  - `http://localhost:3000/auth/confirm`
  - `https://your-project.vercel.app/auth/confirm`
  - `http://localhost:3000/reset-password`
  - `https://your-project.vercel.app/reset-password`
  - your custom domain equivalent later if needed

## Important Plaid Notes

- For OAuth institutions, Plaid expects a stable public HTTPS URL.
- Temporary tunnels are useful for local testing, but a stable Vercel URL is a
  cleaner choice for application display information.
- If you plan to use Plaid OAuth redirects in the deployed app, your
  `PLAID_REDIRECT_URI` should point to:
  `https://your-project.vercel.app/plaid/oauth`
  or your custom domain equivalent.

## Real Hosted Rollout

Once Supabase is configured, the recommended production/staging path is:

1. add the Supabase + Plaid env vars in Vercel
2. set Supabase Site URL and redirect URLs to match your Vercel domain
3. deploy once so auth pages and middleware are live
4. sign in once to create your personal workspace
5. run `npm run db:migrate` against the hosted Postgres database if needed
6. run `npm run db:import-legacy -- --sqlite=./finance.db --auth-user-id=<your supabase user id> --email=<your email>`
7. verify accounts, budgets, transactions, and Plaid flows
8. invite your first testers

## What Not To Rely On Yet

Do not invite external testers until you have completed the real hosted rollout
above, applied the latest migrations, and validated the imported data against
your own account first.

Before that verification, do not rely on the deployment for persistent finance
data storage for:

- connected bank data
- transactions
- budgets
- snapshots
- app state stored in SQLite

## Suggested Immediate Goal

Short term:

- add the Vercel env vars
- configure Supabase auth URLs for the Vercel domain
- deploy once with the full hosted stack enabled
- sign in on the hosted app
- import your existing finance data
- verify the hosted flow end to end before sending the app to testers
