import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateBody, parseAnalysis, pickRecommended, imagePrompt, analysisUserText, outputSize } from '../netlify/functions/lib/redesign-core.mjs';

const catalog = JSON.parse(await readFile(new URL('../data/catalog.json', import.meta.url), 'utf8'));
const cafe = catalog.styles.find(s => s.id === 'cafe');
const b64 = 'A'.repeat(400);

test('validateBody accepts a well-formed request', () => {
  assert.deepEqual(validateBody({ image: b64, mime: 'image/jpeg', styleId: 'cafe', budget: 1200 }), []);
});

test('validateBody rejects data URLs, bad mime, bad budget', () => {
  const e = validateBody({ image: 'data:image/png;base64,' + b64, mime: 'image/gif', styleId: 'cafe', budget: 50 });
  assert.ok(e.some(x => x.includes('base64')));
  assert.ok(e.some(x => x.includes('mime')));
  assert.ok(e.some(x => x.includes('budget')));
});

test('parseAnalysis tolerates code fences and caps arrays', () => {
  const a = parseAnalysis('```json\n{"room_type":"غرفة نوم","issues":["a","b","c","d"],"recommended_skus":["x"],"image_prompt":"p"}\n```');
  assert.equal(a.room_type, 'غرفة نوم');
  assert.equal(a.issues.length, 3);
  assert.deepEqual(a.recommended_skus, ['x']);
});

test('parseAnalysis throws on no JSON', () => {
  assert.throws(() => parseAnalysis('nothing here'));
});

test('pickRecommended keeps valid skus, one per category, within budget', () => {
  const skus = ['ikea-80407114', 'ikea-80577880', 'bogus', 'ikea-50610584', 'ikea-20631564'];
  const picked = pickRecommended(skus, cafe.products, 300);
  const cats = picked.map(p => p.cat);
  assert.equal(new Set(cats).size, cats.length);
  assert.ok(picked.reduce((s, p) => s + p.price, 0) <= 300);
  assert.ok(!picked.some(p => p.sku === 'bogus'));
  assert.ok(!picked.some(p => p.sku === 'ikea-80577880'), 'second pendant skipped');
});

test('prompts mention the palette and the catalog', () => {
  const p = imagePrompt({ style: cafe, analysis: { image_prompt: '' }, items: cafe.products.slice(0, 2) });
  assert.match(p, /#5A4033/);
  assert.match(p, /SKURUP/);
  const u = analysisUserText({ style: cafe, budget: 900, catalogLines: ['x | y | 1 | rug'] });
  assert.match(u, /900/);
});

test('validateBody accepts optional imageSmall and aspect, rejects bad ones', () => {
  assert.deepEqual(validateBody({ image: b64, imageSmall: b64, aspect: 1.33, mime: 'image/jpeg', styleId: 'cafe', budget: 1200 }), []);
  const e = validateBody({ image: b64, imageSmall: 'data:x,' + b64, aspect: 9, mime: 'image/jpeg', styleId: 'cafe', budget: 1200 });
  assert.ok(e.some(x => x.includes('imageSmall')));
  assert.ok(e.some(x => x.includes('aspect')));
});

test('outputSize keeps aspect, multiples of 16, sane defaults', () => {
  assert.deepEqual(outputSize(4 / 3), { width: 1024, height: 768 });
  assert.deepEqual(outputSize(undefined), { width: 1024, height: 768 });
  const p = outputSize(0.75);
  assert.equal(p.height, 1024); assert.equal(p.width % 16, 0); assert.ok(p.width >= 256);
  assert.equal(outputSize(99).width, 1024);
});
