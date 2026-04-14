# Vercel Deployment Guide

Last updated: April 14, 2026

## Recommendation

Use Vercel now for the public-facing Glacier pages and OAuth registration URL.

Do **not** treat the current app as production-ready on Vercel for full finance
functionality until the database layer is moved off local SQLite.

## Why

The current application uses:

- `better-sqlite3`
- a local SQLite file at `./finance.db`
- Drizzle configured for SQLite

Relevant files:

- `src/db/index.ts`
- `drizzle.config.ts`

This is fine for local development, but it is not a durable production storage
model for a serverless deployment platform like Vercel.

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

If you later expose Plaid flows through the deployed site, configure:

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

## What Not To Rely On Yet

Do not rely on the current Vercel deployment for persistent production data
storage for:

- connected bank data
- transactions
- budgets
- snapshots
- app state stored in SQLite

## Full Production Path Later

Before treating the app as fully production-ready on Vercel, migrate the
database away from local SQLite to a managed database.

Reasonable options include:

- Vercel Postgres / Postgres-compatible hosting
- Neon
- Supabase Postgres
- Turso / LibSQL

After that migration, the following should be revisited:

- Drizzle config
- runtime/database connection strategy
- migrations and seed flow
- secrets management
- production backups
- encryption-at-rest story

## Suggested Immediate Goal

Short term:

- deploy to Vercel
- use `/glacier` as the public website URL for Plaid registration
- keep the deployed project focused on public-facing pages until the data layer
  is upgraded
