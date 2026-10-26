#!/usr/bin/env node
// Re-reads every product page in data/catalog.json and reports price changes.
// Usage: node scripts/check-prices.mjs [--write]   (--write updates catalog.json and price_checked_at)
// Fox Home and Home Center run on Shopify, so /products/<handle>.json is authoritative.
// IKEA pages embed the price in JSON-LD and in a data attribute; both are tried.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'data', 'catalog.json');
const WRITE = process.argv.includes('--write');
const UA = 'Mozilla/5.0 (compatible; VibeSpacePriceCheck/1.0; +https://github.com/AtheerAzaizeh/vibespace-designer)';

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'he-IL,he;q=0.9' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function shopifyPrice(url) {
  const data = JSON.parse(await fetchText(url.replace(/\/?$/, '') + '.json'));
  const v = data.product?.variants?.[0];
  if (!v) throw new Error('no variant');
  return { price: Number(v.price), list_price: v.compare_at_price ? Number(v.compare_at_price) : undefined, available: v.available };
}

async function ikeaPrice(url) {
  const html = await fetchText(url);
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map(m => { try { return JSON.parse(m[1]); } catch { return null; } })
    .flatMap(x => Array.isArray(x) ? x : [x]).filter(Boolean);
  for (const node of ld) {
    const offer = node?.offers && (Array.isArray(node.offers) ? node.offers[0] : node.offers);
    if (offer?.price) return { price: Number(offer.price), available: !/OutOfStock/.test(offer.availability || '') };
  }
  const m = html.match(/data-price="(\d+(?:\.\d+)?)"/) || html.match(/"price":\s*"?(\d+(?:\.\d+)?)"?/);
  if (m) return { price: Number(m[1]) };
  throw new Error('price not found');
}

const READERS = { fox: shopifyPrice, hc: shopifyPrice, ikea: ikeaPrice };

const catalog = JSON.parse(await readFile(FILE, 'utf8'));
const rows = [];
let changed = 0, failed = 0;
for (const style of catalog.styles) {
  for (const p of style.products) {
    try {
      const live = await READERS[p.store](p.url);
      const diff = Math.abs(live.price - p.price) > 0.005;
      rows.push({ sku: p.sku, store: p.store, old: p.price, new: live.price, available: live.available ?? '?', status: diff ? 'CHANGED' : 'ok' });
      if (diff) { changed++; if (WRITE) { p.price = live.price; if (live.list_price) p.list_price = live.list_price; } }
      else if (WRITE && live.list_price && live.list_price !== p.list_price) p.list_price = live.list_price;
    } catch (err) {
      failed++;
      rows.push({ sku: p.sku, store: p.store, old: p.price, new: null, available: '?', status: `FAILED: ${err.message}` });
    }
    await new Promise(r => setTimeout(r, 400)); // be polite to the stores
  }
}
console.table(rows);
console.log(`checked ${rows.length} products: ${changed} changed, ${failed} failed`);

if (WRITE && failed === 0) {
  catalog.price_checked_at = new Date().toISOString().slice(0, 10);
  await writeFile(FILE, JSON.stringify(catalog, null, 2) + '\n');
  console.log(`catalog.json updated, price_checked_at=${catalog.price_checked_at}`);
} else if (WRITE) {
  console.log('catalog.json NOT updated because some products could not be read');
  process.exitCode = 1;
}
