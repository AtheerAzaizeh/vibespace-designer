# Architecture and roadmap

## Current (v1, static)

```
Browser ──fetch──▶ data/catalog.json (same origin, GitHub Pages)
   │
   ├─ app.js: state {style, budget, selected, wall, photo} ⇄ URL query (?s=&b=&i=)
   ├─ room.js: Canvas renderer (sample room) / colour grade (uploaded photo)
   └─ sw.js: offline shell cache, catalog network-first

GitHub Actions
   ├─ deploy.yml   push to main → npm test → Pages deploy
   └─ prices.yml   Mondays → scripts/check-prices.mjs --write → PR if prices moved
```

Design decisions:

- **No backend.** Everything a visitor does stays in the browser; the photo never uploads. This removes hosting cost, privacy risk and the need for accounts in v1.
- **One source of truth.** `data/catalog.json` carries prices, URLs and the verification date. The page reads the date from the file, so the UI can never claim a fresher check than the data.
- **Direct product links.** Every `url` is the store's product page, never a search page. Tests enforce the host pattern.
- **Honest labelling.** Commission rates and plan prices are assumptions and the UI says so; product prices are real but dated.

## Roadmap, in order of value

1. **Affiliate links.** Fox Home and Home Center run on Shopify; both can issue tracked links through an affiliate app once a partnership is signed. IKEA Israel has no public affiliate programme; model it as a data partnership or leave it unmonetised. Replace `url` with a tracked URL per store in the catalog; keep `rel="sponsored"`.
2. **Hebrew and English UI.** Israeli users read Hebrew first. Move UI strings to `data/i18n/{ar,he,en}.json`, keep product names as store-native text plus a short localized description.
3. **Real room analysis.** A small serverless function (Cloudflare Worker or Vercel Edge) calls a vision-capable Claude model with the uploaded photo and returns: detected window side, wall colour, clutter level, suggested placements. The client keeps working without it (graceful fallback to the sample room). Cache by image hash; rate-limit by IP.
4. **Generated "after" image.** Once analysis exists, request an image edit (inpainting) with the chosen palette and items. Store nothing by default; offer "save my design" only with an account.
5. **Accounts and saved designs.** Supabase or Firebase Auth + a `designs` table (style, budget, skus, palette, wall). Share links then resolve by id instead of carrying the whole state.
6. **Live prices in the client.** Move price reads from the weekly Action to a scheduled Worker that writes `catalog.json` to KV/R2 every few hours; the static site fetches from there. Keep the weekly PR as an audit trail.
7. **More stores.** Castro Home, Golf & Co, ACE and local Arab-sector furniture shops. Add a `stores` entry, a reader in `check-prices.mjs`, and products with verified URLs.
8. **Analytics with consent.** Plausible or Umami, self-hosted, no cookies, only after a consent toggle. Track: style chosen, budget band, outbound click per sku.

## Quality gates

- `npm test` must pass before deploy (enforced in `deploy.yml`).
- Price refresh never writes if any product failed to read.
- Lighthouse targets: Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95, SEO ≥ 95 on mobile.
