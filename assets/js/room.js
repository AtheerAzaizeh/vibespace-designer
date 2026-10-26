// Canvas renderer for the sample room (before/after) and the colour grade for uploaded photos.
const W = 960, H = 600;

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const t = amt < 0 ? 0 : 255, a = Math.abs(amt);
  r = Math.round(r + (t - r) * a); g = Math.round(g + (t - g) * a); b = Math.round(b + (t - b) * a);
  return `rgb(${r},${g},${b})`;
}
export function rgba(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
const poly = (ctx, pts, fill) => { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); };
const rect = (ctx, x, y, w, h, fill) => { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); };
const ell = (ctx, x, y, rx, ry, fill, rot = 0) => { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); };
function glow(ctx, x, y, r, color, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, a)); g.addColorStop(1, rgba(color, 0));
  ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore();
}

/**
 * @param {HTMLCanvasElement} cv
 * @param {{after:boolean, style:object, wall:string|null, has:(cat:string)=>boolean}} o
 */
export function drawRoom(cv, { after, style: S, wall: wallOverride, has: hasRaw }) {
  const ctx = cv.getContext('2d');
  const P = S.palette.map(p => p[0]);
  const has = c => after && hasRaw(c);
  const wall = after ? (wallOverride || P[0]) : '#C8CAC4';
  const floor = after ? S.floor : '#8D897F';
  const id = S.id;
  ctx.clearRect(0, 0, W, H);

  poly(ctx, [0,0, 960,0, 760,70, 200,70], after ? shade(wall, .35) : '#D9DAD6');
  rect(ctx, 200, 70, 560, 320, wall);
  poly(ctx, [0,0, 200,70, 200,390, 0,600], shade(wall, -.12));
  poly(ctx, [960,0, 760,70, 760,390, 960,600], shade(wall, -.07));
  poly(ctx, [0,600, 200,390, 760,390, 960,600], floor);
  ctx.strokeStyle = shade(floor, -.18); ctx.lineWidth = 1.5;
  for (let x = 200; x <= 760; x += 45) { ctx.beginPath(); ctx.moveTo(x, 390); ctx.lineTo(480 + (x - 480) * 2.3, 600); ctx.stroke(); }
  rect(ctx, 200, 384, 560, 6, shade(wall, -.25));

  // window
  rect(ctx, 228, 112, 144, 182, after ? '#FFFFFF' : '#E4E4E0');
  const sky = ctx.createLinearGradient(0, 120, 0, 286);
  sky.addColorStop(0, after ? '#AFD3EA' : '#C3CDD3'); sky.addColorStop(1, after ? '#E9F3F8' : '#DDE1E2');
  rect(ctx, 236, 120, 128, 166, sky);
  rect(ctx, 297, 120, 6, 166, after ? '#FFFFFF' : '#E4E4E0');
  rect(ctx, 236, 200, 128, 6, after ? '#FFFFFF' : '#E4E4E0');
  if (has('curtain')) {
    const c = P[4] === wall ? shade(P[4], -.15) : P[4];
    rect(ctx, 210, 104, 180, 6, shade(P[1], -.1));
    poly(ctx, [212,110, 246,110, 240,320, 206,320], c);
    poly(ctx, [354,110, 388,110, 394,320, 360,320], c);
    ctx.strokeStyle = shade(c, -.12); ctx.lineWidth = 2;
    [222, 232, 370, 380].forEach(x => { ctx.beginPath(); ctx.moveTo(x, 112); ctx.lineTo(x + (x < 300 ? -4 : 4), 318); ctx.stroke(); });
  }
  if (has('string')) {
    ctx.strokeStyle = 'rgba(40,30,20,.6)'; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let x = 210; x <= 750; x += 2) { const y = 92 + 14 * Math.abs(Math.sin((x - 210) / 90 * Math.PI)); x === 210 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke();
    for (let x = 222; x <= 740; x += 28) { const y = 94 + 14 * Math.abs(Math.sin((x - 210) / 90 * Math.PI)); ell(ctx, x, y + 3, 4, 5, S.glow); glow(ctx, x, y + 3, 18, S.glow, .55); }
  }
  if (has('art')) {
    rect(ctx, 392, 118, 76, 96, shade(P[1], -.2)); rect(ctx, 398, 124, 64, 84, P[4]);
    ell(ctx, 430, 154, 16, 16, P[2]); rect(ctx, 404, 178, 52, 22, P[3]);
    rect(ctx, 478, 138, 50, 62, shade(P[1], -.2)); rect(ctx, 483, 143, 40, 52, P[2]);
    poly(ctx, [488,190, 503,156, 518,190], P[4]);
  }
  if (has('shelf')) {
    if (id === 'creative') {
      rect(ctx, 548, 128, 172, 108, '#D9C3A0');
      ctx.fillStyle = '#B79E78'; for (let x = 558; x < 715; x += 14) for (let y = 138; y < 232; y += 14) ctx.fillRect(x, y, 3, 3);
      rect(ctx, 566, 150, 8, 44, P[1]); rect(ctx, 582, 146, 6, 50, P[3]); rect(ctx, 610, 160, 34, 26, P[2]); ell(ctx, 680, 170, 16, 16, P[1]);
    } else {
      rect(ctx, 550, 214, 170, 9, shade(P[1], -.05));
      const bc = [P[1], P[2], P[3], P[4], P[2], P[3]];
      let x = 560; [44, 38, 48, 34, 42, 46].forEach((h, i) => { rect(ctx, x, 214 - h, 13 + (i % 2) * 4, h, bc[i]); x += 18 + (i % 2) * 4; });
      ell(ctx, 690, 200, 14, 14, P[3]); rect(ctx, 682, 200, 16, 14, P[2]);
    }
  }
  if (has('rug')) {
    ell(ctx, 440, 508, 262, 58, shade(P[1], -.05));
    ell(ctx, 440, 508, 246, 50, P[4] === wall ? P[2] : P[4]);
    ctx.save(); ctx.beginPath(); ctx.ellipse(440, 508, 246, 50, 0, 0, Math.PI * 2); ctx.clip();
    ctx.strokeStyle = rgba(P[2], .55); ctx.lineWidth = 6;
    for (let x = 200; x < 700; x += 38) { ctx.beginPath(); ctx.moveTo(x, 450); ctx.lineTo(x + 30, 570); ctx.stroke(); }
    ctx.restore();
  }

  // desk + screen
  const desk = after ? S.desk : '#A3A39D';
  rect(ctx, 470, 316, 262, 12, desk); rect(ctx, 470, 328, 262, 8, shade(desk, -.18));
  rect(ctx, 478, 336, 8, 92, shade(desk, -.25)); rect(ctx, 716, 336, 8, 92, shade(desk, -.25));
  rect(ctx, 566, 252, 78, 56, '#1E2022'); rect(ctx, 570, 256, 70, 48, after ? '#33475B' : '#4B5258'); rect(ctx, 556, 308, 98, 7, '#3A3D40');
  if (!after) {
    rect(ctx, 664, 300, 40, 16, '#F2F2F0'); rect(ctx, 668, 294, 36, 8, '#E6E6E2'); rect(ctx, 494, 296, 18, 20, '#C9C0B0');
    ctx.strokeStyle = '#222'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(600, 336); ctx.bezierCurveTo(610, 380, 540, 390, 560, 430); ctx.stroke();
  }
  if (has('deskLamp')) {
    rect(ctx, 488, 308, 30, 8, '#2A2A2A');
    ctx.strokeStyle = '#2A2A2A'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(503, 308); ctx.lineTo(492, 262); ctx.lineTo(530, 244); ctx.stroke();
    poly(ctx, [520,240, 548,238, 556,262, 528,266], id === 'cafe' ? '#B07A3E' : P[1]);
  } else if (after) {
    rect(ctx, 494, 300, 16, 16, P[2]); rect(ctx, 497, 293, 10, 7, P[3]);
  }

  // chair
  const chairC = has('chair') ? (id === 'warm' ? '#EFE6D8' : id === 'cafe' ? '#5C3B28' : P[id === 'creative' ? 3 : 1]) : (after ? '#7A7D79' : '#6E716E');
  if (has('chair') && id === 'cafe') {
    rect(ctx, 584, 344, 6, 70, chairC); rect(ctx, 642, 344, 6, 70, chairC); rect(ctx, 584, 350, 64, 6, chairC); rect(ctx, 584, 370, 64, 5, chairC);
    rect(ctx, 572, 408, 88, 12, shade(chairC, .1)); rect(ctx, 578, 420, 6, 60, chairC); rect(ctx, 648, 420, 6, 60, chairC);
  } else {
    ctx.beginPath(); ctx.roundRect(580, 334, 72, 74, 16); ctx.fillStyle = chairC; ctx.fill();
    ctx.beginPath(); ctx.roundRect(566, 404, 100, 18, 9); ctx.fillStyle = shade(chairC, -.1); ctx.fill();
    rect(ctx, 612, 422, 8, 40, '#2D2D2D'); rect(ctx, 584, 462, 64, 6, '#2D2D2D');
    ell(ctx, 586, 472, 6, 5, '#2D2D2D'); ell(ctx, 646, 472, 6, 5, '#2D2D2D');
  }
  if (has('pouf')) {
    const pc = id === 'cafe' ? '#7B4E2F' : P[2];
    ell(ctx, 300, 520, 58, 18, shade(pc, -.25)); rect(ctx, 242, 478, 116, 42, pc); ell(ctx, 300, 478, 58, 18, shade(pc, .15));
  }
  if (has('plant')) {
    const pot = id === 'warm' ? '#B8643A' : id === 'modern' ? '#9A9A96' : id === 'cafe' ? '#E8DCCB' : P[1];
    const greens = ['#2F6B3E', '#3F8550', '#4F9A5C', '#2A5A35'];
    for (let i = 0; i < 9; i++) ell(ctx, 822 + Math.cos(i * 1.3) * 32, 430 - Math.abs(Math.sin(i * 1.7)) * 70, 26, 12, greens[i % 4], i * .7);
    poly(ctx, [792,460, 852,460, 844,530, 800,530], pot); rect(ctx, 788, 454, 68, 10, shade(pot, -.12));
  }
  if (has('floorLamp')) {
    ell(ctx, 120, 566, 34, 9, '#2A2A2A'); rect(ctx, 117, 300, 6, 266, '#2A2A2A');
    poly(ctx, [92,260, 148,260, 164,308, 76,308], id === 'warm' ? '#F1E4CE' : P[id === 'creative' ? 2 : 1]);
  }
  if (has('pendant')) {
    ctx.strokeStyle = '#222'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(606, 0); ctx.lineTo(606, 150); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(572, 186); ctx.quadraticCurveTo(606, 132, 640, 186); ctx.closePath();
    ctx.fillStyle = id === 'cafe' ? '#B07A3E' : '#F4F4F2'; ctx.fill();
  }
  if (!after) {
    ctx.strokeStyle = '#555'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(480, 0); ctx.lineTo(480, 46); ctx.stroke();
    ell(ctx, 480, 54, 9, 11, '#FFFFFF');
    rect(ctx, 46, 470, 100, 76, '#B08D5E'); rect(ctx, 46, 470, 100, 8, '#9A7A50');
    rect(ctx, 96, 426, 76, 48, '#BF9B69'); rect(ctx, 130, 426, 6, 48, '#D9C9A6');
    rect(ctx, 820, 500, 60, 30, '#5D6A7A'); rect(ctx, 836, 494, 40, 8, '#7B8796');
  }

  // light
  if (after) {
    ctx.save(); ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = rgba(S.glow, .25); ctx.fillRect(0, 0, W, H); ctx.restore();
    glow(ctx, 300, 200, 230, '#FFFFFF', .18);
    if (has('floorLamp')) glow(ctx, 120, 300, 230, S.glow, .55);
    if (has('pendant')) glow(ctx, 606, 200, 220, S.glow, .55);
    if (has('deskLamp')) glow(ctx, 540, 290, 140, S.glow, .5);
    if (has('string')) glow(ctx, 480, 110, 320, S.glow, .2);
  } else {
    glow(ctx, 480, 56, 260, '#E8F0FF', .35);
    ctx.fillStyle = 'rgba(70,78,92,.16)'; ctx.fillRect(0, 0, W, H);
  }
}

const GRADES = {
  warm: 'sepia(.25) saturate(1.15) brightness(1.06) contrast(1.02)',
  modern: 'saturate(.8) brightness(1.1) contrast(1.06)',
  cafe: 'sepia(.35) saturate(1.1) brightness(.92) contrast(1.1)',
  creative: 'saturate(1.35) brightness(1.04) contrast(1.05)',
};

/** Colour-grades an uploaded photo. This is a visual approximation, not a redesign. */
export function drawPhoto(cv, { after, style: S, wall, img }) {
  const ctx = cv.getContext('2d');
  const s = Math.max(W / img.width, H / img.height), w = img.width * s, h = img.height * s;
  ctx.clearRect(0, 0, W, H);
  ctx.filter = after ? (GRADES[S.id] || 'none') : 'none';
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
  ctx.filter = 'none';
  if (after) {
    ctx.save(); ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = rgba(wall || S.palette[0][0], .45); ctx.fillRect(0, 0, W, H); ctx.restore();
    glow(ctx, 150, 300, 300, S.glow, .35); glow(ctx, 760, 200, 260, S.glow, .25);
    S.palette.forEach((p, i) => rect(ctx, 20 + i * 34, 560, 30, 22, p[0]));
  }
}
