import { drawRoom, drawPhoto } from './room.js';

const $ = id => document.getElementById(id);
const CAT_ROLE = { rug: 3, curtain: 3, pouf: 2, chair: 2, art: 2, shelf: 1, plant: 4, floorLamp: 2, pendant: 2, deskLamp: 2, string: 2 };
const SITE = typeof location !== 'undefined' ? location.origin + location.pathname.replace(/[^/]*$/, '') : '';

let CATALOG;
const state = { style: 'warm', budget: 1200, selected: new Set(), wall: null, photo: null, photoFile: null, ai: null, aiImg: null };

/* ---------- helpers ---------- */
export function money(ils) {
  const v = Math.round(ils * 100) / 100;
  return `${v.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₪`;
}
const styleOf = id => CATALOG.styles.find(s => s.id === id);
const currentStyle = () => styleOf(state.style);
const products = () => currentStyle().products;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Greedy fit: one item per category in catalogue order, until the budget is spent. */
export function autofitSelection(list, budget) {
  const picked = new Set(), seen = new Set();
  let left = budget;
  for (const p of list) {
    if (seen.has(p.cat) || p.price > left) continue;
    picked.add(p.sku); seen.add(p.cat); left -= p.price;
  }
  return picked;
}
function autofit() { state.selected = autofitSelection(products(), state.budget); }
const selectedItems = () => products().filter(p => state.selected.has(p.sku));

/* ---------- URL state (shareable) ---------- */
function readUrl() {
  const q = new URLSearchParams(location.search);
  if (q.get('s') && styleOf(q.get('s'))) state.style = q.get('s');
  const b = Number(q.get('b'));
  if (b >= 100 && b <= 3000) state.budget = Math.round(b / 50) * 50;
  const i = q.get('i');
  if (i) { const valid = new Set(products().map(p => p.sku)); state.selected = new Set(i.split(',').filter(x => valid.has(x))); return true; }
  return false;
}
function shareUrl() {
  const q = new URLSearchParams({ s: state.style, b: String(state.budget), i: [...state.selected].join(',') });
  return `${SITE}?${q}`;
}
function syncUrl() { history.replaceState(null, '', `${location.pathname}?${new URLSearchParams({ s: state.style, b: String(state.budget), i: [...state.selected].join(',') })}`); }

/* ---------- rendering ---------- */
function render() {
  const S = currentStyle();
  const has = cat => selectedItems().some(p => p.cat === cat);
  const opts = { style: S, wall: state.wall, has, img: state.photo, aiImg: state.aiImg };
  const draw = state.photo ? drawPhoto : drawRoom;
  draw($('cvBefore'), { ...opts, after: false }); draw($('cvAfter'), { ...opts, after: true });
  $('compare').classList.toggle('ai', !!(state.photo && state.aiImg));
}
function renderChips() {
  $('styleChips').innerHTML = CATALOG.styles.map(s =>
    `<button class="chip" type="button" data-style="${s.id}" aria-pressed="${s.id === state.style}"><span class="dots">${s.palette.slice(0, 3).map(p => `<i style="background:${p[0]}"></i>`).join('')}</span>${esc(s.name)}</button>`).join('');
}
function renderPalette() {
  const S = currentStyle(), current = state.wall || S.palette[0][0];
  $('paletteName').textContent = S.paletteName;
  $('swatches').innerHTML = S.palette.map(([hex, name]) =>
    `<button class="sw" type="button" data-hex="${hex}" aria-pressed="${hex === current}"><span class="chipc" style="background:${hex}"></span><small>${esc(name)}</small><code>${hex}</code></button>`).join('');
  document.documentElement.style.setProperty('--style-accent', S.palette[2][0]);
}
function renderTips() {
  const S = currentStyle(), A = state.ai;
  const light = A?.light?.length ? A.light : S.light, layout = A?.layout?.length ? A.layout : S.layout;
  $('tipsLight').innerHTML = light.map(t => `<li>${esc(t)}</li>`).join('');
  $('tipsLayout').innerHTML = layout.map(t => `<li>${esc(t)}</li>`).join('');
  let rows, lbl;
  if (A) {
    rows = [`${A.room_type || 'غرفة'}${A.size_estimate ? ' · ' + A.size_estimate : ''}`, `النافذة: ${A.window_side || 'غير واضحة'} · الجدران: ${A.wall_color || ''}`, `الفوضى: ${A.clutter_level || ''}`];
    lbl = ['تحليل المساحة', 'الضوء والجدران', 'الترتيب'];
  } else if (state.photo) {
    rows = ['تم استلام صورتك محلياً', 'اضغط «صمّم غرفتي بالذكاء الاصطناعي» للتحليل', 'بدون ذلك، «بعد» تلوين تقريبي فقط'];
    lbl = ['تحليل المساحة', 'الخطوة التالية', 'ملاحظة'];
  } else {
    rows = ['غرفة نموذجية 3.2 × 3.8 م', ...S.analysis.slice(0, 2)];
    lbl = ['تحليل المساحة', 'الإضاءة', 'ملاحظة'];
  }
  $('analysis').innerHTML = rows.map((t, i) => `<div class="stat"><span>${lbl[i]}</span><b>${esc(t)}</b></div>`).join('');
  const issues = $('aiIssues');
  issues.hidden = !(A?.issues?.length);
  issues.innerHTML = (A?.issues || []).map(t => `<li>${esc(t)}</li>`).join('');
}

/* ---------- AI redesign ---------- */
function jpegBase64(img, max) {
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.86).split(',')[1];
}
async function runAI() {
  if (!state.photoFile) return;
  const btn = $('aiBtn'), st = $('aiStatus');
  btn.classList.add('busy'); btn.disabled = true;
  st.textContent = 'نحلّل الصورة ونرسم الغرفة بعد التعديل، قد يستغرق هذا حتى دقيقة…';
  try {
    const img0 = state.photo;
    const payload = { image: jpegBase64(img0, 1024), imageSmall: jpegBase64(img0, 500), aspect: +(img0.width / img0.height).toFixed(3), mime: 'image/jpeg', styleId: state.style, budget: state.budget };
    const res = await fetch('api/redesign', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || (res.status === 503 ? 'الخدمة غير مفعّلة بعد (مفاتيح Cloudflare ناقصة).' : 'فشل الطلب.'));
    state.ai = data.analysis;
    if (Array.isArray(data.items) && data.items.length) {
      const valid = new Set(products().map(p => p.sku));
      state.selected = new Set(data.items.filter(s => valid.has(s)));
    }
    if (data.image) {
      const im = new Image();
      await new Promise((ok, bad) => { im.onload = ok; im.onerror = bad; im.src = `data:${data.imageMime || 'image/png'};base64,${data.image}`; });
      state.aiImg = im;
      st.textContent = 'جاهز. اسحب المقبض لتقارن، وراجع القائمة والاقتراحات.';
    } else {
      state.aiImg = null;
      st.textContent = data.imageError === 'image_rejected' ? 'تم التحليل، لكن نموذج الصور رفض هذه الصورة. جرّب صورة أوضح دون أشخاص.' : data.imageError === 'image_rate_limited' ? 'تم التحليل، لكن حصة توليد الصور المجانية انتهت لليوم.' : 'تم التحليل، لكن تعذّر توليد الصورة هذه المرة.';
    }
    renderTips(); renderList(); render();
    toast('اكتمل التصميم بالذكاء الاصطناعي');
  } catch (err) {
    st.textContent = err.message || 'حدث خطأ.';
  } finally { btn.classList.remove('busy'); btn.disabled = false; }
}
function itemHTML(p, on) {
  const S = currentStyle(), st = CATALOG.stores[p.store], color = S.palette[CAT_ROLE[p.cat] ?? 2][0];
  return `<li class="pitem ${on ? '' : 'off'}" data-sku="${esc(p.sku)}" data-color="${color}">
    <input type="checkbox" id="chk-${esc(p.sku)}" ${on ? 'checked' : ''} aria-label="${on ? 'أزل' : 'أضف'} ${esc(p.name)}">
    <label class="pinfo" for="chk-${esc(p.sku)}">
      <span class="pname"><span class="dot" style="background:${color}"></span>${esc(p.name)}</span>
      <span class="pmeta"><span class="store">${esc(st.name)}</span><span>${esc(CATALOG.categories[p.cat] || p.cat)}</span>${p.note ? `<span>${esc(p.note)}</span>` : ''}</span>
    </label>
    <span class="pright"><span class="price num">${money(p.price)}</span>${p.list_price ? `<span class="was num">${money(p.list_price)}</span>` : ''}<a class="shop" href="${esc(p.url)}" target="_blank" rel="noopener sponsored">صفحة المنتج ←</a></span>
  </li>`;
}
function renderList() {
  const all = products(), inn = selectedItems(), out = all.filter(p => !state.selected.has(p.sku));
  $('inList').innerHTML = inn.map(p => itemHTML(p, true)).join('') || '<li class="muted small">لا شيء في السلة بعد. اختر قطعاً من الأسفل أو اضغط ملاءمة تلقائية.</li>';
  $('outList').innerHTML = out.map(p => itemHTML(p, false)).join('');
  $('outLabel').hidden = out.length === 0;
  const total = inn.reduce((s, p) => s + p.price, 0), over = total > state.budget;
  $('total').textContent = money(total); $('budgetOf').textContent = money(state.budget);
  $('meterFill').style.width = Math.min(100, total / state.budget * 100) + '%';
  $('meter').classList.toggle('over', over);
  $('status').className = 'status ' + (over ? 'over' : 'ok');
  $('status').textContent = over ? `تجاوزت بـ ${money(total - state.budget)}` : `متبقٍّ ${money(state.budget - total)}`;
  const com = inn.reduce((s, p) => s + p.price * CATALOG.stores[p.store].commission_rate, 0);
  $('commission').textContent = money(com);
  $('commissionNote').textContent = 'نسب افتراضية للعرض (IKEA ‏3٪، Fox Home وHome Center ‏5٪). النسب الفعلية تُحدَّد باتفاقيات شراكة مع كل متجر.';
  $('proPrice').textContent = '· ' + money(19) + '/شهر';
  $('designerPrice').textContent = '· ' + money(99);
  $('waShare').href = 'https://wa.me/?text=' + encodeURIComponent(listText() + '\n' + shareUrl());
  syncUrl();
}
function listText() {
  const S = currentStyle(), inn = selectedItems();
  const lines = inn.map(p => `• ${p.name} — ${money(p.price)} (${CATALOG.stores[p.store].name})\n  ${p.url}`);
  return `قائمة تسوق VibeSpace · طابع ${S.name} · ميزانية ${money(state.budget)}\n${lines.join('\n')}\nالمجموع: ${money(inn.reduce((s, p) => s + p.price, 0))}`;
}
function renderBudget() { $('budgetVal').textContent = money(state.budget); $('budget').value = state.budget; }
function renderAll() { renderChips(); renderPalette(); renderTips(); renderBudget(); renderList(); render(); }

function setSplit(v) { $('beforeLayer').style.clipPath = `inset(0 0 0 ${v}%)`; $('handle').style.left = v + '%'; }
let toastT;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200); }
async function copy(text, okMsg) {
  try { await navigator.clipboard.writeText(text); toast(okMsg); }
  catch { toast('تعذّر النسخ تلقائياً. حدّد النص وانسخه يدوياً.'); }
}

/* ---------- events ---------- */
function bind() {
  $('styleChips').addEventListener('click', e => {
    const b = e.target.closest('[data-style]'); if (!b) return;
    state.style = b.dataset.style; state.wall = null; state.ai = null; state.aiImg = null; autofit(); renderAll();
    if (state.photoFile) $('aiStatus').textContent = 'تغيّر الطابع. اضغط الزر مجدداً لإعادة التصميم.';
  });
  $('budget').addEventListener('input', e => { state.budget = +e.target.value; autofit(); renderBudget(); renderList(); render(); });
  $('autofit').addEventListener('click', () => { autofit(); renderList(); render(); toast('تم اختيار أفضل القطع ضمن ميزانيتك'); });
  document.querySelector('.studio aside').addEventListener('change', e => {
    const li = e.target.closest('.pitem'); if (!li) return;
    e.target.checked ? state.selected.add(li.dataset.sku) : state.selected.delete(li.dataset.sku);
    renderList(); render();
  });
  $('swatches').addEventListener('click', e => {
    const b = e.target.closest('.sw'); if (!b) return;
    state.wall = b.dataset.hex; renderPalette(); render();
    document.querySelectorAll('.pitem').forEach(li => li.classList.toggle('flash', li.dataset.color === b.dataset.hex));
    setTimeout(() => document.querySelectorAll('.pitem.flash').forEach(li => li.classList.remove('flash')), 1600);
    toast(`جرّبنا ${b.querySelector('small').textContent} على الجدار`);
  });
  $('copyPalette').addEventListener('click', () => copy(currentStyle().palette.map(p => `${p[1]} ${p[0]}`).join('\n'), 'تم نسخ أكواد الألوان'));
  $('copyList').addEventListener('click', () => copy(listText(), 'تم نسخ قائمة التسوق'));
  $('shareLink').addEventListener('click', async () => {
    const url = shareUrl();
    if (navigator.share) { try { await navigator.share({ title: 'تصميمي على VibeSpace', url }); return; } catch { /* user cancelled */ } }
    copy(url, 'تم نسخ رابط التصميم');
  });
  $('photo').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    if (f.size > 15 * 1024 * 1024) { toast('الصورة أكبر من 15 ميغابايت'); return; }
    const img = new Image();
    img.onload = () => {
      state.photo = img; state.photoFile = f; state.ai = null; state.aiImg = null;
      $('photoNote').textContent = 'صورتك معروضة. اضغط الزر لتحليلها وإعادة تصميمها؛ عندها فقط تُرسل الصورة للمعالجة.';
      $('aiRow').hidden = false; $('aiStatus').textContent = '';
      renderTips(); render(); URL.revokeObjectURL(img.src);
    };
    img.onerror = () => toast('تعذّر قراءة الصورة');
    img.src = URL.createObjectURL(f);
  });
  $('aiBtn').addEventListener('click', runAI);
  $('sampleBtn').addEventListener('click', () => { state.photo = null; state.photoFile = null; state.ai = null; state.aiImg = null; $('photo').value = ''; $('aiRow').hidden = true; $('photoNote').textContent = 'تعرض الآن غرفة نموذجية مرسومة. صورتك لا تغادر جهازك إلا إذا ضغطت زر الذكاء الاصطناعي.'; renderTips(); render(); });
  $('split').addEventListener('input', e => setSplit(e.target.value));
}

/* ---------- boot ---------- */
async function boot() {
  const res = await fetch('data/catalog.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('catalog');
  CATALOG = await res.json();
  const d = new Date(CATALOG.price_checked_at + 'T00:00:00');
  const dateAr = d.toLocaleDateString('ar', { day: 'numeric', month: 'long', year: 'numeric' });
  $('priceNote').textContent = `بالشيكل الجديد. الأسعار كما ظهرت على مواقع المتاجر بتاريخ ${dateAr}.`;
  $('checkedAt').textContent = `آخر تحقق: ${dateAr}`;
  $('pill').textContent += ` · الأسعار بتاريخ ${CATALOG.price_checked_at.split('-').reverse().join('.')}`;
  $('year').textContent = new Date().getFullYear();
  if (!readUrl()) autofit();
  bind(); renderAll(); setSplit(50);
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
if (typeof document !== 'undefined' && document.getElementById('styleChips')) {
  boot().catch(err => { console.error(err); const t = $('toast'); t.textContent = 'تعذّر تحميل الكتالوج. أعد تحميل الصفحة.'; t.classList.add('show'); });
}
