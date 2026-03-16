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
