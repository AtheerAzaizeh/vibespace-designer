// POST /api/redesign
// Body: { image: <base64 ≤1024px>, imageSmall?: <base64 ≤512px>, mime, styleId, budget, aspect? }
// Returns: { analysis, items: [sku...], image: <base64> | null, imageMime, imageError?, models }
//
// Runs entirely on open-weight models hosted by Cloudflare Workers AI (free tier: 10,000 neurons/day):
//   1. Vision analysis  – Llama 4 Scout (Meta, open weights) reads the photo and returns strict JSON advice.
//   2. Image editing    – FLUX.2 [klein] 4B (Black Forest Labs, Apache-2.0) redraws the same room in the chosen style.
// No proprietary model is used. Env: CF_ACCOUNT_ID, CF_API_TOKEN (Workers AI Read+Edit), optional CF_VISION_MODEL, CF_IMAGE_MODEL.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validateBody, analysisSystemPrompt, analysisUserText, parseAnalysis, imagePrompt, pickRecommended, outputSize } from './lib/redesign-core.mjs';

const VISION_MODEL = process.env.CF_VISION_MODEL || '@cf/meta/llama-4-scout-17b-16e-instruct';
const IMAGE_MODEL = process.env.CF_IMAGE_MODEL || '@cf/black-forest-labs/flux-2-klein-4b';
const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const cfBase = () => `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}`;
const auth = () => ({ authorization: `Bearer ${process.env.CF_API_TOKEN}` });

let catalogPromise;
async function loadCatalog() {
  if (!catalogPromise) {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [path.resolve(here, '../../data/catalog.json'), path.resolve(process.cwd(), 'data/catalog.json')];
    catalogPromise = (async () => {
      for (const f of candidates) { try { return JSON.parse(await readFile(f, 'utf8')); } catch { /* try next */ } }
      throw new Error('catalog.json not found');
    })();
  }
  return catalogPromise;
}

function withTimeout(ms) { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); return { signal: c.signal, done: () => clearTimeout(t) }; }

class ApiError extends Error { constructor(code, status, detail) { super(code); this.code = code; this.status = status; this.detail = detail; } }

/** Step 1: open-weight vision LLM via Workers AI's OpenAI-compatible endpoint. */
async function analyse({ image, mime, style, budget }) {
  const catalogLines = style.products.map(p => `${p.sku} | ${p.name} | ${p.price} | ${p.cat}`);
  const body = {
    model: VISION_MODEL,
    max_tokens: 1500,
    temperature: 0.3,
    messages: [
      { role: 'system', content: analysisSystemPrompt() },
      { role: 'user', content: [
        { type: 'text', text: analysisUserText({ style, budget, catalogLines }) },
        { type: 'image_url', image_url: { url: `data:${mime};base64,${image}` } },
      ] },
    ],
  };
  const call = async (b) => {
    const t = withTimeout(40_000);
    try {
      const r = await fetch(`${cfBase()}/ai/v1/chat/completions`, { method: 'POST', headers: { ...auth(), 'content-type': 'application/json' }, body: JSON.stringify(b), signal: t.signal });
      const text = await r.text();
      if (!r.ok) throw new ApiError(r.status === 401 || r.status === 403 ? 'bad_key' : r.status === 429 ? 'rate_limited' : 'analysis_failed', r.status, text.slice(0, 400));
      const data = JSON.parse(text);
      return data.choices?.[0]?.message?.content ?? data.result?.response ?? '';
    } finally { t.done(); }
  };
  let text;
  try { text = await call({ ...body, response_format: { type: 'json_object' } }); }
  catch (err) { if (err.code === 'analysis_failed' && err.status === 400) text = await call(body); else throw err; }
  return parseAnalysis(text);
}

/** Step 2: FLUX.2 [klein] 4B image edit (multipart: prompt + input_image_0 < 512px). */
async function generateImage({ image, mime, prompt, aspect }) {
  const { width, height } = outputSize(aspect);
  const fd = new FormData();
  fd.append('prompt', prompt);
  fd.append('width', String(width));
  fd.append('height', String(height));
  fd.append('guidance', '2.5');
  fd.append('input_image_0', new Blob([Buffer.from(image, 'base64')], { type: mime }), 'room.jpg');
  const t = withTimeout(50_000);
  try {
    const r = await fetch(`${cfBase()}/ai/run/${IMAGE_MODEL}`, { method: 'POST', headers: auth(), body: fd, signal: t.signal });
    const ct = r.headers.get('content-type') || '';
    if (!r.ok) {
      const txt = await r.text();
      const code = /3030/.test(txt) ? 'image_rejected' : r.status === 429 ? 'image_rate_limited' : `image_api_${r.status}`;
      console.error('image failed', r.status, txt.slice(0, 300));
      return { image: null, error: code };
    }
    if (ct.includes('application/json')) {
      const data = await r.json();
      const b64 = data.result?.image || data.image;
      return b64 ? { image: b64, mime: 'image/png' } : { image: null, error: 'no_image_in_response' };
    }
    const buf = Buffer.from(await r.arrayBuffer());
    return { image: buf.toString('base64'), mime: ct.startsWith('image/') ? ct.split(';')[0] : 'image/png' };
  } catch (err) {
    return { image: null, error: err.name === 'AbortError' ? 'image_timeout' : 'image_failed' };
  } finally { t.done(); }
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method' });
  if (!process.env.CF_ACCOUNT_ID || !process.env.CF_API_TOKEN) return json(503, { error: 'not_configured', message: 'CF_ACCOUNT_ID و CF_API_TOKEN غير مضبوطين في إعدادات Netlify' });
  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'bad_json' }); }
  const errors = validateBody(body);
  if (errors.length) return json(400, { error: 'invalid', details: errors });

  const catalog = await loadCatalog();
  const style = catalog.styles.find(s => s.id === body.styleId);
  if (!style) return json(400, { error: 'unknown_style' });
  const budget = Math.round(Number(body.budget));

  let analysis;
  try {
    analysis = await analyse({ image: body.image, mime: body.mime, style, budget });
  } catch (err) {
    console.error('analysis failed', err.code || err.message, err.detail || '');
    if (err.code === 'rate_limited') return json(429, { error: 'rate_limited', message: 'الخدمة مشغولة أو استُنفدت حصة اليوم المجانية، حاول لاحقاً.' });
    if (err.code === 'bad_key') return json(503, { error: 'bad_key', message: 'مفتاح Cloudflare أو رقم الحساب غير صالح.' });
    return json(502, { error: 'analysis_failed', message: 'فشل تحليل الصورة. حاول مرة أخرى.' });
  }

  const items = pickRecommended(analysis.recommended_skus, style.products, budget);
  const img = await generateImage({ image: body.imageSmall || body.image, mime: body.mime, prompt: imagePrompt({ style, analysis, items }), aspect: body.aspect });
  return json(200, { analysis, items: items.map(p => p.sku), image: img.image, imageMime: img.mime || null, imageError: img.error || null, models: { vision: VISION_MODEL, image: IMAGE_MODEL } });
};

export const config = { path: '/api/redesign' };
