# Plaid Link Integration Research

> Researched 2026-03-16 | plaid v41.4.0 | react-plaid-link v4.1.1

---

## Table of Contents

1. [Complete Link Flow Overview](#1-complete-link-flow-overview)
2. [API Endpoint Details](#2-api-endpoint-details)
3. [react-plaid-link Hook Usage Patterns](#3-react-plaid-link-hook-usage-patterns)
4. [Transaction Sync](#4-transaction-sync)
5. [Sandbox Testing](#5-sandbox-testing)
6. [Security Considerations](#6-security-considerations)
7. [Gotchas and Common Mistakes](#7-gotchas-and-common-mistakes)

---

## 1. Complete Link Flow Overview

The Plaid Link integration follows a 5-step flow:

```
┌─────────────────────────────────────────────────────────────────────┐
│  1. Server: Create link_token via /link/token/create                │
│  2. Client: Initialize Link UI with link_token (usePlaidLink hook)  │
│  3. User: Authenticates with bank → receives public_token            │
│  4. Server: Exchange public_token → access_token via                 │
│             /item/public_token/exchange                              │
│  5. Server: Use access_token to fetch transactions via               │
│             /transactions/sync                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### Step-by-Step:

**Step 1: Create Link Token (Server-side)**
- Your Next.js API route calls `/link/token/create` with your `client_id`, `secret`, `user.client_user_id`, `products` (e.g., `["transactions"]`), `country_codes` (e.g., `["US"]`), and `language`.
- Returns a short-lived `link_token` (expires after 4 hours, single use).

**Step 2: Initialize Link UI (Client-side)**
- Pass the `link_token` to the `usePlaidLink` hook from `react-plaid-link`.
- When `ready` is `true`, call `open()` to show the Plaid Link modal.

**Step 3: User Authenticates**
- User selects their bank, enters credentials, completes MFA if needed.
- On success, `onSuccess` callback fires with a `public_token` and metadata.

**Step 4: Exchange Public Token (Server-side)**
- Client sends `public_token` to your API route.
- Server calls `/item/public_token/exchange` to get a permanent `access_token` and `item_id`.
- Store `access_token` encrypted in your database. **Never expose it to the client.**

**Step 5: Fetch Transactions (Server-side)**
- Use `access_token` with `/transactions/sync` (cursor-based) to get transaction data.
- Store the `cursor` for incremental updates.

---

## 2. API Endpoint Details

### POST `/link/token/create`

Creates a `link_token` for initializing Link.

**Request:**
```typescript
// Next.js API Route: /api/plaid/create-link-token
import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from 'plaid';

const plaidClient = new PlaidApi(
  new Configuration({
    basePath: PlaidEnvironments.sandbox, // or .production
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
        'PLAID-SECRET': process.env.PLAID_SECRET,
      },
    },
  })
);

const response = await plaidClient.linkTokenCreate({
  user: { client_user_id: 'unique-user-id' },
  client_name: 'Personal Finance App',
  products: [Products.Transactions],
  country_codes: [CountryCode.Us],
  language: 'en',
});

// Response shape:
// {
//   link_token: "link-sandbox-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
//   expiration: "2026-03-16T20:00:00Z",  // 4 hours from creation
//   request_id: "xxxxxxx"
// }
```

### POST `/item/public_token/exchange`

Exchanges a `public_token` for an `access_token`.

**Request:**
```typescript
// Next.js API Route: /api/plaid/exchange-token
const response = await plaidClient.itemPublicTokenExchange({
  public_token: publicToken, // from onSuccess callback
});

// Response shape:
// {
//   access_token: "access-sandbox-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
//   item_id: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
//   request_id: "xxxxxxx"
// }
```

**Important:** The `access_token` is permanent and does not expire. Store it securely (encrypted at rest).

### POST `/transactions/sync`

Fetches transactions using a cursor-based pagination approach.

**Request:**
```typescript
const response = await plaidClient.transactionsSync({
  access_token: accessToken,
  cursor: cursor,      // empty string "" for first call, stored cursor for subsequent
  count: 500,          // max 500 per page
  options: {
    include_original_description: true,
    include_personal_finance_category: true,
  },
});

// Response shape:
// {
//   accounts: [{ account_id, balances, mask, name, official_name, type, subtype }],
//   added: [Transaction],     // new transactions
//   modified: [Transaction],  // updated transactions
//   removed: [{ transaction_id }],  // deleted transactions
//   next_cursor: "string",    // save this for next sync
//   has_more: boolean,        // true if more pages available
//   request_id: "string",
//   transaction_update_status: "HISTORICAL_UPDATE_COMPLETE" | "INITIAL_UPDATE_COMPLETE" | "NOT_READY"
// }
```

**Transaction Object Shape:**
```typescript
interface Transaction {
  account_id: string;
  transaction_id: string;
  amount: number;                    // positive = money out, negative = money in
  iso_currency_code: string | null;  // e.g., "USD"
  date: string;                      // "YYYY-MM-DD"
  authorized_date: string | null;    // when initiated
  name: string;                      // merchant/description
  merchant_name: string | null;      // enriched merchant name
  payment_channel: 'online' | 'in store' | 'other';
  pending: boolean;
  pending_transaction_id: string | null;
  category: string[] | null;         // legacy category hierarchy
  category_id: string | null;
  personal_finance_category: {
    primary: string;                 // e.g., "FOOD_AND_DRINK"
    detailed: string;                // e.g., "FOOD_AND_DRINK_RESTAURANTS"
    confidence_level: string;        // "VERY_HIGH", "HIGH", "MEDIUM", "LOW"
  } | null;
  location: {
    address: string | null;
    city: string | null;
    region: string | null;
    postal_code: string | null;
    country: string | null;
    lat: number | null;
    lon: number | null;
    store_number: string | null;
  };
  logo_url: string | null;
  website: string | null;
  check_number: string | null;
}
```

### POST `/transactions/refresh`

Forces Plaid to check for new transactions (normally checks 1-4 times/day).

```typescript
await plaidClient.transactionsRefresh({
  access_token: accessToken,
});
// Returns: { request_id: "string" }
// Listen for SYNC_UPDATES_AVAILABLE webhook after this.
```

### POST `/accounts/balance/get`

Get real-time account balances.

```typescript
const response = await plaidClient.accountsBalanceGet({
  access_token: accessToken,
});
// Returns accounts with current balance info
```

---

## 3. react-plaid-link Hook Usage Patterns

### Basic Hook Usage (Recommended Pattern)

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePlaidLink, PlaidLinkOnSuccess, PlaidLinkOnExit, PlaidLinkOptions } from 'react-plaid-link';

export function PlaidLinkButton() {
  const [linkToken, setLinkToken] = useState<string | null>(null);

  // Step 1: Fetch link token from your API
  useEffect(() => {
    async function fetchLinkToken() {
      const response = await fetch('/api/plaid/create-link-token', {
        method: 'POST',
      });
      const data = await response.json();
      setLinkToken(data.link_token);
    }
    fetchLinkToken();
  }, []);

  // Step 2: Handle success - exchange public_token for access_token
  const onSuccess = useCallback<PlaidLinkOnSuccess>(
    async (publicToken, metadata) => {
      console.log('Linked institution:', metadata.institution);
      console.log('Accounts:', metadata.accounts);

      // Send public_token to your server for exchange
      await fetch('/api/plaid/exchange-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          public_token: publicToken,
          institution_id: metadata.institution?.institution_id,
          institution_name: metadata.institution?.name,
          accounts: metadata.accounts,
        }),
      });
    },
    [],
  );

  // Step 3: Handle exit (user closes Link or error occurs)
  const onExit = useCallback<PlaidLinkOnExit>(
    (error, metadata) => {
      if (error) {
        console.error('Link error:', error);
        // Handle INVALID_LINK_TOKEN by regenerating token
        if (error.error_code === 'INVALID_LINK_TOKEN') {
          // Regenerate link token
        }
      }
      console.log('Exit metadata:', metadata);
    },
    [],
  );

  // Step 4: Configure and use the hook
  const config: PlaidLinkOptions = {
    token: linkToken,   // can be null initially - hook handles this
    onSuccess,
    onExit,
    onEvent: (eventName, metadata) => {
      console.log('Plaid event:', eventName, metadata);
    },
  };

  const { open, ready, error } = usePlaidLink(config);

  return (
    <button
      onClick={() => open()}
      disabled={!ready}
    >
      Connect Bank Account
    </button>
  );
}
```

### Key Hook Behaviors

| Property | Type | Description |
|----------|------|-------------|
| `token` | `string \| null` | Can be `null` initially; hook reinitializes when token arrives |
| `open` | `() => void` | Opens Link modal. Only call when `ready` is `true` |
| `ready` | `boolean` | `true` when Link is fully loaded and can be opened |
| `exit` | `(opts?) => void` | Programmatically close Link. `{ force: true }` skips confirmation |
| `error` | `ErrorEvent \| null` | Non-null if Link script failed to load |
| `submit` | `(data) => void` | For Layer product only |

### onSuccess Metadata Shape

```typescript
interface PlaidLinkOnSuccessMetadata {
  institution: {
    name: string;           // e.g., "Wells Fargo"
    institution_id: string; // e.g., "ins_4"
  } | null;
  accounts: Array<{
    id: string;             // Plaid account_id
    name: string;           // e.g., "Plaid Checking"
    mask: string;           // e.g., "0000"
    type: string;           // e.g., "depository"
    subtype: string;        // e.g., "checking"
    verification_status: string | null;
  }>;
  link_session_id: string;
}
```

### Auto-open Pattern (for OAuth redirects)

```tsx
const { open, ready } = usePlaidLink(config);

useEffect(() => {
  if (ready) {
    open();
  }
}, [ready, open]);
```

### Cleanup

- On unmount, `usePlaidLink` automatically destroys the Link instance (no manual cleanup needed).
- If using the vanilla JS SDK, call `destroy()` manually.

---

## 4. Transaction Sync

### How `/transactions/sync` Works

The sync endpoint uses a **cursor-based** approach for incremental updates:

1. **Initial sync** (cursor = `""`): Returns ALL historical transactions.
2. **Incremental sync** (cursor = last saved `next_cursor`): Returns only changes since last sync.
3. **Pagination**: If `has_more` is `true`, keep calling with `next_cursor` until `has_more` is `false`.

### Full Sync Implementation

```typescript
async function syncTransactions(accessToken: string, savedCursor: string | null) {
  let cursor = savedCursor ?? '';
  let added: Transaction[] = [];
  let modified: Transaction[] = [];
  let removed: RemovedTransaction[] = [];
  let hasMore = true;

  // Track the starting cursor for error recovery
  const paginationStartCursor = cursor;

  try {
    while (hasMore) {
      const response = await plaidClient.transactionsSync({
        access_token: accessToken,
        cursor: cursor,
        count: 500,
      });

      const data = response.data;
      added = added.concat(data.added);
      modified = modified.concat(data.modified);
      removed = removed.concat(data.removed);
      hasMore = data.has_more;
      cursor = data.next_cursor;
    }
  } catch (error) {
    // IMPORTANT: On pagination failure (e.g., TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION),
    // restart the ENTIRE pagination loop from paginationStartCursor, not just retry the failed page
    if (error.response?.data?.error_code === 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION') {
      return syncTransactions(accessToken, paginationStartCursor);
    }
    throw error;
  }

  // Apply updates to database
  await applyTransactionUpdates(added, modified, removed);

  // Save cursor for next incremental sync
  await saveCursor(accessToken, cursor);

  return { added, modified, removed, cursor };
}
```

### When Transactions are Available

- **Initial update**: Basic transactions available within seconds to minutes after Item creation.
- **Historical update**: Up to 24 months of history, may take minutes to hours.
- **Ongoing updates**: Plaid checks 1-4 times per day automatically.
- Use `/transactions/refresh` to force a check.

### Webhooks for Transaction Sync

Listen for `SYNC_UPDATES_AVAILABLE` webhook (preferred for `/transactions/sync`):

```json
{
  "webhook_type": "TRANSACTIONS",
  "webhook_code": "SYNC_UPDATES_AVAILABLE",
  "item_id": "wz666MBjYWTp2PDzzggYhM6oWWmBb",
  "initial_update_complete": true,
  "historical_update_complete": true,
  "environment": "production"
}
```

### Transaction Amount Convention

**IMPORTANT:** Plaid's amount sign convention:
- **Positive values** = money moving OUT of account (debits, purchases)
- **Negative values** = money moving INTO account (credits, deposits, refunds)

This is the opposite of what many users expect. You may want to negate amounts for display:
```typescript
const displayAmount = -transaction.amount; // positive = income, negative = expense
```

---

## 5. Sandbox Testing

### Environment Setup

```typescript
import { PlaidEnvironments } from 'plaid';

// Use sandbox for development
const basePath = PlaidEnvironments.sandbox; // https://sandbox.plaid.com
```

### Test Credentials

| Username | Password | Use Case |
|----------|----------|----------|
| `user_good` | `pass_good` | Basic account access, most products |
| `user_transactions_dynamic` | any | Realistic transaction history that updates |
| `user_good` | `mfa_device` | Test MFA device OTP flow (code: `1234`) |
| `user_good` | `error_INVALID_CREDENTIALS` | Simulate invalid credentials error |
| `user_good` | `error_ITEM_LOCKED` | Simulate locked item error |

### Sandbox Institutions

| Institution | ID | Notes |
|-------------|-----|-------|
| First Platypus Bank | `ins_109508` | Non-OAuth, best for testing |
| First Gingham Credit Union | `ins_109509` | Non-OAuth |
| Tattersall Federal Credit Union | `ins_109510` | Non-OAuth |
| Tartan Bank | `ins_109511` | Non-OAuth |
| Platypus OAuth Bank | `ins_127287` | OAuth flow testing |

**Note:** All Production institutions (including Alliant Credit Union, American Express, Capital One, Wealthfront) are also available in Sandbox. However, for reliable automated testing, use the Sandbox-specific institutions above.

### Programmatic Sandbox Testing (No Link UI)

Use `/sandbox/public_token/create` to skip the Link UI entirely:

```typescript
// Create a public token directly (Sandbox only)
const response = await plaidClient.sandboxPublicTokenCreate({
  institution_id: 'ins_109508',  // First Platypus Bank
  initial_products: [Products.Transactions],
});
const publicToken = response.data.public_token;

// Exchange for access_token as normal
const exchangeResponse = await plaidClient.itemPublicTokenExchange({
  public_token: publicToken,
});
const accessToken = exchangeResponse.data.access_token;
```

### Testing Transactions in Sandbox

For dynamic transaction testing:

```typescript
// Use user_transactions_dynamic for realistic, updating transaction data
// After creating the item, call /transactions/refresh to trigger new transactions

await plaidClient.transactionsRefresh({ access_token: accessToken });
// Wait for SYNC_UPDATES_AVAILABLE webhook, then call /transactions/sync
```

You can also fire test webhooks:

```typescript
await plaidClient.sandboxItemFireWebhook({
  access_token: accessToken,
  webhook_code: 'SYNC_UPDATES_AVAILABLE' as any,
  webhook_type: 'TRANSACTIONS' as any,
});
```

---

## 6. Security Considerations

### Token Storage

| Token | Lifetime | Storage | Exposure |
|-------|----------|---------|----------|
| `link_token` | 4 hours, single-use | Ephemeral (client state) | Client-side OK |
| `public_token` | 30 minutes, single-use | Ephemeral (exchange immediately) | Client → Server only |
| `access_token` | Permanent | **Encrypted in database** | **Server-side ONLY** |
| `item_id` | Permanent | Database | Server-side preferred |
| `PLAID_CLIENT_ID` | Permanent | Environment variable | **Server-side ONLY** |
| `PLAID_SECRET` | Permanent | Environment variable | **Server-side ONLY** |

### Critical Security Rules

1. **Never expose `access_token` to the client.** All Plaid API calls using `access_token` must happen server-side (Next.js API routes / Route Handlers).

2. **Encrypt `access_token` at rest.** Use AES-256-GCM or similar. Store the encryption key in environment variables or a secrets manager, not in the database.

   ```typescript
   import crypto from 'crypto';

   const ENCRYPTION_KEY = process.env.PLAID_TOKEN_ENCRYPTION_KEY!; // 32 bytes hex
   const ALGORITHM = 'aes-256-gcm';

   function encrypt(text: string): string {
     const iv = crypto.randomBytes(16);
     const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
     let encrypted = cipher.update(text, 'utf8', 'hex');
     encrypted += cipher.final('hex');
     const authTag = cipher.getAuthTag().toString('hex');
     return `${iv.toString('hex')}:${authTag}:${encrypted}`;
   }

   function decrypt(encryptedText: string): string {
     const [ivHex, authTagHex, encrypted] = encryptedText.split(':');
     const decipher = crypto.createDecipheriv(
       ALGORITHM,
       Buffer.from(ENCRYPTION_KEY, 'hex'),
       Buffer.from(ivHex, 'hex')
     );
     decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
     let decrypted = decipher.update(encrypted, 'hex', 'utf8');
     decrypted += decipher.final('utf8');
     return decrypted;
   }
   ```

3. **Validate the `public_token` exchange immediately.** The `public_token` expires in 30 minutes and is single-use.

4. **Use HTTPS everywhere** in production.

5. **Store Plaid credentials (`PLAID_CLIENT_ID`, `PLAID_SECRET`) in environment variables.** Never commit them to source control.

6. **Webhook verification**: In production, verify webhook signatures to ensure requests come from Plaid.

---

## 7. Gotchas and Common Mistakes

### 1. Transaction Amount Signs
Plaid uses the **opposite** convention from most banking apps:
- Positive = money OUT (expenses)
- Negative = money IN (income)

### 2. `link_token` is Single-Use
Each Link session requires a fresh `link_token`. If the user closes Link and wants to try again, you must create a new `link_token`.

### 3. Transactions Not Immediately Available
After Item creation, transactions may not be ready for seconds to minutes. The `transaction_update_status` field in `/transactions/sync` response tells you:
- `NOT_READY`: Still loading
- `INITIAL_UPDATE_COMPLETE`: Recent transactions ready, historical still loading
- `HISTORICAL_UPDATE_COMPLETE`: All transactions ready

Best practice: Listen for the `SYNC_UPDATES_AVAILABLE` webhook instead of polling.

### 4. Pagination Error Recovery for `/transactions/sync`
If `TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION` error occurs, you **must restart from the first cursor of that pagination batch**, not just retry the failed page.

### 5. `usePlaidLink` Token Can Be Null
The hook accepts `token: null` and will reinitialize when the token arrives. This is the intended pattern for async token fetching:
```tsx
const [token, setToken] = useState<string | null>(null);
// fetch token asynchronously...
const { open, ready } = usePlaidLink({ token, onSuccess });
// ready will be false until token is set and Link loads
```

### 6. Don't Initialize Products You Don't Need
Adding products to the `products` array in `/link/token/create` limits which institutions are shown. Only list products you actually need. Use `optional_products` or `additional_consented_products` for nice-to-have products.

### 7. Cursor Must Be Stored Per Item
Each Plaid Item (bank connection) has its own sync cursor. Store cursors alongside the `item_id` in your database.

### 8. Pending Transactions
Pending transactions may change their `transaction_id` when they post. Use the `pending_transaction_id` field on posted transactions to match them with their pending counterparts. When processing sync results, always handle the `modified` and `removed` arrays.

### 9. Rate Limits
Plaid has rate limits. For `/transactions/sync`, the limit is typically generous, but avoid calling it in tight loops without the cursor/has_more pattern.

### 10. Sandbox vs Production Differences
- Sandbox uses `https://sandbox.plaid.com`
- Production uses `https://production.plaid.com`
- Some institution behaviors differ in Sandbox (OAuth flows show generic Platypus OAuth)
- Custom test credentials only work with non-OAuth institutions or `/sandbox/public_token/create`

---

## Sources

- [Plaid Link Web SDK Docs](https://plaid.com/docs/link/web/)
- [react-plaid-link GitHub](https://github.com/plaid/react-plaid-link)
- [Plaid API - Link Token Create](https://plaid.com/docs/api/link/#linktokencreate)
- [Plaid API - Transactions](https://plaid.com/docs/api/products/transactions/)
- [Plaid Sandbox Test Credentials](https://plaid.com/docs/sandbox/test-credentials/)
- [Plaid Sandbox Institutions](https://plaid.com/docs/sandbox/institutions/)
