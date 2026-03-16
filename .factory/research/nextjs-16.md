# Next.js 16 Research Notes

> Based on official Next.js 16 blog post (Oct 2025), Next.js 16.1 (Dec 2025), and upgrade guide.
> Project uses Next.js 16.1.6, React 19.2.4.

## Key Changes from Next.js 15

### 1. Turbopack is Now the Default Bundler
- **Turbopack is stable and default** for both `next dev` and `next build` — no flags needed.
- 2–5× faster production builds, up to 10× faster Fast Refresh.
- If a custom `webpack` config exists, builds will **fail** by default. Use `--webpack` flag to opt out.
- Turbopack config moved from `experimental.turbopack` → top-level `turbopack` in `next.config.ts`.

```ts
// next.config.ts — Turbopack config (if needed)
import type { NextConfig } from 'next'
const nextConfig: NextConfig = {
  turbopack: {
    // resolveAlias, etc.
  },
}
export default nextConfig
```

### 2. Async Request APIs (Breaking)
- `cookies()`, `headers()`, `draftMode()`, `params`, `searchParams` are **only** async now.
- Synchronous access (deprecated in v15) is **fully removed**.
- All page/layout components receiving `params` or `searchParams` must `await` them.

```tsx
// ✅ Correct in Next.js 16
export default async function Page({ params, searchParams }: PageProps<'/blog/[slug]'>) {
  const { slug } = await params
  const query = await searchParams
  return <h1>{slug}</h1>
}
```

### 3. `proxy.ts` Replaces `middleware.ts`
- `middleware.ts` is **deprecated**. Rename to `proxy.ts`.
- Export function name: `proxy` (not `middleware`).
- Runs on Node.js runtime (not Edge). Edge users keep `middleware.ts` for now.
- Config rename: `skipMiddlewareUrlNormalize` → `skipProxyUrlNormalize`.

```ts
// proxy.ts
export function proxy(request: NextRequest) {
  return NextResponse.redirect(new URL('/home', request.url))
}
```

### 4. Cache Components (`"use cache"` directive)
- Replaces `experimental.ppr` and `experimental.dynamicIO`.
- Opt-in caching model — **all dynamic code runs at request time by default**.
- Enable with `cacheComponents: true` in `next.config.ts`.
- Uses `"use cache"` directive for pages, components, functions.

```ts
const nextConfig = {
  cacheComponents: true,
}
```

### 5. New Caching APIs
- **`revalidateTag(tag, cacheLifeProfile)`** — requires second arg (`'max'`, `'hours'`, `'days'`, or `{ expire: N }`).
- **`updateTag(tag)`** — new Server Actions-only API for read-your-writes semantics.
- **`refresh()`** — new Server Actions-only API for refreshing uncached data.
- **`cacheLife`** and **`cacheTag`** — now stable (no `unstable_` prefix).

```ts
'use server'
import { updateTag } from 'next/cache'

export async function updateProfile(userId: string, data: Profile) {
  await db.users.update(userId, data)
  updateTag(`user-${userId}`) // User sees changes immediately
}
```

### 6. React 19.2 Features
- **View Transitions**: Animate elements during navigation/transitions.
- **`useEffectEvent()`**: Extract non-reactive logic from Effects.
- **`<Activity>`**: Render background UI with `display: none` while preserving state.

### 7. React Compiler (Stable)
- Config promoted from `experimental.reactCompiler` → `reactCompiler: true`.
- Not enabled by default. Requires `babel-plugin-react-compiler`.
- Increases compile times (uses Babel).

### 8. Enhanced Routing
- **Layout deduplication**: Shared layouts downloaded once across prefetched links.
- **Incremental prefetching**: Only missing parts are prefetched.
- No code changes required.

### 9. `next/image` Changes
- `minimumCacheTTL` default: 60s → 4 hours (14400s).
- `imageSizes` default: removed `16` from the array.
- `qualities` default: `[75]` only (was `[1..100]`).
- Local images with query strings require `images.localPatterns.search` config.
- `images.dangerouslyAllowLocalIP` blocks local IP optimization by default.
- `images.maximumRedirects` default: 3 (was unlimited).

### 10. Removals
| Removed | Replacement |
|---------|-------------|
| AMP support | Removed entirely |
| `next lint` command | Use ESLint or Biome directly |
| `serverRuntimeConfig` / `publicRuntimeConfig` | Use `.env` files + `NEXT_PUBLIC_` prefix |
| `devIndicators` options | Removed (indicator remains) |
| `next/legacy/image` | Use `next/image` (deprecated, not yet removed) |
| `images.domains` | Use `images.remotePatterns` (deprecated) |
| `experimental.ppr` | Use `cacheComponents` |

### 11. Parallel Routes
- All parallel route slots now require explicit `default.js` files.
- Builds will fail without them.
- Create `default.js` that returns `null` or calls `notFound()`.

### 12. ESLint Flat Config
- `@next/eslint-plugin-next` defaults to ESLint Flat Config format.
- `next lint` removed — run ESLint directly.

---

## Recommended Project Structure (App Router)

```
app/
├── layout.tsx          # Root layout
├── page.tsx            # Home page
├── globals.css         # Global styles (Tailwind import)
├── (dashboard)/        # Route group
│   ├── layout.tsx
│   ├── page.tsx
│   └── transactions/
│       ├── page.tsx
│       └── [id]/
│           └── page.tsx
├── api/
│   └── route.ts        # API routes
proxy.ts                # Replaces middleware.ts
next.config.ts          # TypeScript config (native TS support)
```

## Idiomatic Patterns

### DO
- Use `async/await` for all request APIs (`params`, `searchParams`, `cookies()`, `headers()`).
- Use `next.config.ts` (TypeScript) — native TS support in Next.js 16.
- Use Server Components by default; add `'use client'` only when needed.
- Use Server Actions (`'use server'`) for mutations.
- Use `updateTag()` for interactive features needing immediate feedback.
- Use `revalidateTag(tag, 'max')` for background revalidation of static content.
- Use `proxy.ts` for request interception (auth checks, redirects).
- Use `images.remotePatterns` instead of `images.domains`.

### DON'T
- Don't use synchronous `params`/`searchParams` — they're removed.
- Don't use `middleware.ts` — it's deprecated.
- Don't use `experimental.ppr` — use `cacheComponents`.
- Don't use `next lint` — use ESLint CLI directly.
- Don't rely on `--turbopack` flag — it's the default now.
- Don't add `serverRuntimeConfig`/`publicRuntimeConfig` — use env vars.

## Gotchas for Workers

1. **TypeScript `PageProps` helper**: Run `npx next typegen` to auto-generate type helpers for async params.
2. **Turbopack + custom webpack**: If any plugin adds webpack config, builds fail. Use `--webpack` flag or migrate.
3. **`default.js` required**: Parallel route slots without `default.js` will cause build failures.
4. **Scroll behavior changed**: `scroll-behavior: smooth` on `<html>` is no longer overridden. Add `data-scroll-behavior="smooth"` if needed.
5. **Dev and build use separate output dirs**: Enables concurrent execution but may surprise existing CI setups.
6. **Lockfile mechanism**: Prevents multiple `next dev` or `next build` instances on same project.
