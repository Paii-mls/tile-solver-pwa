// Tile Solver MVP (client-only)
// Concept: user taps only 'open' tiles; app clusters by visual similarity (dHash) and recommends the next move based on tray counts.

const $ = (id) => document.getElementById(id);
const canvas = $('canvas');
const ctx = canvas.getContext('2d');

let img = null;
let imgW = 0, imgH = 0;

// view transform for pan/zoom
let view = { scale: 1, offsetX: 0, offsetY: 0 };
let pointers = new Map();
let lastPinchDist = null;

// tiles user marked (only open tiles)
// tile = {id, cx, cy, w, h, hash, typeId, color}
let tiles = [];
let nextId = 1;

// tray is counts by typeId, also expanded slots for UI (max 7)
let trayCounts = new Map();
let traySlots = []; // array of typeId

let suggestionId = null;

// ---------- Utilities ----------
function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

function resizeCanvasToImage() {
  if (!img) return;
  // Use devicePixelRatio for sharpness
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(imgW * dpr);
  canvas.height = Math.round(imgH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function draw() {
  if (!img) {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    return;
  }
  // clear using CSS pixel coords
  ctx.save();
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.restore();

  // apply view
  ctx.save();
  ctx.translate(view.offsetX, view.offsetY);
  ctx.scale(view.scale, view.scale);
  ctx.drawImage(img, 0, 0, imgW, imgH);

  // draw marked tiles
  for (const t of tiles) {
    const x = t.cx - t.w/2;
    const y = t.cy - t.h/2;
    ctx.lineWidth = 3 / view.scale;
    ctx.strokeStyle = t.color;
    ctx.strokeRect(x, y, t.w, t.h);

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.font = `${14/view.scale}px system-ui`;
    ctx.fillText(`T${t.typeId}`, x + (4/view.scale), y + (16/view.scale));

    if (t.id === suggestionId) {
      ctx.lineWidth = 5 / view.scale;
      ctx.strokeStyle = '#ff1744';
      ctx.strokeRect(x-2/view.scale, y-2/view.scale, t.w+4/view.scale, t.h+4/view.scale);
    }
  }

  ctx.restore();
}

function screenToImageCoords(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = (clientX - rect.left);
  const y = (clientY - rect.top);
  // x,y are in CSS pixels within canvas element; map to image coords via view transform
  const ix = (x - view.offsetX) / view.scale;
  const iy = (y - view.offsetY) / view.scale;
  return { ix, iy };
}

// ---------- dHash clustering ----------
function dHashFromCrop(cropCanvas) {
  // classic dHash 9x8 (compare adjacent)
  const w = 9, h = 8;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const cctx = c.getContext('2d');
  cctx.drawImage(cropCanvas, 0, 0, w, h);
  const data = cctx.getImageData(0,0,w,h).data;

  // grayscale values
  const gray = [];
  for (let i=0; i<data.length; i+=4){
    const r=data[i], g=data[i+1], b=data[i+2];
    gray.push((r*0.299 + g*0.587 + b*0.114));
  }

  // build bits length 64
  let bits = new Uint8Array(64);
  let k=0;
  for (let y=0; y<h; y++){
    for (let x=0; x<w-1; x++){
      const left = gray[y*w + x];
      const right = gray[y*w + x + 1];
      bits[k++] = right > left ? 1 : 0;
    }
  }
  return bits;
}

function hamming(a, b) {
  let d=0;
  for (let i=0;i<a.length;i++) if (a[i]!==b[i]) d++;
  return d;
}

function colorForType(typeId){
  // stable palette
  const palette = ['#00C853','#2962FF','#AA00FF','#FF6D00','#00B8D4','#D50000','#C51162','#64DD17','#6200EA','#0091EA'];
  return palette[(typeId-1) % palette.length];
}

function clusterTile(hash, clusters, threshold=10){
  // clusters: [{typeId, repHash, n}]
  for (const c of clusters){
    const d = hamming(hash, c.repHash);
    if (d <= threshold){
      c.n += 1;
      return c.typeId;
    }
  }
  const typeId = clusters.length + 1;
  clusters.push({ typeId, repHash: hash, n: 1 });
  return typeId;
}

function cropTileAt(ix, iy, size) {
  const crop = document.createElement('canvas');
  crop.width = size; crop.height = size;
  const cctx = crop.getContext('2d');
  // crop region centered at ix,iy
  const sx = clamp(ix - size/2, 0, imgW - size);
  const sy = clamp(iy - size/2, 0, imgH - size);
  cctx.drawImage(img, sx, sy, size, size, 0, 0, size, size);
  return { crop, sx, sy };
}

// ---------- Tray helpers ----------
function traySize(){ return traySlots.length; }

function addToTray(typeId){
  if (traySlots.length >= 7) return false;
  traySlots.push(typeId);
  trayCounts.set(typeId, (trayCounts.get(typeId)||0) + 1);
  // auto remove triples
  if (trayCounts.get(typeId) === 3){
    // remove 3 occurrences from traySlots
    let removed = 0;
    traySlots = traySlots.filter(t => {
      if (t === typeId && removed < 3){ removed++; return false; }
      return true;
    });
    trayCounts.set(typeId, 0);
  }
  syncTrayCountsFromSlots();
  renderTray();
  return true;
}

function syncTrayCountsFromSlots(){
  trayCounts = new Map();
  for (const t of traySlots) trayCounts.set(t, (trayCounts.get(t)||0) + 1);
}

function clearTray(){
  traySlots = [];
  trayCounts = new Map();
  renderTray();
}

function renderTray(){
  const trayView = $('trayView');
  trayView.innerHTML = '';
  for (let i=0;i<7;i++){
    const slot = document.createElement('div');
    slot.className = 'slot';
    if (i < traySlots.length){
      const typeId = traySlots[i];
      slot.style.borderColor = colorForType(typeId);
      slot.style.color = colorForType(typeId);
      slot.textContent = `T${typeId}`;
    } else {
      slot.textContent = '';
    }
    trayView.appendChild(slot);
  }
  $('trayMeta').textContent = `ขนาดถาด: ${traySlots.length}/7 • นับ: ${[...trayCounts.entries()].map(([k,v])=>`T${k}:${v}`).join('  ') || '-'}`;
}

// ---------- Recommendation ----------
function recommendNextMove(){
  if (!img) return { ok:false, msg:'กรุณาอัปโหลดรูปก่อน' };
  if (tiles.length === 0) return { ok:false, msg:'ยังไม่มีไพ่ที่แตะ — แตะไพ่ที่กดได้ก่อน' };

  // count open tiles by type
  const openCount = new Map();
  for (const t of tiles) openCount.set(t.typeId, (openCount.get(t.typeId)||0)+1);

  let best = null;
  for (const t of tiles){
    const type = t.typeId;
    const inTray = trayCounts.get(type) || 0;
    const trayTypes = new Set(traySlots);

    let s = 0;
    let reason = [];

    if (inTray === 2){ s += 1000; reason.push('ปิดครบ 3 เพื่อลบ'); }
    else if (inTray === 1){ s += 220; reason.push('ทำให้เป็นคู่ (2 ใบ) เพื่อปั้นให้ครบ 3'); }

    // prefer types that have multiple open copies
    const oc = openCount.get(type) || 0;
    if (oc >= 2){ s += 80; reason.push('มีใบชนิดเดียวกันที่กดได้หลายใบ'); }

    // avoid new types when tray is crowded
    const isNewType = !trayTypes.has(type);
    if (traySlots.length >= 5 && isNewType){ s -= 150; reason.push('ถาดใกล้เต็ม ควรเลี่ยงเริ่มชนิดใหม่'); }

    // small bias towards types already in tray
    if (!isNewType) s += 40;

    // if tray is 6 and this does not help, penalize
    if (traySlots.length === 6 && inTray === 0) s -= 200;

    // tie-breaker: keep deterministic
    s += (1000 - t.id) * 1e-6;

    if (!best || s > best.score){
      best = { tile: t, score: s, reason };
    }
  }

  if (!best) return { ok:false, msg:'หาไพ่แนะนำไม่ได้' };

  // detect immediate fail risk
  if (traySlots.length >= 7) {
    return { ok:false, msg:'ถาดเต็มแล้ว (7). ลองล้างข้อมูลแล้วระบุถาดให้ถูกต้อง' };
  }

  return {
    ok: true,
    tile: best.tile,
    reason: best.reason.join(' • ') || 'คะแนนรวมดีที่สุด'
  };
}

function highlightSuggestion(tile){
  suggestionId = tile.id;
  draw();
}

// ---------- Input handlers ----------
$('upload').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    img = image;
    imgW = image.naturalWidth;
    imgH = image.naturalHeight;

    // default view fit to canvas container width
    // canvas will be sized to image, CSS will scale; set view to 1 and center
    view.scale = 1;
    view.offsetX = 0;
    view.offsetY = 0;

    // set tile size heuristic
    const heuristic = Math.round(clamp(imgW / 9, 60, 110));
    $('tileSize').value = heuristic;

    tiles = [];
    nextId = 1;
    suggestionId = null;
    clearTray();

    resizeCanvasToImage();
    draw();
  };
  image.src = url;
});

$('btnReset').addEventListener('click', () => {
  tiles = [];
  nextId = 1;
  suggestionId = null;
  clearTray();
  draw();
  $('result').textContent = 'ล้างข้อมูลแล้ว';
});

$('btnClearTray').addEventListener('click', () => {
  clearTray();
  $('result').textContent = 'ล้างถาดแล้ว';
});

$('btnSuggest').addEventListener('click', () => {
  const r = recommendNextMove();
  if (!r.ok){
    $('result').textContent = r.msg;
    suggestionId = null;
    draw();
    return;
  }
  highlightSuggestion(r.tile);
  $('result').innerHTML = `แนะนำให้กด <b>T${r.tile.typeId}</b> (กรอบแดง) • ${r.reason}`;
});

$('btnAddTray').addEventListener('click', () => {
  // Add one tile to tray by selecting from existing marked tiles: choose suggested or last.
  if (tiles.length === 0){ $('result').textContent = 'ยังไม่มีไพ่ที่แตะ'; return; }
  // if there is a suggestion, add that type; else add the last tile type
  let typeId = null;
  if (suggestionId){
    const t = tiles.find(x => x.id === suggestionId);
    if (t) typeId = t.typeId;
  }
  if (!typeId) typeId = tiles[tiles.length-1].typeId;

  const ok = addToTray(typeId);
  if (!ok){ $('result').textContent = 'ถาดเต็ม (7)'; return; }
  $('result').textContent = `เพิ่ม T${typeId} ลงถาดแล้ว (ครบ 3 จะลบอัตโนมัติ)`;
});

// Tap to add tile
canvas.addEventListener('click', (e) => {
  if (!img) return;
  // prevent click when multi-touch gesture active
  if (pointers.size > 0) return;

  const { ix, iy } = screenToImageCoords(e.clientX, e.clientY);
  if (ix < 0 || iy < 0 || ix > imgW || iy > imgH) return;

  const size = parseInt($('tileSize').value, 10);
  const { crop } = cropTileAt(ix, iy, size);

  // compute hash from inner region to reduce border effects
  const inner = document.createElement('canvas');
  inner.width = 64; inner.height = 64;
  const ictx = inner.getContext('2d');
  const pad = Math.round(size * 0.18);
  ictx.drawImage(crop, pad, pad, size-2*pad, size-2*pad, 0, 0, 64, 64);

  const hash = dHashFromCrop(inner);

  // cluster based on existing tiles
  const clusters = [];
  // build clusters from current tiles (representative per type)
  const repByType = new Map();
  for (const t of tiles){
    if (!repByType.has(t.typeId)) repByType.set(t.typeId, t.hash);
  }
  for (const [typeId, repHash] of repByType.entries()){
    clusters.push({ typeId, repHash, n: 1 });
  }

  const typeId = clusterTile(hash, clusters, 10);
  const color = colorForType(typeId);

  tiles.push({ id: nextId++, cx: ix, cy: iy, w: size, h: size, hash, typeId, color });
  suggestionId = null;
  draw();
  $('result').textContent = `เพิ่มไพ่ชนิด T${typeId} แล้ว (แตะเฉพาะไพ่ที่กดได้)`;
});

// ---------- Pan/Zoom (Pointer Events) ----------
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const pts = [...pointers.values()];
    lastPinchDist = Math.hypot(pts[0].x-pts[1].x, pts[0].y-pts[1].y);
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  const prev = pointers.get(e.pointerId);
  const cur = { x: e.clientX, y: e.clientY };
  pointers.set(e.pointerId, cur);

  if (pointers.size === 1) {
    // pan
    const dx = cur.x - prev.x;
    const dy = cur.y - prev.y;
    view.offsetX += dx;
    view.offsetY += dy;
    draw();
  } else if (pointers.size === 2) {
    const pts = [...pointers.values()];
    const dist = Math.hypot(pts[0].x-pts[1].x, pts[0].y-pts[1].y);
    if (lastPinchDist) {
      const factor = dist / lastPinchDist;
      const newScale = clamp(view.scale * factor, 0.5, 4.0);

      // zoom around midpoint
      const midX = (pts[0].x + pts[1].x)/2;
      const midY = (pts[0].y + pts[1].y)/2;
      const rect = canvas.getBoundingClientRect();
      const mx = midX - rect.left;
      const my = midY - rect.top;
      const ix = (mx - view.offsetX) / view.scale;
      const iy = (my - view.offsetY) / view.scale;

      view.offsetX = mx - ix * newScale;
      view.offsetY = my - iy * newScale;
      view.scale = newScale;

      draw();
    }
    lastPinchDist = dist;
  }
});

canvas.addEventListener('pointerup', (e) => {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) lastPinchDist = null;
});
canvas.addEventListener('pointercancel', (e) => {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) lastPinchDist = null;
});

// initial tray render
renderTray();
