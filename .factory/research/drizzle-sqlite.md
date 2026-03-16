# Drizzle ORM + better-sqlite3 Research Notes

> Based on official Drizzle ORM docs (v1.0 beta).
> Project uses `better-sqlite3` with a local `finance.db` file.

## Setup with better-sqlite3

### Packages Required
```bash
npm i drizzle-orm better-sqlite3
npm i -D drizzle-kit @types/better-sqlite3
```

### Database Connection

```ts
// src/db/index.ts
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

// Option 1: Simple — pass path directly
const db = drizzle('finance.db')

// Option 2: With schema for relational queries
const db = drizzle({
  connection: { source: 'finance.db' },
  schema,
})

// Option 3: With existing driver instance
import Database from 'better-sqlite3'
const sqlite = new Database('finance.db')
const db = drizzle({ client: sqlite, schema })

export { db }
```

### Drizzle Config

```ts
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: 'sqlite',
  dbCredentials: {
    url: 'finance.db',
  },
})
```

---

## Schema Definition Patterns

### SQLite Column Types

| Drizzle Type | SQLite Storage | Notes |
|-------------|----------------|-------|
| `integer()` | INTEGER | Modes: `number`, `boolean`, `timestamp`, `timestamp_ms` |
| `real()` | REAL | 8-byte IEEE floating point |
| `text()` | TEXT | Modes: default, `json`, enum |
| `blob()` | BLOB | Modes: default, `buffer`, `bigint`, `json` |
| `numeric()` | NUMERIC | Modes: default, `number`, `bigint` |

### Schema Example for Personal Finance

```ts
// src/db/schema.ts
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

// Accounts table
export const accounts = sqliteTable('accounts', {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  type: text({ enum: ['checking', 'savings', 'credit', 'cash', 'investment'] }).notNull(),
  balance: real().notNull().default(0),
  currency: text().notNull().default('USD'),
  createdAt: text().notNull().default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text().notNull().default(sql`(CURRENT_TIMESTAMP)`),
})

// Categories table
export const categories = sqliteTable('categories', {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  type: text({ enum: ['income', 'expense'] }).notNull(),
  icon: text(),
  color: text(),
  parentId: integer().references(() => categories.id),
})

// Transactions table
export const transactions = sqliteTable('transactions', {
  id: integer().primaryKey({ autoIncrement: true }),
  amount: real().notNull(),
  description: text(),
  date: text().notNull(), // ISO date string
  type: text({ enum: ['income', 'expense', 'transfer'] }).notNull(),
  accountId: integer().notNull().references(() => accounts.id),
  categoryId: integer().references(() => categories.id),
  createdAt: text().notNull().default(sql`(CURRENT_TIMESTAMP)`),
})

// Budgets table
export const budgets = sqliteTable('budgets', {
  id: integer().primaryKey({ autoIncrement: true }),
  categoryId: integer().notNull().references(() => categories.id),
  amount: real().notNull(),
  period: text({ enum: ['weekly', 'monthly', 'yearly'] }).notNull(),
  startDate: text().notNull(),
  endDate: text(),
})
```

### Key Column Patterns

```ts
// Auto-increment primary key
id: integer().primaryKey({ autoIncrement: true })

// Boolean (stored as 0/1)
isActive: integer({ mode: 'boolean' }).notNull().default(true)

// Timestamp (stored as integer, returns Date)
createdAt: integer({ mode: 'timestamp' }).notNull().default(sql`(unixepoch())`)

// Timestamp in ms
createdAt: integer({ mode: 'timestamp_ms' }).notNull()

// JSON stored as text (recommended over blob for JSON functions)
metadata: text({ mode: 'json' }).$type<{ foo: string }>()

// Enum-like text
status: text({ enum: ['active', 'archived'] }).notNull().default('active')

// Foreign key reference
accountId: integer().notNull().references(() => accounts.id)

// Self-referencing
parentId: integer().references(() => categories.id)

// Default timestamp
createdAt: text().notNull().default(sql`(CURRENT_TIMESTAMP)`)

// Runtime-generated default
id: text().$defaultFn(() => crypto.randomUUID())
```

---

## Relations (v2 — Current)

Drizzle ORM has a v2 relations API. Define relations in the schema:

```ts
import { relations } from 'drizzle-orm'

export const accountsRelations = relations(accounts, ({ many }) => ({
  transactions: many(transactions),
}))

export const categoriesRelations = relations(categories, ({ many, one }) => ({
  transactions: many(transactions),
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
  }),
  children: many(categories),
  budgets: many(budgets),
}))

export const transactionsRelations = relations(transactions, ({ one }) => ({
  account: one(accounts, {
    fields: [transactions.accountId],
    references: [accounts.id],
  }),
  category: one(categories, {
    fields: [transactions.categoryId],
    references: [categories.id],
  }),
}))

export const budgetsRelations = relations(budgets, ({ one }) => ({
  category: one(categories, {
    fields: [budgets.categoryId],
    references: [categories.id],
  }),
}))
```

### Querying with Relations

```ts
// Relational query — requires schema passed to drizzle()
const result = await db.query.transactions.findMany({
  with: {
    account: true,
    category: true,
  },
  where: (transactions, { eq }) => eq(transactions.type, 'expense'),
  orderBy: (transactions, { desc }) => [desc(transactions.date)],
  limit: 50,
})
```

---

## Migrations

### Generate Migrations
```bash
npx drizzle-kit generate
```

### Apply Migrations
```bash
npx drizzle-kit migrate
```

### Push (Dev — No Migration Files)
```bash
npx drizzle-kit push
```

### Drizzle Studio (Visual DB Browser)
```bash
npx drizzle-kit studio
```

---

## Query Patterns

### Select
```ts
import { eq, and, gte, lte, desc, sum } from 'drizzle-orm'

// Basic select
const allTransactions = await db.select().from(transactions)

// With filter
const expenses = await db.select()
  .from(transactions)
  .where(eq(transactions.type, 'expense'))

// With multiple conditions
const monthlyExpenses = await db.select()
  .from(transactions)
  .where(and(
    eq(transactions.type, 'expense'),
    gte(transactions.date, '2026-03-01'),
    lte(transactions.date, '2026-03-31'),
  ))
  .orderBy(desc(transactions.date))

// Aggregation
const totalByCategory = await db.select({
  categoryId: transactions.categoryId,
  total: sum(transactions.amount),
}).from(transactions)
  .where(eq(transactions.type, 'expense'))
  .groupBy(transactions.categoryId)
```

### Insert
```ts
// Single insert
await db.insert(transactions).values({
  amount: 42.50,
  description: 'Groceries',
  date: '2026-03-16',
  type: 'expense',
  accountId: 1,
  categoryId: 3,
})

// Batch insert
await db.insert(transactions).values([
  { amount: 42.50, description: 'Groceries', date: '2026-03-16', type: 'expense', accountId: 1, categoryId: 3 },
  { amount: 2500, description: 'Salary', date: '2026-03-15', type: 'income', accountId: 1, categoryId: 1 },
])

// Insert returning
const [newTx] = await db.insert(transactions)
  .values({ ... })
  .returning()
```

### Update
```ts
await db.update(accounts)
  .set({ balance: 1500.00, updatedAt: new Date().toISOString() })
  .where(eq(accounts.id, 1))
```

### Delete
```ts
await db.delete(transactions)
  .where(eq(transactions.id, 5))
```

### Type Inference
```ts
// Infer select type (what you get from queries)
type Transaction = typeof transactions.$inferSelect

// Infer insert type (what you pass to .values())
type NewTransaction = typeof transactions.$inferInsert
```

---

## Integration with Next.js Server Components

```ts
// app/dashboard/page.tsx — Server Component
import { db } from '@/db'
import { transactions, accounts } from '@/db/schema'
import { desc, eq } from 'drizzle-orm'

export default async function DashboardPage() {
  const recentTransactions = await db.select()
    .from(transactions)
    .orderBy(desc(transactions.date))
    .limit(10)

  const accountBalances = await db.select().from(accounts)

  return (
    <div>
      {/* Render data */}
    </div>
  )
}
```

```ts
// app/actions/transactions.ts — Server Action
'use server'
import { db } from '@/db'
import { transactions } from '@/db/schema'
import { revalidatePath } from 'next/cache'

export async function addTransaction(data: typeof transactions.$inferInsert) {
  await db.insert(transactions).values(data)
  revalidatePath('/dashboard')
}
```

---

## Idiomatic Patterns

### DO
- Store dates as `text` with ISO strings or `integer` with Unix timestamps.
- Use `text({ mode: 'json' })` for JSON data (not `blob`).
- Use `$type<T>()` for type-safe JSON columns.
- Use `$defaultFn()` for runtime defaults (UUIDs, etc.).
- Use `references(() => table.column)` for foreign keys.
- Define relations alongside schema for relational queries.
- Pass `schema` to `drizzle()` to enable relational query API.
- Use `drizzle-kit push` for rapid local dev, `generate`+`migrate` for production.
- Use type inference: `$inferSelect` and `$inferInsert`.

### DON'T
- Don't use `blob({ mode: 'json' })` — SQLite JSON functions don't work with BLOBs.
- Don't forget to pass `schema` to `drizzle()` if using relational queries.
- Don't use `Date` objects directly — SQLite doesn't have native date type.
- Don't forget `notNull()` on required columns — columns are nullable by default.
- Don't use `real()` for money — use `integer()` storing cents, or `text()` for precise amounts.

## Gotchas for Workers

1. **better-sqlite3 is synchronous**: The driver is sync, but Drizzle wraps it in async API. This is fine for Server Components/Actions in Next.js.
2. **No native Date type**: Store as ISO text (`CURRENT_TIMESTAMP`) or Unix integer (`unixepoch()`). Use `integer({ mode: 'timestamp' })` for auto Date conversion.
3. **Money precision**: Use integer cents (e.g., `4250` for $42.50) to avoid floating-point issues with `real()`.
4. **WAL mode**: For concurrent reads during writes, enable WAL mode:
   ```ts
   const sqlite = new Database('finance.db')
   sqlite.pragma('journal_mode = WAL')
   const db = drizzle({ client: sqlite, schema })
   ```
5. **Foreign keys disabled by default** in SQLite. Enable them:
   ```ts
   sqlite.pragma('foreign_keys = ON')
   ```
6. **Single file, single process**: better-sqlite3 doesn't support multi-process access well. Fine for a PWA with one server.
7. **Drizzle Studio**: Run `npx drizzle-kit studio` for a visual DB browser during development.
