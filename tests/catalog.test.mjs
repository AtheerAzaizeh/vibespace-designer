import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { autofitSelection, money } from '../assets/js/app.js';

const catalog = JSON.parse(await readFile(new URL('../data/catalog.json', import.meta.url), 'utf8'));
const all = catalog.styles.flatMap(s => s.products);

test('catalog has four styles with at least eight products each', () => {
  assert.equal(catalog.styles.length, 4);
  for (const s of catalog.styles) assert.ok(s.products.length >= 8, s.id);
});

test('every product has a positive ILS price and a direct store URL', () => {
  for (const p of all) {
    assert.ok(p.price > 0, p.sku);
    assert.match(p.url, /^https:\/\/www\.(ikea\.com\/il\/he\/p\/|foxhome\.co\.il\/products\/|homecenter\.co\.il\/products\/)/, p.sku);
    assert.ok(catalog.stores[p.store], `unknown store ${p.store} on ${p.sku}`);
    assert.ok(catalog.categories[p.cat], `unknown category ${p.cat} on ${p.sku}`);
    if (p.list_price) assert.ok(p.list_price > p.price, `${p.sku} list price must exceed sale price`);
  }
});

test('skus are unique', () => {
  const skus = all.map(p => p.sku);
  assert.equal(new Set(skus).size, skus.length);
});

test('price_checked_at is a date no later than today', () => {
  assert.match(catalog.price_checked_at, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(new Date(catalog.price_checked_at) <= new Date());
});

test('autofit never exceeds the budget and picks one item per category', () => {
  for (const s of catalog.styles) {
    for (const budget of [100, 300, 800, 1200, 3000]) {
      const picked = autofitSelection(s.products, budget);
      const items = s.products.filter(p => picked.has(p.sku));
      const total = items.reduce((a, p) => a + p.price, 0);
      assert.ok(total <= budget, `${s.id}@${budget}: ${total}`);
      const cats = items.map(p => p.cat);
      assert.equal(new Set(cats).size, cats.length, `${s.id}@${budget} duplicate category`);
    }
  }
});

test('a 1200 ₪ budget fills at least five categories in every style', () => {
  for (const s of catalog.styles) assert.ok(autofitSelection(s.products, 1200).size >= 5, s.id);
});

test('money formats shekels', () => {
  assert.equal(money(71.94), '71.94 ₪');
  assert.ok(money(1250).endsWith('₪'));
});
