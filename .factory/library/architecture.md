# Architecture

## Project Structure

```
personal_finances/
├── src/
│   ├── app/                        # Next.js App Router
│   │   ├── layout.tsx              # Root layout (responsive shell, navigation)
│   │   ├── page.tsx                # Dashboard (home page)
│   │   ├── globals.css             # Tailwind CSS imports + theme
│   │   ├── (pages)/               # Route group for main pages
│   │   │   ├── accounts/
│   │   │   │   └── page.tsx
│   │   │   ├── transactions/
│   │   │   │   └── page.tsx
│   │   │   ├── budgets/
│   │   │   │   └── page.tsx
│   │   │   ├── net-worth/
│   │   │   │   └── page.tsx
│   │   │   ├── settings/
│   │   │   │   └── page.tsx
│   │   │   └── import/
│   │   │       └── page.tsx
│   │   └── api/                    # API Route Handlers
│   │       ├── accounts/
│   │       │   └── route.ts
│   │       ├── transactions/
│   │       │   └── route.ts
│   │       ├── budgets/
│   │       │   └── route.ts
│   │       ├── categories/
│   │       │   └── route.ts
│   │       ├── plaid/
│   │       │   ├── link-token/route.ts
│   │       │   ├── exchange-token/route.ts
│   │       │   ├── sync/route.ts
│   │       │   └── sandbox-connect/route.ts
│   │       ├── import/
│   │       │   ├── route.ts
│   │       │   └── preview/route.ts
│   │       ├── categorize/
│   │       │   └── route.ts
│   │       ├── merchant-rules/
│   │       │   ├── route.ts
│   │       │   └── [id]/route.ts
│   │       └── snapshots/
│   │           └── route.ts
│   ├── components/                 # Shared React components
│   │   ├── ui/                     # Base UI (Button, Input, Card, Modal, etc.)
│   │   ├── navigation/            # Sidebar, BottomTabs, NavLink
│   │   ├── charts/                # Chart wrappers (Recharts)
│   │   └── forms/                 # Reusable form components
│   ├── db/                        # Database layer
│   │   ├── index.ts               # Database connection (singleton)
│   │   ├── schema.ts              # Drizzle schema definitions
│   │   ├── migrate.ts             # Migration runner
│   │   ├── seed.ts                # Seed data (categories, test data)
│   │   └── queries/               # Query functions by domain
│   │       ├── accounts.ts
│   │       ├── transactions.ts
│   │       ├── budgets.ts
│   │       ├── categories.ts
│   │       ├── connections.ts
│   │       ├── merchant-rules.ts
│   │       ├── sync.ts
│   │       ├── imports.ts
│   │       └── snapshots.ts
│   ├── lib/                       # Utility functions
│   │   ├── categories.ts          # Category definitions, colors, icons
│   │   ├── categorize.ts          # Merchant rule matching + AI categorization pipeline
│   │   ├── csv.ts                 # CSV parsing (handles quotes, multi-format dates, currency amounts)
│   │   ├── encryption.ts          # AES-256-GCM encryption for Plaid access tokens
│   │   ├── format.ts              # Currency formatting, date formatting
│   │   ├── plaid.ts               # Plaid client initialization
│   │   ├── openai.ts              # OpenAI client + prompt building for categorization
│   │   └── utils.ts               # General utilities (cn, etc.)
│   └── __tests__/                 # Test files (mirrors src/ structure)
│       ├── db/
│       ├── api/
│       ├── components/
│       └── lib/
├── drizzle/                       # Generated migration files
├── public/                        # Static assets (icons, manifest)
├── .factory/                      # Mission infrastructure
├── package.json
├── tsconfig.json
├── next.config.ts
├── postcss.config.mjs
├── drizzle.config.ts
├── vitest.config.ts
└── .env.local                     # API keys (gitignored)
```

## Key Patterns

### Server vs Client Components
- **Server Components** (default): Pages that fetch data, static layout sections, data display
- **Client Components** (`'use client'`): Forms, modals, dropdowns, charts, anything with useState/useEffect/event handlers
- **Rule of thumb**: Push `'use client'` to the smallest component that needs it. Keep page-level components as Server Components that pass data down to Client Component children.

### Data Flow
1. **Server Components** call Drizzle query functions directly (no fetch needed)
2. **Mutations** use API Route Handlers (POST/PUT/DELETE to /api/*)
3. Client Components call API routes via fetch and use `router.refresh()` to revalidate
4. No global state management library — React state for local UI, server for data

### API Routes
- Located at `src/app/api/[resource]/route.ts`
- Export named functions: `GET`, `POST`, `PUT`, `DELETE`
- Always validate input parameters and request body
- Return `NextResponse.json(data, { status })` with appropriate HTTP codes
- Handle errors with try/catch, return 500 for unexpected errors

### Database Conventions
- **Drizzle ORM** with `better-sqlite3` driver
- Enable WAL mode and foreign keys on connection: `db.run('PRAGMA journal_mode=WAL'); db.run('PRAGMA foreign_keys=ON')`
- **Money**: Store as INTEGER (cents). Multiply by 100 on write, divide by 100 on read. Never use floating point for money.
- **Dates**: Store as TEXT in ISO 8601 format (`YYYY-MM-DD` for dates, full ISO for timestamps)
- **Booleans**: SQLite INTEGER (0 or 1)

### Styling (Tailwind CSS 4)
- CSS-first configuration in `src/app/globals.css` using `@import "tailwindcss"` and `@theme` block
- PostCSS plugin: `@tailwindcss/postcss` (NOT `tailwindcss`)
- Mobile-first: write base styles for mobile, add `md:` and `lg:` prefixes for larger screens
- Use CSS custom properties from `@theme` for consistent colors
- Utility function `cn()` from `src/lib/utils.ts` for conditional class merging (clsx + tailwind-merge)

### Component Design
- All interactive elements: minimum 44x44px touch targets on mobile
- Forms: controlled inputs, inline validation errors, loading states on submit
- Lists: empty state component when no data, loading skeleton while fetching
- Modals/drawers: use for forms on mobile (drawer from bottom), dialog on desktop
- Consistent spacing: use Tailwind's spacing scale (p-4, gap-3, etc.)

## Merchant Rule Matching
- Merchant rules use **fuzzy substring matching**: `normalizedName.includes(ruleKey)` where both are lowercased and trimmed
- This means short rule keys (e.g., "at") could match unintended merchants (e.g., "AT&T", "BATH AND BODY")
- Rules are created from actual merchant names via manual category corrections, so keys tend to be specific enough in practice
- Implementation: `src/lib/categorize.ts` — `applyMerchantRules()` function

## OpenAI Integration Pattern
- **Model**: gpt-4o-mini via OpenAI SDK (`src/lib/openai.ts`)
- **Prompt structure**: System prompt defines role + category list; user prompt lists transactions as numbered items with name/merchant
- **Response format**: JSON array of `{id, category}` objects; parser handles markdown-wrapped JSON (```json blocks)
- **Error handling**: Catches API failures, returns error to caller; transactions remain uncategorized on failure
- **Max tokens**: 2048 — may need chunking for very large batches (100+ transactions)
- **Fallback**: Merchant rules are checked FIRST before calling AI; only unmatched transactions hit the API

## Charts
- **Library**: Recharts
- Wrap Recharts components in Client Components (they require DOM access)
- Use ResponsiveContainer for responsive charts
- Consistent color palette matching category colors
