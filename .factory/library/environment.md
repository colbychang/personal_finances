# Environment

Environment variables, external dependencies, and setup notes.

**What belongs here:** Required env vars, external API keys/services, dependency quirks, platform-specific notes.
**What does NOT belong here:** Service ports/commands (use `.factory/services.yaml`).

---

## Required Environment Variables

| Variable | Description | Where Used |
|---|---|---|
| `PLAID_CLIENT_ID` | Plaid API client ID | `/api/plaid/*` routes |
| `PLAID_SECRET` | Plaid API secret key | `/api/plaid/*` routes |
| `PLAID_ENV` | Plaid environment (`sandbox` / `development` / `production`) | Plaid client init |
| `OPENAI_API_KEY` | OpenAI API key for GPT-4o-mini | `/api/categorize` route |
| `PLAID_TOKEN_ENCRYPTION_KEY` | AES-256 key for encrypting Plaid access tokens at rest | `src/lib/encryption.ts` |

All stored in `.env.local` (gitignored). Access via `process.env.VARIABLE_NAME` in server-side code only.

**NEVER expose API keys to the client.** All external API calls must go through server-side API routes.

## External Services

### Plaid
- **Purpose**: Connect bank accounts, sync transactions
- **Sandbox mode**: Used for development. Test credentials: `user_good` / `pass_good`
- **Development mode**: For real bank connections (requires Plaid approval)
- **Key gotcha**: Plaid amounts are INVERTED. Positive = money leaving account (debit), Negative = money entering (credit). Must flip sign when storing.
- **See**: `.factory/research/plaid-integration.md` for full API details

### OpenAI
- **Purpose**: Auto-categorize transactions using GPT-4o-mini
- **Model**: `gpt-4o-mini` (cheap, fast, sufficient for classification)
- **Usage**: Send transaction name + merchant, receive category classification
- **Cost**: ~$0.15 per million input tokens, ~$0.60 per million output tokens

## Database

- **Engine**: SQLite via better-sqlite3 (synchronous, embedded)
- **File**: `finance.db` in project root (gitignored)
- **ORM**: Drizzle ORM with `drizzle-orm/better-sqlite3`
- **Migrations**: Managed by `drizzle-kit` (generate + migrate)
- **CRITICAL**: Enable WAL mode (`PRAGMA journal_mode=WAL`) and foreign keys (`PRAGMA foreign_keys=ON`) when creating the connection

## Runtime

- **Node.js**: v20.20.1
- **npm**: 10.8.2
- **OS**: macOS (darwin arm64)
