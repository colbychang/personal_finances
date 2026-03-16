# User Testing

## Validation Surface

- **Primary surface**: Web browser (Next.js app at http://localhost:3000)
- **Tool**: agent-browser (located at `~/.factory/bin/agent-browser`)
- **Responsive testing widths**:
  - Mobile: 375px (iPhone SE / small phone)
  - Tablet: 768px (iPad portrait)
  - Desktop: 1280px (standard laptop)

## Validation Concurrency

- **Machine specs**: 24 GB RAM, 10 CPU cores (Apple Silicon)
- **Baseline load**: ~5.7/10 CPU cores, ~4.4 GB reclaimable RAM
- **Max concurrent agent-browser instances**: 3

**Calculation**:
- Memory: Each Chromium instance ~400 MB. Dev server ~400 MB. 3 browsers = 1.2 GB + 0.4 GB server = 1.6 GB. Within 4.4 GB * 0.7 = 3.1 GB budget.
- CPU: Each browser ~0.75 cores. 3 browsers = 2.25 cores + 0.5 server = 2.75 cores. Within 4.3 free * 0.7 = 3.0 cores budget.
- Bottleneck: CPU (tighter constraint)

## Testing Notes

- **Auth**: Single-user app, no authentication required. All pages accessible directly.
- **Plaid sandbox**: Use test credentials `user_good` / `pass_good` when testing bank connection flows. Test institution: First Platypus Bank (`ins_109508`).
- **Seed data**: The project should have seed data (sample accounts, transactions, budgets) for meaningful validation. Seed script at `src/db/seed.ts`.
- **Database isolation**: Tests should use a separate test database file (e.g., `test.db`) to avoid corrupting development data.
- **Empty states**: Test with empty database to verify empty state UIs, then with seed data for populated views.
- **AI categorization**: OpenAI API key is configured in `.env.local`. Auto-categorization tests will make real API calls (GPT-4o-mini is cheap).

## Flow Validator Guidance: Browser

### App URL
- Base URL: http://localhost:3000
- No authentication required (single-user app)

### Navigation Structure
- **Mobile** (<=768px): Bottom tab bar with Dashboard, Transactions, Budgets, Accounts, More
- **Desktop** (>768px): Sidebar navigation with all page links
- Key routes: `/`, `/transactions`, `/budgets`, `/accounts`, `/categories`, `/settings`

### Existing Seed Data
The database has pre-seeded data for the current month (2026-03):
- **Accounts**: Alliant Checking ($8,125.43), Alliant Savings ($25,000.00), Capital One Quicksilver CC ($2,500.34), Wealthfront Investment ($156,789.00)
- **Transactions**: ~12 transactions for March 2026 including rent, groceries, eating out, subscriptions, insurance, clothing, home goods, income, and a transfer
- **Budgets**: Set for March 2026 for Rent/Home ($2,000), Groceries ($600), Eating Out ($300), Bars/Clubs ($200), Clothing ($150), Insurance ($150), Subscriptions ($50), Home Goods ($100)
- **Categories**: 11 predefined categories seeded

### Isolation Rules for Concurrent Testing
- **DO NOT delete seed accounts** (IDs 1-4) — other validators depend on them
- **DO NOT delete seed transactions** (IDs 1-12) — budget calculations depend on them
- When creating test data, use distinctive names prefixed with the group name (e.g., "TEST-NAV: My Account")
- Clean up any test data you create at the end of your test flow if it could interfere with other groups
- All validators share one database — be careful with destructive operations

### Browser Sessions
- Each subagent must use a unique agent-browser session ID
- Use desktop viewport (1280px) by default for most tests
- Switch to mobile (375px) viewport only when specifically testing responsive/mobile assertions
- Take screenshots as evidence for each assertion tested
