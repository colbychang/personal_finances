---
name: setup-worker
description: Handles project scaffolding, configuration, database schema, and infrastructure setup
---

# Setup Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Use for features involving:
- Project initialization (package.json, tsconfig, next.config, tailwind, eslint)
- Database schema definition and Drizzle migrations
- PWA manifest and service worker setup
- Infrastructure/configuration that other features depend on

## Work Procedure

1. **Read the feature description** carefully. Identify ALL files that need to be created or modified. Read `.factory/library/architecture.md` for project structure conventions and `.factory/research/` files for technology-specific guidance.

2. **Check existing state**: Before making changes, read any existing config files, package.json, and directory structure. Never overwrite working code without understanding it first.

3. **Write tests first** (TDD):
   - For database schema: tests that verify table creation, column types, constraints, foreign keys, and seed data
   - For configuration: tests that verify config loads and key values are correct
   - For utilities/helpers: unit tests covering core logic
   - Run `npx vitest run` to confirm tests FAIL (red phase)

4. **Implement**:
   - Create/modify configuration files following the patterns in `.factory/research/` files
   - For Tailwind CSS 4: use CSS-based configuration (`@import "tailwindcss"` in globals.css, `@theme` block), NOT tailwind.config.js
   - For Drizzle: define schema in `src/db/schema.ts`, generate and run migrations
   - Install dependencies with `npm install <package>` as needed
   - Run `npx vitest run` to confirm tests PASS (green phase)

5. **Verify everything compiles and runs**:
   - `npx tsc --noEmit` — zero type errors
   - `npx vitest run` — all tests pass
   - `npx next build` — build succeeds (if applicable at this stage)
   - `npx next lint` — no lint errors (if ESLint configured)

6. **Manual verification**:
   - If the feature creates the app shell or any visible UI, start the dev server and verify with `agent-browser` that pages load without errors
   - For database schema: verify with `sqlite3 finance.db ".tables"` and `sqlite3 finance.db ".schema"`
   - For PWA: verify manifest is served and service worker registers

## Technology Notes

- **Next.js 16**: Turbopack is the default bundler. Use App Router. See `.factory/research/nextjs-16.md`
- **Tailwind CSS 4**: CSS-first configuration. PostCSS plugin is `@tailwindcss/postcss`. See `.factory/research/tailwind-4.md`
- **Drizzle ORM**: Use `drizzle-orm/better-sqlite3`. Enable WAL mode and foreign keys. Store money as INTEGER (cents). See `.factory/research/drizzle-sqlite.md`

## Example Handoff

```json
{
  "salientSummary": "Scaffolded Next.js 16 project with TypeScript, Tailwind CSS 4, Drizzle ORM + better-sqlite3. Created database schema with 10 tables, ran migrations, verified build + typecheck pass. App shell loads at localhost:3000 with responsive navigation.",
  "whatWasImplemented": "package.json with all 25+ dependencies, tsconfig.json with strict mode, next.config.ts, Tailwind CSS 4 setup (globals.css with @import and @theme), postcss.config.mjs with @tailwindcss/postcss, drizzle.config.ts, database schema (src/db/schema.ts) with tables for institutions, accounts, transactions, budgets, snapshots, connections, merchant_rules, account_snapshots, account_links, transaction_splits. Root layout with responsive shell (sidebar on desktop, bottom tabs on mobile). Placeholder pages for all routes.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      { "command": "npm install", "exitCode": 0, "observation": "All packages installed, no peer dep warnings" },
      { "command": "npx tsc --noEmit", "exitCode": 0, "observation": "Zero type errors" },
      { "command": "npx next build", "exitCode": 0, "observation": "Build completed, all routes compiled" },
      { "command": "npx vitest run", "exitCode": 0, "observation": "12 tests passed (schema, migrations, seed data)" },
      { "command": "sqlite3 finance.db '.tables'", "exitCode": 0, "observation": "All 10 tables present" }
    ],
    "interactiveChecks": [
      { "action": "Opened http://localhost:3000 in agent-browser", "observed": "App shell loads with sidebar navigation on desktop" },
      { "action": "Resized to 375px mobile width", "observed": "Bottom tab bar appears, sidebar hidden, layout intact" },
      { "action": "Clicked each nav item", "observed": "All pages load: Dashboard, Transactions, Budgets, Accounts, Settings" }
    ]
  },
  "tests": {
    "added": [
      {
        "file": "src/__tests__/db/schema.test.ts",
        "cases": [
          { "name": "creates all tables on migration", "verifies": "Drizzle migration creates all expected tables" },
          { "name": "enforces foreign key constraints", "verifies": "Cannot insert transaction referencing non-existent account" },
          { "name": "enforces unique constraints", "verifies": "Duplicate budget (month, category) is rejected" },
          { "name": "stores money as integers", "verifies": "Balance stored as cents, not floating point" }
        ]
      }
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- A required npm package fails to install (native module build failure, version conflict)
- Build fails due to incompatible package versions that cannot be resolved
- A configuration requirement conflicts with another (e.g., Tailwind v4 incompatible with a needed plugin)
- Database migration fails and the error is not clear how to resolve
