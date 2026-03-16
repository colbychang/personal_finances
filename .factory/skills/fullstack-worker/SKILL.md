---
name: fullstack-worker
description: Implements full-stack features including API routes, React components, database operations, and external service integrations
---

# Fullstack Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Use for features involving:
- API route handlers (Next.js Route Handlers)
- React page components and interactive UI
- Database queries and mutations via Drizzle
- Integration with external services (Plaid, OpenAI)
- Any feature touching both server and client code

## Work Procedure

1. **Understand the feature**: Read the feature description, preconditions, and expectedBehavior thoroughly. Read `.factory/library/architecture.md` for project structure and conventions. Check `.factory/library/` for any domain-specific guidance.

2. **Plan your approach**: Identify which files to create/modify:
   - Database queries: `src/db/queries/`
   - API routes: `src/app/api/[resource]/route.ts`
   - Server actions: `src/app/actions/`
   - Pages: `src/app/(pages)/[page]/page.tsx`
   - Components: `src/components/`
   - Utilities: `src/lib/`

3. **Write tests FIRST (TDD)** — this is mandatory:
   - Create test file(s) covering ALL expected behaviors from the feature description
   - For API routes: test request handling, validation, error cases, edge cases
   - For database operations: test CRUD, constraints, filtering, aggregation
   - For components: test rendering, user interactions, form validation, error states
   - Run `npx vitest run` — confirm tests FAIL (red phase)

4. **Implement to make tests pass**:
   - Follow existing codebase patterns (check how similar features are implemented)
   - Use Server Components by default; add `'use client'` only for interactivity (forms, modals, state, event handlers)
   - Money: store as INTEGER cents in DB, display formatted (e.g., `$1,234.56`)
   - Dates: store as TEXT (ISO YYYY-MM-DD) in SQLite
   - Always handle loading states, error states, and empty states
   - Run `npx vitest run` — confirm tests PASS (green phase)

5. **Run all validators**:
   - `npx tsc --noEmit` — zero type errors
   - `npx vitest run` — all tests pass
   - `npx next lint` — no lint errors

6. **Manual verification with agent-browser** (REQUIRED for any feature with UI):
   - Start the dev server (`npx next dev -p 3000`) if not already running
   - Open the relevant page(s) in agent-browser
   - Test EVERY user flow from the feature's expectedBehavior list
   - Test error states: empty inputs, invalid data, server errors
   - Test responsive behavior: check at mobile width (~375px) AND desktop width (~1280px)
   - Each distinct flow tested = one `interactiveChecks` entry with specific action and observed result

7. **Regression check**: Navigate to 2-3 adjacent pages/features and verify they still work correctly. Note any regressions in discoveredIssues.

## Key Conventions

- **Styling**: Tailwind CSS utility classes. Mobile-first (start with mobile styles, add `md:` and `lg:` breakpoints for larger screens). Use the project's color palette consistently.
- **Forms**: Client Components with controlled inputs. Validate client-side for UX, server-side for security. Show inline validation errors.
- **API Routes**: Return JSON. Use proper HTTP status codes (200, 201, 400, 404, 500). Always validate request body/params.
- **Error Handling**: Try/catch in API routes, error boundaries in React. Show user-friendly messages, log technical details to console.
- **Accessibility**: Semantic HTML (button not div, label for inputs). ARIA attributes where needed. Keyboard navigable.
- **Touch Targets**: All interactive elements minimum 44x44px on mobile.

## Plaid Integration Notes

Read `.factory/research/plaid-integration.md` for full details.
- Link flow: create link_token (server) → open Link UI (client) → exchange public_token for access_token (server) → store encrypted
- Transaction sync: POST /transactions/sync with cursor. Plaid amounts are INVERTED (positive = money out)
- Sandbox test credentials: user_good / pass_good
- Never expose access_token to the client

## OpenAI Integration Notes

- Model: gpt-4o-mini
- Send transaction name + merchant as context
- Expect one of the predefined categories back
- Batch multiple transactions in one request for efficiency
- Handle rate limits and errors gracefully

## Example Handoff

```json
{
  "salientSummary": "Built transaction list page with filtering (date range, category, account), search, and pagination. API route GET /api/transactions supports all filter params with proper validation. 14 tests pass covering all filter combinations, empty states, and error handling. Verified in agent-browser at both mobile and desktop widths.",
  "whatWasImplemented": "GET /api/transactions route handler with query params: dateFrom, dateTo, category, accountId, search, page, limit. Returns paginated JSON with transactions and metadata (total count, page info). Transaction list page at /transactions with: filter bar (date range picker, category multi-select, account dropdown), search input with debounce, paginated card list. Each card shows date, merchant/name, formatted amount, category color badge, account name. Mobile: cards stack vertically, filter drawer behind button. Desktop: inline filter bar, wider cards with more detail.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      { "command": "npx vitest run src/__tests__/api/transactions.test.ts", "exitCode": 0, "observation": "14 tests passed: list default, filter by date range, filter by category, filter by multiple categories, filter by account, search by name, search by merchant, combined filters, pagination page 1, pagination page 2, empty result set, invalid date params return 400, missing required params return 400, large page number returns empty" },
      { "command": "npx tsc --noEmit", "exitCode": 0, "observation": "Zero type errors across all files" },
      { "command": "npx next lint", "exitCode": 0, "observation": "No lint warnings or errors" }
    ],
    "interactiveChecks": [
      { "action": "Opened /transactions in agent-browser at 1280px width", "observed": "Transaction list loads showing 10 seed transactions with date, merchant, amount ($143.20), category badge (Groceries in green), account name" },
      { "action": "Set date filter to 2026-03-01 through 2026-03-10", "observed": "List filters to 4 transactions within range, filter badge shows '4 results'" },
      { "action": "Selected 'Groceries' from category filter", "observed": "List shows only 1 grocery transaction (Whole Foods $143.20)" },
      { "action": "Typed 'uber' in search box", "observed": "After 300ms debounce, list filters to 1 Uber transaction ($26.43)" },
      { "action": "Cleared all filters", "observed": "Full transaction list restored, all 10 transactions visible" },
      { "action": "Resized to 375px mobile width", "observed": "Filter bar collapses to filter icon button, search remains visible, cards stack vertically with smaller font" },
      { "action": "Tapped filter icon on mobile", "observed": "Filter drawer slides up from bottom with date, category, account selectors" }
    ]
  },
  "tests": {
    "added": [
      {
        "file": "src/__tests__/api/transactions.test.ts",
        "cases": [
          { "name": "returns paginated transactions with defaults", "verifies": "Default page=1 limit=20 returns correct subset" },
          { "name": "filters by date range", "verifies": "dateFrom and dateTo params correctly bound results" },
          { "name": "filters by single category", "verifies": "category param returns only matching transactions" },
          { "name": "filters by account", "verifies": "accountId param returns only that account's transactions" },
          { "name": "searches by name case-insensitive", "verifies": "search matches partial name regardless of case" },
          { "name": "returns 400 for invalid date format", "verifies": "Non-ISO date string returns validation error" }
        ]
      }
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- Feature depends on an API endpoint, database table, or component that doesn't exist yet
- Plaid or OpenAI API returns errors not covered in the feature description
- Existing bugs in other features directly block this feature's implementation
- Requirements in the feature description conflict with existing implementation
- UI layout or behavior decisions are ambiguous and would significantly affect user experience
