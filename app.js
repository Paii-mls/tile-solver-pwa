// Tile Solver MVP v0.4
// DPR-safe canvas: tile coordinates are stored in IMAGE pixels. Rendering maps IMAGE -> CSS pixels via baseScale.

const $ = (id) => document.getElementById(id);
const canvas = $('canvas');
const ctx = canvas.getContext('2d');
const pasteCatcher = $('pasteCatcher');

let img = null;
let imgW = 0, imgH = 0;

// view.offset is in CSS pixels. view.scale is zoom multiplier over baseScale.
let view = { scale: 1, offsetX: 0, offsetY: 0 };
let dpr = window.devicePixelRatio || 1;

let pointers = new Map();
let lastPinchDist = null;
let pointerDownInfo = null;
let suppressNextTap = false;

let tiles = []; // {id,cx,cy,w,h,hash,typeId,color} in IMAGE px
let nextId = 1;
let trayCounts = new Map();
let traySlots = [];
let suggestionId = null;

function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function colorForType(typeId){
  const palette=['#00C853','#2962FF','#AA00FF','#FF6D00','#00B8D4','#D50000','#C51162','#64DD17','#6200EA','#0091EA','#795548','#607D8B'];
  return palette[(typeId-1)%palette.length];
}
function getRect(){ return canvas.getBoundingClientRect(); }
function getDisplaySize(){
  const rect = getRect();
  const width = Math.max(320, rect.width || canvas.parentElement.clientWidth || 360);
  const height = img ? width * imgH / imgW : width * 1.6;
  return { width, height };
}
function getBaseScale(){
  const { width } = getDisplaySize();
  return img ? width / imgW : 1;
}

function resizeCanvasToDisplay(){
  dpr = window.devicePixelRatio || 1;
  const { width, height } = getDisplaySize();
  canvas.style.height = `${height}px`;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0); // draw using CSS px
  draw();
}

function imageToCss(ix, iy){
  const s = getBaseScale() * view.scale;
  return { x: view.offsetX + ix * s, y: view.offsetY + iy * s };
}
function cssToImage(cx, cy){
  const s = getBaseScale() * view.scale;
  return { ix: (cx - view.offsetX) / s, iy: (cy - view.offsetY) / s };
}
function clientToCss(clientX, clientY){
  const rect = getRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
}
function clientToImage(clientX, clientY){
  const p = clientToCss(clientX, clientY);
  return cssToImage(p.x, p.y);
}

function draw(){
  const { width, height } = getDisplaySize();
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,width,height);
  if(!img){
    ctx.fillStyle = '#f2f2f2'; ctx.fillRect(0,0,width,height);
    ctx.fillStyle = '#777'; ctx.font = '14px system-ui'; ctx.fillText('อัปโหลดหรือ Paste รูปก่อน', 16, 28);
    return;
  }

  ctx.save();
  const s = getBaseScale() * view.scale;
  ctx.translate(view.offsetX, view.offsetY);
  ctx.scale(s, s);
  ctx.drawImage(img, 0, 0, imgW, imgH);

  for(const t of tiles){
    const x = t.cx - t.w/2, y = t.cy - t.h/2;
    ctx.lineWidth = 3 / s;
    ctx.strokeStyle = t.color;
    ctx.strokeRect(x,y,t.w,t.h);
    ctx.fillStyle = 'rgba(0,0,0,.65)';
    ctx.font = `${14/s}px system-ui`;
    ctx.fillText(`T${t.typeId}`, x + 4/s, y + 16/s);

    if(t.id === suggestionId){
      ctx.lineWidth = 6 / s;
      ctx.strokeStyle = '#ff1744';
      ctx.strokeRect(x-3/s, y-3/s, t.w+6/s, t.h+6/s);
    }
  }
  ctx.restore();
}

function resetBoardOnly(){
  tiles=[]; nextId=1; suggestionId=null; clearTray();
}

async function setImageFromBlob(blob){
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.onload = () => {
    img = image; imgW = image.naturalWidth; imgH = image.naturalHeight;
    view = { scale:1, offsetX:0, offsetY:0 };
    resetBoardOnly();
    const heuristic = Math.round(clamp(imgW / 9, 60, 110));
    $('tileSize').value = heuristic; $('tileSizeLabel').textContent = heuristic;
    resizeCanvasToDisplay();
    $('result').textContent = 'โหลดรูปแล้ว — แตะไพ่ที่กดได้เพื่อเริ่ม';
  };
  image.onerror = () => $('result').textContent = 'อ่านรูปไม่สำเร็จ ลอง Paste ใหม่หรือใช้ปุ่มเลือกรูป';
  image.src = url;
}

async function pasteFromClipboard(){
  try{
    if(navigator.clipboard && navigator.clipboard.read){
      const items = await navigator.clipboard.read();
      for(const item of items){
        const type = item.types.find(t => t.startsWith('image/'));
        if(type){ await setImageFromBlob(await item.getType(type)); return true; }
      }
      $('result').textContent = 'ไม่พบรูปในคลิปบอร์ด — ให้ Copy Screenshot ก่อน';
      return false;
    }
  }catch(e){ /* fallback below */ }
  $('result').textContent = 'iOS รุ่นนี้อาจไม่อนุญาตอ่านคลิปบอร์ดอัตโนมัติ — แตะค้างแล้วเลือก Paste';
  pasteCatcher.focus();
  return false;
}

function dHashFromCanvas(cropCanvas){
  const w=9,h=8,c=document.createElement('canvas'); c.width=w; c.height=h;
  const cctx=c.getContext('2d'); cctx.drawImage(cropCanvas,0,0,w,h);
  const data=cctx.getImageData(0,0,w,h).data, gray=[];
  for(let i=0;i<data.length;i+=4) gray.push(data[i]*.299+data[i+1]*.587+data[i+2]*.114);
  const bits=new Uint8Array(64); let k=0;
  for(let y=0;y<h;y++) for(let x=0;x<w-1;x++) bits[k++] = gray[y*w+x+1] > gray[y*w+x] ? 1 : 0;
  return bits;
}
function hamming(a,b){ let d=0; for(let i=0;i<a.length;i++) if(a[i]!==b[i]) d++; return d; }
function clusterTile(hash, threshold=10){
  const repByType = new Map();
  for(const t of tiles) if(!repByType.has(t.typeId)) repByType.set(t.typeId,t.hash);
  for(const [typeId, rep] of repByType.entries()) if(hamming(hash,rep) <= threshold) return typeId;
  return repByType.size + 1;
}
function cropTileAt(ix,iy,size){
  const crop=document.createElement('canvas'); crop.width=size; crop.height=size;
  const cctx=crop.getContext('2d');
  const sx=clamp(ix-size/2,0,Math.max(0,imgW-size));
  const sy=clamp(iy-size/2,0,Math.max(0,imgH-size));
  cctx.drawImage(img,sx,sy,size,size,0,0,size,size);
  return crop;
}
function markTileAtClient(clientX,clientY){
  if(!img) return;
  const {ix,iy}=clientToImage(clientX,clientY);
  if(ix<0||iy<0||ix>imgW||iy>imgH) return;
  const size=parseInt($('tileSize').value,10);
  const crop=cropTileAt(ix,iy,size);
  const inner=document.createElement('canvas'); inner.width=64; inner.height=64;
  const ictx=inner.getContext('2d'); const pad=Math.round(size*.18);
  ictx.drawImage(crop,pad,pad,size-2*pad,size-2*pad,0,0,64,64);
  const hash=dHashFromCanvas(inner);
  const typeId=clusterTile(hash,10);
  tiles.push({id:nextId++,cx:ix,cy:iy,w:size,h:size,hash,typeId,color:colorForType(typeId)});
  suggestionId=null; draw();
  $('result').textContent = `เพิ่มไพ่ชนิด T${typeId} แล้ว`;
}

function syncTrayCounts(){ trayCounts=new Map(); for(const t of traySlots) trayCounts.set(t,(trayCounts.get(t)||0)+1); }
function addToTray(typeId){
  if(traySlots.length>=7) return false;
  traySlots.push(typeId); syncTrayCounts();
  if(trayCounts.get(typeId)===3){ let removed=0; traySlots=traySlots.filter(t => (t===typeId && removed++<3) ? false : true); syncTrayCounts(); }
  renderTray(); return true;
}
function clearTray(){ traySlots=[]; trayCounts=new Map(); renderTray(); }
function renderTray(){
  const trayView=$('trayView'); trayView.innerHTML='';
  for(let i=0;i<7;i++){
    const slot=document.createElement('div'); slot.className='slot';
    if(i<traySlots.length){ const typeId=traySlots[i]; slot.textContent=`T${typeId}`; slot.style.borderColor=colorForType(typeId); slot.style.color=colorForType(typeId); }
    trayView.appendChild(slot);
  }
  $('trayMeta').textContent = `ขนาดถาด: ${traySlots.length}/7 • นับ: ${[...trayCounts.entries()].map(([k,v])=>`T${k}:${v}`).join('  ') || '-'}`;
}
function recommendNextMove(){
  if(!img) return {ok:false,msg:'กรุณาอัปโหลดหรือ Paste รูปก่อน'};
  if(!tiles.length) return {ok:false,msg:'ยังไม่มีไพ่ที่แตะ — แตะไพ่ที่กดได้ก่อน'};
  if(traySlots.length>=7) return {ok:false,msg:'ถาดเต็มแล้ว (7)'};
  const openCount=new Map(); for(const t of tiles) openCount.set(t.typeId,(openCount.get(t.typeId)||0)+1);
  const trayTypes=new Set(traySlots); let best=null;
  for(const t of tiles){
    const type=t.typeId, inTray=trayCounts.get(type)||0; let score=0, reason=[];
    if(inTray===2){ score+=1000; reason.push('ปิดครบ 3 เพื่อลบ'); }
    else if(inTray===1){ score+=220; reason.push('ทำให้เป็นคู่ (2 ใบ)'); }
    if((openCount.get(type)||0)>=2){ score+=80; reason.push('มีชนิดเดียวกันที่กดได้หลายใบ'); }
    if(traySlots.length>=5 && !trayTypes.has(type)){ score-=150; reason.push('ถาดใกล้เต็ม ควรเลี่ยงชนิดใหม่'); }
    if(trayTypes.has(type)) score+=40;
    if(traySlots.length===6 && inTray===0) score-=200;
    score += (1000-t.id)*1e-6;
    if(!best || score>best.score) best={tile:t,score,reason};
  }
  return {ok:true,tile:best.tile,reason:best.reason.join(' • ') || 'คะแนนรวมดีที่สุด'};
}

$('upload').addEventListener('change', e => { const file=e.target.files[0]; if(file) setImageFromBlob(file); });
$('btnPaste').addEventListener('click', pasteFromClipboard);
$('btnReset').addEventListener('click', () => { tiles=[]; nextId=1; suggestionId=null; clearTray(); draw(); $('result').textContent='ล้างข้อมูลแล้ว'; });
$('btnClearTray').addEventListener('click', () => { clearTray(); $('result').textContent='ล้างถาดแล้ว'; });
$('btnAddTray').addEventListener('click', () => {
  if(!tiles.length){ $('result').textContent='ยังไม่มีไพ่ที่แตะ'; return; }
  let typeId=null;
  if(suggestionId){ const t=tiles.find(x=>x.id===suggestionId); if(t) typeId=t.typeId; }
  if(!typeId) typeId=tiles[tiles.length-1].typeId;
  if(!addToTray(typeId)){ $('result').textContent='ถาดเต็ม (7)'; return; }
  $('result').textContent=`เพิ่ม T${typeId} ลงถาดแล้ว (ครบ 3 จะลบอัตโนมัติ)`;
});
$('btnSuggest').addEventListener('click', () => {
  const r=recommendNextMove();
  if(!r.ok){ suggestionId=null; draw(); $('result').textContent=r.msg; return; }
  suggestionId=r.tile.id; draw();
  $('result').innerHTML = `แนะนำให้กด <b>T${r.tile.typeId}</b> (กรอบแดง) • ${r.reason}`;
});
$('tileSize').addEventListener('input', e => $('tileSizeLabel').textContent=e.target.value);

// Pointer handling: pan/pinch + tap-to-mark. Coordinates are DPR-safe through clientToImage().
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointers.size===1) pointerDownInfo={x:e.clientX,y:e.clientY,time:Date.now()};
  if(pointers.size===2){
    const pts=[...pointers.values()]; lastPinchDist=Math.hypot(pts[0].x-pts[1].x, pts[0].y-pts[1].y); suppressNextTap=true;
  }
});
canvas.addEventListener('pointermove', e => {
  if(!pointers.has(e.pointerId)) return;
  const prev=pointers.get(e.pointerId), cur={x:e.clientX,y:e.clientY}; pointers.set(e.pointerId,cur);
  if(pointers.size===1){
    const dx=cur.x-prev.x, dy=cur.y-prev.y;
    if(Math.abs(dx)+Math.abs(dy)>1){ view.offsetX+=dx; view.offsetY+=dy; draw(); }
  }else if(pointers.size===2){
    const pts=[...pointers.values()]; const dist=Math.hypot(pts[0].x-pts[1].x, pts[0].y-pts[1].y);
    if(lastPinchDist){
      const factor=dist/lastPinchDist;
      const oldScale=view.scale; const newScale=clamp(oldScale*factor,.5,5);
      const rect=getRect(); const mx=(pts[0].x+pts[1].x)/2-rect.left, my=(pts[0].y+pts[1].y)/2-rect.top;
      const before=cssToImage(mx,my);
      view.scale=newScale;
      const s=getBaseScale()*view.scale;
      view.offsetX = mx - before.ix*s;
      view.offsetY = my - before.iy*s;
      draw();
    }
    lastPinchDist=dist;
  }
});
function endPointer(e){
  const wasSingle = pointers.size===1 && pointers.has(e.pointerId);
  pointers.delete(e.pointerId);
  if(pointers.size<2) lastPinchDist=null;
  if(wasSingle && pointerDownInfo && !suppressNextTap){
    const moved=Math.hypot(e.clientX-pointerDownInfo.x, e.clientY-pointerDownInfo.y);
    const elapsed=Date.now()-pointerDownInfo.time;
    if(moved<8 && elapsed<700) markTileAtClient(e.clientX,e.clientY);
  }
  if(pointers.size===0){ pointerDownInfo=null; setTimeout(()=>{suppressNextTap=false;},50); }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', e => { pointers.delete(e.pointerId); pointerDownInfo=null; if(pointers.size<2) lastPinchDist=null; suppressNextTap=false; });

if(pasteCatcher){
  pasteCatcher.addEventListener('paste', async e => {
    const cd=e.clipboardData; if(!cd) return;
    if(cd.items){
      for(const it of cd.items){
        if(it.type && it.type.startsWith('image/')){ const blob=it.getAsFile(); if(blob){ e.preventDefault(); await setImageFromBlob(blob); return; } }
      }
    }
    const html=cd.getData('text/html');
    if(html){
      const m=html.match(/<img[^>]+src=["']([^"']+)["']/i);
      if(m && m[1] && m[1].startsWith('data:image/')){ e.preventDefault(); const res=await fetch(m[1]); await setImageFromBlob(await res.blob()); return; }
    }
    $('result').textContent='Paste ไม่พบรูป — ให้ Copy Screenshot ใหม่ แล้วลองอีกครั้ง';
  });
}

window.addEventListener('resize', () => { if(img) resizeCanvasToDisplay(); });
renderTray(); resizeCanvasToDisplay();
