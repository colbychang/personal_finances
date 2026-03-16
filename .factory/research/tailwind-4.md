# Tailwind CSS v4 Research Notes

> Based on official Tailwind CSS v4 upgrade guide and docs.
> Project uses Tailwind CSS 4.2.1 with Next.js 16.1.6.

## Fundamental Architecture Change: CSS-First Configuration

Tailwind CSS v4 replaces `tailwind.config.js` with **CSS-based configuration**. All customization happens in your CSS file using `@theme`, `@import`, `@utility`, and `@custom-variant` directives.

### Setup with Next.js (PostCSS)

In v4, the PostCSS plugin lives in `@tailwindcss/postcss` (not `tailwindcss`).

```js
// postcss.config.mjs
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
}
```

No need for `postcss-import` or `autoprefixer` — v4 handles both automatically.

### Main CSS File

```css
/* app/globals.css */
@import "tailwindcss";

/* Theme customization */
@theme {
  --color-primary: #3b82f6;
  --color-primary-dark: #2563eb;
  --font-sans: "Inter", sans-serif;
  --breakpoint-3xl: 120rem;
}
```

**No more `@tailwind base; @tailwind components; @tailwind utilities;`** — just `@import "tailwindcss";`.

---

## Key Changes from v3

### 1. No `tailwind.config.js` by Default
- Configuration is done in CSS with `@theme` directive.
- JS config files still work but must be loaded explicitly with `@config`:
```css
@config "../../tailwind.config.js";
```
- The `corePlugins`, `safelist`, and `separator` JS config options are NOT supported in v4.

### 2. Theme Variables
All theme values are CSS custom properties. Use them directly in CSS:

```css
@theme {
  --color-brand-50: #eff6ff;
  --color-brand-500: #3b82f6;
  --color-brand-900: #1e3a8a;
  --font-display: "Satoshi", sans-serif;
  --breakpoint-3xl: 120rem;
  --radius-card: 0.75rem;
  --spacing-18: 4.5rem;
}
```

Access in JS via CSS variables:
```tsx
// In components
<div style={{ backgroundColor: 'var(--color-brand-500)' }} />
```

### 3. Renamed Utilities (Breaking)

| v3 | v4 |
|----|----|
| `shadow-sm` | `shadow-xs` |
| `shadow` | `shadow-sm` |
| `drop-shadow-sm` | `drop-shadow-xs` |
| `drop-shadow` | `drop-shadow-sm` |
| `blur-sm` | `blur-xs` |
| `blur` | `blur-sm` |
| `backdrop-blur-sm` | `backdrop-blur-xs` |
| `backdrop-blur` | `backdrop-blur-sm` |
| `rounded-sm` | `rounded-xs` |
| `rounded` | `rounded-sm` |
| `outline-none` | `outline-hidden` |
| `ring` | `ring-3` |

### 4. Default Border Color Changed
- v3: `gray-200` by default.
- v4: `currentColor` (matches browser default).
- **Always specify a color** with `border-*` and `divide-*` utilities.

```html
<!-- ✅ Always explicit in v4 -->
<div class="border border-gray-200">...</div>
```

### 5. Default Ring Changed
- Width: 3px → 1px.
- Color: `blue-500` → `currentColor`.
- Use `ring-3 ring-blue-500` for v3 behavior.

### 6. Custom Utilities: `@utility` Replaces `@layer`
v4 uses native CSS cascade layers, so `@layer utilities {}` is replaced by `@utility`:

```css
/* v3 */
@layer utilities {
  .tab-4 { tab-size: 4; }
}

/* v4 */
@utility tab-4 {
  tab-size: 4;
}
```

Component-style utilities also use `@utility`:
```css
@utility btn {
  border-radius: 0.5rem;
  padding: 0.5rem 1rem;
  background-color: ButtonFace;
}
```

### 7. Custom Variants: `@custom-variant`
```css
@custom-variant hover (&:hover);
```

### 8. Variant Stacking Order
- v3: Right to left.
- v4: **Left to right** (matches CSS syntax).

```html
<!-- v3 -->
<ul class="first:*:pt-0">
<!-- v4 -->
<ul class="*:first:pt-0">
```

### 9. Important Modifier Position
- v3: `!bg-red-500` (before utility name).
- v4: `bg-red-500!` (at the end). Old syntax still works but is deprecated.

### 10. Variables in Arbitrary Values
- v3: `bg-[--brand-color]` (square brackets).
- v4: `bg-(--brand-color)` (parentheses).

### 11. Hover on Mobile
`hover` variant now only applies when primary input supports hover:
```css
@media (hover: hover) { .hover\:underline:hover { ... } }
```

### 12. Space-between and Divide Selectors Changed
```css
/* v3 — uses :not([hidden]) ~ :not([hidden]) */
/* v4 — uses :not(:last-child) with margin-bottom */
```
Prefer `flex` + `gap` over `space-*` utilities for new code.

### 13. Container Customization
No more `container.center` or `container.padding` in config. Extend via `@utility`:

```css
@utility container {
  margin-inline: auto;
  padding-inline: 2rem;
}
```

### 14. Gradient Preservation
Gradient values now persist across variants (e.g., `dark:from-blue-500` won't reset `to-*`).
Use `via-none` to explicitly unset a three-stop gradient.

### 15. No Sass/Less/Stylus
Tailwind v4 is NOT designed for use with CSS preprocessors. Use Tailwind as your preprocessor.

### 16. Preflight Changes
- Placeholder color: now `currentColor` at 50% opacity (was `gray-400`).
- Buttons: `cursor: default` (was `cursor: pointer`).
- `<dialog>` margins reset.
- `hidden` attribute takes priority over display utilities.

---

## Configuration Example for Finance PWA

```css
/* app/globals.css */
@import "tailwindcss";

@theme {
  /* Brand colors for finance app */
  --color-income: #22c55e;
  --color-expense: #ef4444;
  --color-savings: #3b82f6;
  --color-neutral-50: #f8fafc;
  --color-neutral-900: #0f172a;

  /* Typography */
  --font-sans: "Inter", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", monospace;

  /* Spacing for cards and sections */
  --radius-card: 0.75rem;
  --radius-button: 0.5rem;
}

/* Base styles */
@layer base {
  body {
    font-family: var(--font-sans);
    color: var(--color-neutral-900);
    background: var(--color-neutral-50);
  }
}

/* Custom utilities */
@utility currency {
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum";
}
```

---

## Idiomatic Patterns

### DO
- Use `@import "tailwindcss"` — single import replaces three `@tailwind` directives.
- Use `@theme` for all design tokens (colors, fonts, spacing).
- Use CSS variables directly: `var(--color-brand-500)`.
- Use `@utility` for custom component classes.
- Use `gap` instead of `space-*` for new layouts.
- Always specify border colors explicitly.
- Use `ring-3` instead of `ring` if you want 3px rings.
- Use `outline-hidden` instead of `outline-none` for accessibility.
- Use `shadow-xs` for subtle shadows (was `shadow-sm` in v3).

### DON'T
- Don't use `@tailwind base/components/utilities` — removed.
- Don't use `tailwind.config.js` unless migrating legacy code (use `@theme` instead).
- Don't use `@layer utilities {}` — use `@utility` instead.
- Don't use `bg-opacity-*`, `text-opacity-*`, etc. — use `/50` modifier syntax.
- Don't use `flex-shrink-*`/`flex-grow-*` — use `shrink-*`/`grow-*`.
- Don't use Sass/Less with Tailwind v4.
- Don't assume `ring` is 3px — it's now 1px.
- Don't assume border/divide default to gray — they use `currentColor`.

## Gotchas for Workers

1. **No `tailwind.config.js`**: New projects don't have one. All config in CSS.
2. **PostCSS plugin changed**: Package is `@tailwindcss/postcss`, not `tailwindcss`.
3. **`theme()` function**: Still works but use CSS variables instead. In media queries, use `theme(--breakpoint-xl)` (CSS var name syntax, not dot notation).
4. **CSS modules / Vue / Svelte**: Use `@reference "../../app.css"` to access theme in isolated stylesheets.
5. **Browser support**: Requires Safari 16.4+, Chrome 111+, Firefox 128+. No IE/older browser support.
6. **Button cursor**: Buttons default to `cursor: default` now. Add `cursor-pointer` explicitly or add base style.
