# Software Inventory and EOL Review

Review this inventory at least quarterly and before major production releases. Upgrade or replace components before vendor end-of-life dates.

| Component | Current Source | Review Action |
| --- | --- | --- |
| Node.js | `package.json`, Vercel runtime, local dev environment | Use active LTS in CI and Vercel |
| Next.js | `package.json` | Track framework security releases and upgrade promptly |
| React | `package.json` | Track security releases |
| Supabase JS/SSR | `package.json` | Track auth/database client security releases |
| Plaid SDK | `package.json` | Track Plaid SDK and API compatibility notices |
| OpenAI SDK | `package.json` | Track SDK security and API updates |
| Drizzle ORM / postgres client | `package.json` | Track database client security releases |
| Vercel platform | Vercel project settings | Confirm supported build/runtime settings |
| Supabase Postgres | Supabase project settings | Confirm project is on a supported Postgres version |
| Operator laptop OS/browser | Local device settings | Keep OS/browser security patches current |

## Review Checklist

- Run `npm outdated` or review Dependabot updates.
- Review GitHub Dependabot alerts.
- Confirm GitHub Actions uses a supported Node.js version.
- Confirm Vercel production uses a supported Node.js/runtime setting.
- Confirm Supabase Postgres version is supported.
- Confirm Plaid SDK/API notices do not require migration.
- Record any upgrade exceptions with owner and deadline.

Owner: Colby Chang  
Review frequency: Quarterly  
Last reviewed: 2026-04-21
