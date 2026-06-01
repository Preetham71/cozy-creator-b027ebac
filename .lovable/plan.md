# Plan

## 1. Admin/User toggle on landing page (`src/routes/index.tsx`)

Mirror the exact pattern already used in `src/routes/chat.tsx`:
- Add local `adminView` state, default `false`, set to `true` in a `useEffect` when `useAdmin()` returns true (same as chat).
- Render a `Switch` (from `@/components/ui/switch`) in the landing header, only when `isAdmin` is true, with the same `"Admin" / "User"` label.
- Gate the existing Admin temperature panel on `adminView` instead of `isAdmin`, so flipping the switch hides it.
- No other UI/layout changes on the landing page.

The chat page already has its toggle — leave it untouched. Both pages will then have the same toggle, each with local state (consistent with the existing chat implementation).

## 2. Update product image URLs from the new catalog

Products live in the Supabase `products` table (676 rows), not in a JSON file. The user's "modify the JSON" request maps to updating the `image_url` column for each product from the new MD file.

Steps:
- Copy `user-uploads://products-catalog-enriched-2.md` to `/tmp/catalog.md`.
- Run a Python script that parses the MD, extracting `(ID, Image URL)` pairs from each product block (regex on `**ID:** \`...\`` and `**Image:** ...` lines).
- Generate a single migration with `UPDATE public.products SET image_url = CASE id WHEN ... THEN ... ... END WHERE id IN (...)` (or batch UPDATEs) — applied via the migration tool so the change is persisted.
- Verify by counting rows where `image_url` changed and spot-checking a few IDs.

Only `image_url` is modified. Names, prices, categories, tags, descriptions, and all other columns are left as-is. No other components are touched.

## Out of scope
- No changes to `chat.tsx`, RAG logic, temperature logic, product schema, or any other component.
- No re-embedding (image URL is not part of `embedding_text`).
