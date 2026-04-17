# Vercel Deployment Guide

Last updated: April 16, 2026

## Recommendation

Use Vercel now for the public-facing Glacier pages and OAuth registration URL.

The app is now wired for hosted Postgres plus Supabase Auth, but the real
hosted rollout still depends on adding your actual Supabase environment
variables and importing your current local finance data.

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

## Safe Path Right Now

Deploy the app to Vercel primarily so you can use a stable public HTTPS URL
such as:

- `https://your-project.vercel.app/glacier`

This gives you:

- a public website URL for Plaid OAuth institution registration
- a public Privacy Policy page at `/privacy`
- a public Data Policy page at `/data-policy`
- a public icon at `/glacier-icon.svg`

## Current Public Routes Worth Sharing

- `/glacier`
- `/privacy`
- `/data-policy`

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

At minimum, set the environment variables you need for the routes you intend to
use. For the public Glacier landing page alone, none are strictly required.

For a public-profile-only Vercel deployment, set:

- `PUBLIC_PROFILE_ONLY=1`

This disables the DB-backed finance pages during prerender so Vercel can build
the public profile, privacy, and policy pages without requiring the local
SQLite database.

The repo also includes a `vercel-build` script with smarter defaults:

- if `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are present, it defaults to the full hosted app
- otherwise it falls back to `PUBLIC_PROFILE_ONLY=1`

You can still override that manually by setting `PUBLIC_PROFILE_ONLY`.

If you later expose Plaid flows through the deployed site, configure:

- `DATABASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `AUTHORIZED_EMAILS`
- `PLAID_CLIENT_ID`
- `PLAID_SECRET`
- `PLAID_ENV`
- `PLAID_REDIRECT_URI`
- `PLAID_TOKEN_ENCRYPTION_KEY`
- `OPENAI_API_KEY` if AI categorization is enabled

### 4. Deploy

After deployment, use the stable Vercel URL:

- `https://your-project.vercel.app/glacier`

for the website field in Plaid OAuth registration until you have a custom
domain.

### 5. Add a custom domain later

Once you have a better permanent URL, update Plaid and use:

- `https://your-domain.example/glacier`

instead.

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

1. add the Supabase env vars in Vercel
2. set Supabase Site URL and redirect URLs to match your Vercel domain
3. deploy once so auth pages and middleware are live
4. run `npm run db:migrate` against the hosted Postgres database
5. sign in once to create your personal workspace
6. run `npm run db:import-legacy -- --sqlite=./finance.db --auth-user-id=<your supabase user id> --email=<your email>`
7. verify accounts, budgets, transactions, and Plaid flows

## What Not To Rely On Yet

Do not invite external testers until you have completed the real hosted rollout
above and validated the imported data against your own account first.

Before that verification, do not rely on the deployment for persistent finance
data storage for:

- connected bank data
- transactions
- budgets
- snapshots
- app state stored in SQLite

## Suggested Immediate Goal

Short term:

- finish creating the Supabase project
- add the Supabase env vars locally and in Vercel
- deploy once with the full hosted stack enabled
- import your existing finance data
- keep `AUTHORIZED_EMAILS` limited to just you until you validate the flow end to end
