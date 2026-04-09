# Personal Finance Tracker

A full-featured personal finance management app built as a Progressive Web App with Next.js. Track accounts, transactions, budgets, and net worth with bank syncing via Plaid and AI-powered transaction categorization.

## Features

- **Accounts** -- Add and manage checking, savings, credit card, and investment accounts
- **Transactions** -- View, search, filter, and categorize transactions
- **Budgets** -- Set monthly spending budgets by category and track progress
- **Bank Connections** -- Link bank accounts via Plaid for automatic transaction syncing
- **CSV Import** -- Import transactions from CSV files with column mapping and preview
- **AI Categorization** -- Automatic transaction categorization using merchant rules and OpenAI
- **Net Worth** -- Track net worth over time with historical snapshots
- **Analytics** -- Spending breakdowns by category, trend charts, and drill-down views
- **Dashboard** -- Overview of spending, budgets, net worth, and month-over-month comparisons
- **PWA** -- Installable on mobile and desktop with offline support

## Tech Stack

- **Framework**: Next.js 16 (App Router, React 19)
- **Database**: SQLite via better-sqlite3 with Drizzle ORM
- **Styling**: Tailwind CSS 4
- **Charts**: Recharts
- **Bank Integration**: Plaid SDK
- **AI**: OpenAI (gpt-4o-mini) for transaction categorization
- **Testing**: Vitest with Testing Library
- **Language**: TypeScript

## Getting Started

### Prerequisites

- Node.js 20+

### Install dependencies

```sh
npm install
```

### Environment variables

Create a `.env.local` file in the project root:

```
PLAID_CLIENT_ID=your_plaid_client_id
PLAID_SECRET=your_plaid_secret
PLAID_ENV=sandbox
PLAID_REDIRECT_URI=https://your-public-app-url/plaid/oauth
OPENAI_API_KEY=your_openai_api_key
PLAID_TOKEN_ENCRYPTION_KEY=a_random_32_byte_hex_string
```

Plaid credentials are required for bank linking. The OpenAI key is required for AI categorization. The encryption key secures stored Plaid access tokens.
If you are using Plaid production with OAuth-enabled institutions, set `PLAID_REDIRECT_URI` to the exact `https://` redirect URL configured in Plaid Dashboard. A plain `http://localhost` redirect will be rejected by Plaid production.

### Run database migrations

```sh
npx drizzle-kit migrate
```

### Seed sample data

```sh
npx tsx src/db/seed.ts
```

This inserts predefined categories and optional sample accounts, transactions, and budgets for testing.

### Start the dev server

```sh
npm run dev
```

The app runs at [http://localhost:3000](http://localhost:3000).

## Usage

- **Dashboard** (`/`) -- At-a-glance spending summary, budget progress, and net worth
- **Accounts** (`/accounts`) -- Add manual accounts or connect a bank via Plaid
- **Transactions** (`/transactions`) -- Browse, search, and re-categorize transactions
- **Budgets** (`/budgets`) -- Create monthly budgets per category and monitor spending
- **Import** (`/import`) -- Upload CSV files from your bank to bulk-import transactions
- **Net Worth** (`/net-worth`) -- View net worth history and record snapshots
- **Analytics** (`/analytics`) -- Category breakdowns, spending trends, and drill-down charts
- **Settings** (`/settings`) -- Manage connected bank accounts and merchant categorization rules

## Project Structure

```
src/
  app/              Next.js App Router pages and API routes
    (pages)/        Route group for main pages (accounts, transactions, budgets, etc.)
    api/            REST API route handlers
  components/       Shared React components (ui, navigation, charts, forms)
  db/               Database connection, Drizzle schema, migrations, seed data, queries
  lib/              Utility functions (CSV parsing, formatting, Plaid/OpenAI clients, encryption)
  __tests__/        Unit and integration tests
```

## Testing

Run the full test suite:

```sh
npm test
```

Run tests in watch mode:

```sh
npm run test:watch
```

Lint and type-check:

```sh
npm run lint
npm run typecheck
```

## PWA

The app is a Progressive Web App and can be installed on mobile devices:

1. Open the app in your mobile browser (Safari on iOS, Chrome on Android)
2. Tap the share/menu button
3. Select "Add to Home Screen"
4. The app launches in standalone mode with offline support via a service worker
