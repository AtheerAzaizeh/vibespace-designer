// Pure helpers for the redesign function (model-agnostic): prompt building and response parsing.
// Kept free of network calls so they can be unit-tested.

export const MAX_IMAGE_BYTES = 6 * 1024 * 1024; // base64 payload ceiling (~4.5 MB image)
export const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function validateBody(body) {
  const errors = [];
  if (!body || typeof body !== 'object') return ['body must be a JSON object'];
  if (!ALLOWED_MIME.has(body.mime)) errors.push('mime must be image/jpeg, image/png or image/webp');
  const checkB64 = (v, name, required) => {
    if (v == null) { if (required) errors.push(`${name} must be a base64 string`); return; }
    if (typeof v !== 'string' || v.length < 100) errors.push(`${name} must be a base64 string`);
    else if (v.length > MAX_IMAGE_BYTES) errors.push(`${name} too large`);
    else if (!/^[A-Za-z0-9+/=]+$/.test(v.slice(0, 2000))) errors.push(`${name} must be plain base64 without a data: prefix`);
  };
  checkB64(body.image, 'image', true);
  checkB64(body.imageSmall, 'imageSmall', false);
  if (body.aspect != null && !(Number(body.aspect) >= 0.4 && Number(body.aspect) <= 2.5)) errors.push('aspect must be 0.4..2.5');
  if (typeof body.styleId !== 'string' || !/^[a-z]{3,12}$/.test(body.styleId)) errors.push('styleId invalid');
  const b = Number(body.budget);
  if (!Number.isFinite(b) || b < 100 || b > 3000) errors.push('budget must be 100..3000');
  return errors;
}

/** System prompt for the vision analysis. Output is a strict JSON object. */
export function analysisSystemPrompt() {
  return `أنت مهندس ديكور داخلي يعمل في منصة VibeSpace Designer. تحلّل صورة غرفة أو مكتب حقيقية وتقترح تعديلات عملية بميزانية محدودة بالشيكل.
أجب بكائن JSON واحد فقط دون أي نص قبله أو بعده، بهذه الحقول بالضبط:
{
  "room_type": "غرفة نوم | مكتب منزلي | صالة | غرفة طالب | أخرى",
  "size_estimate": "تقدير الأبعاد بالمتر مثل 3 × 3.5 م",
  "window_side": "يمين | يسار | أمام | لا يظهر",
  "wall_color": "وصف قصير للون الجدران الحالي",
  "clutter_level": "منخفض | متوسط | مرتفع",
  "issues": ["ثلاث مشاكل ملموسة تراها في الصورة بجمل قصيرة"],
  "light": ["ثلاثة اقتراحات إضاءة محددة لهذه الغرفة"],
  "layout": ["ثلاثة اقتراحات لتوزيع الأثاث أو التخزين لهذه الغرفة"],
  "recommended_skus": ["حتى 6 معرّفات sku من الكتالوج المرفق الأنسب لهذه الغرفة ضمن الميزانية، مرتبة حسب الأولوية"],
  "image_prompt": "وصف بالإنجليزية في 60 إلى 90 كلمة لصورة الغرفة نفسها بعد التعديل: نفس الزاوية والجدران والنوافذ والأثاث الثقيل، مع القطع المقترحة ولوحة ألوان الطابع، مرتبة ونظيفة"
}
اكتب كل النصوص بالعربية ما عدا image_prompt. لا تقترح هدم أو تغيير معماري. لا تذكر أشخاصاً في الصورة.`;
}

export function analysisUserText({ style, budget, catalogLines }) {
  return `الطابع المطلوب: ${style.name} (${style.paletteName}). لوحة الألوان: ${style.palette.map(p => `${p[1]} ${p[0]}`).join('، ')}.
الميزانية: ${budget} ₪.
الكتالوج المتاح لهذا الطابع (sku | الاسم | السعر بالشيكل | الفئة):
${catalogLines.join('\n')}
حلّل الصورة المرفقة وأعد JSON فقط.`;
}

/** Extracts the first JSON object from model text; tolerant of code fences. */
export function parseAnalysis(text) {
  const cleaned = String(text).replace(/```(?:json)?/g, '').trim();
  const start = cleaned.indexOf('{'), end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON in analysis');
  const obj = JSON.parse(cleaned.slice(start, end + 1));
  const arr = (v, n) => Array.isArray(v) ? v.filter(x => typeof x === 'string').slice(0, n) : [];
  return {
    room_type: String(obj.room_type || ''),
    size_estimate: String(obj.size_estimate || ''),
    window_side: String(obj.window_side || ''),
    wall_color: String(obj.wall_color || ''),
    clutter_level: String(obj.clutter_level || ''),
    issues: arr(obj.issues, 3),
    light: arr(obj.light, 3),
    layout: arr(obj.layout, 3),
    recommended_skus: arr(obj.recommended_skus, 6),
    image_prompt: String(obj.image_prompt || ''),
  };
}

/** Builds the image-edit prompt: keeps the room's geometry, applies palette and items. */
export function imagePrompt({ style, analysis, items }) {
  const palette = style.palette.map(p => `${p[1]} (${p[0]})`).join(', ');
  const list = items.map(i => i.name).join('; ');
  return `Photo-realistic interior redesign of THIS exact room. Keep the same camera angle, walls, floor, window positions, door and the large furniture in place. Remove clutter, make the bed and desk tidy. Apply a "${style.name}" style using this colour palette: ${palette}. Add these items naturally where they fit: ${list || 'a rug, a floor lamp, a plant and wall art'}. ${analysis.image_prompt || ''} Daylight plus warm lamp light, realistic shadows, no people, no text, no watermark.`;
}

/** Output size for the image model: 1024 on the long side, multiples of 16, within 256..1920, matching the photo's aspect. */
export function outputSize(aspect) {
  const a = Number(aspect) > 0 ? Math.min(2.5, Math.max(0.4, Number(aspect))) : 4 / 3;
  const snap = v => Math.min(1920, Math.max(256, Math.round(v / 16) * 16));
  return a >= 1 ? { width: 1024, height: snap(1024 / a) } : { width: snap(1024 * a), height: 1024 };
}

/** Keeps recommended SKUs that exist, one per category, within budget. */
export function pickRecommended(skus, products, budget) {
  const bySku = new Map(products.map(p => [p.sku, p]));
  const picked = [], cats = new Set();
  let left = budget;
  for (const sku of skus) {
    const p = bySku.get(sku);
    if (!p || cats.has(p.cat) || p.price > left) continue;
    picked.push(p); cats.add(p.cat); left -= p.price;
  }
  return picked;
}
