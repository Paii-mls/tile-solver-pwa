// Tile Solver PWA v06
// Client-only prototype: iOS paste + DPR-safe canvas + auto detect candidates + step mode.

const $ = (id) => document.getElementById(id);
const canvas = $('canvas');
const ctx = canvas.getContext('2d');
const pasteCatcher = $('pasteCatcher');

let img = null, imgW = 0, imgH = 0;
let view = { scale: 1, offsetX: 0, offsetY: 0 }; // offset CSS px, scale multiplier over baseScale
let dpr = window.devicePixelRatio || 1;
let pointers = new Map();
let lastPinchDist = null;
let pointerDownInfo = null;
let suppressNextTap = false;
let tapMode = 'add-or-toggle';

let tiles = []; // {id,cx,cy,w,h,hash,typeId,color,active,source}
let nextId = 1;
let trayCounts = new Map();
let traySlots = [];
let suggestionId = null;
let history = [];

function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function colorForType(typeId){ const p=['#00C853','#2962FF','#AA00FF','#FF6D00','#00B8D4','#D50000','#C51162','#64DD17','#6200EA','#0091EA','#795548','#607D8B','#C0CA33','#F50057']; return p[(typeId-1)%p.length]; }
function getRect(){ return canvas.getBoundingClientRect(); }
function getDisplaySize(){ const rect=getRect(); const width=Math.max(320, rect.width || canvas.parentElement.clientWidth || 360); const height=img ? width*imgH/imgW : width*1.6; return {width,height}; }
function getBaseScale(){ const {width}=getDisplaySize(); return img ? width/imgW : 1; }
function resizeCanvasToDisplay(){ dpr=window.devicePixelRatio||1; const {width,height}=getDisplaySize(); canvas.style.height=`${height}px`; canvas.width=Math.round(width*dpr); canvas.height=Math.round(height*dpr); ctx.setTransform(dpr,0,0,dpr,0,0); draw(); }
function cssToImage(cx,cy){ const s=getBaseScale()*view.scale; return {ix:(cx-view.offsetX)/s, iy:(cy-view.offsetY)/s}; }
function clientToCss(clientX,clientY){ const rect=getRect(); return {x:clientX-rect.left,y:clientY-rect.top}; }
function clientToImage(clientX,clientY){ const p=clientToCss(clientX,clientY); return cssToImage(p.x,p.y); }

function draw(){
  const {width,height}=getDisplaySize();
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,width,height);
  if(!img){ ctx.fillStyle='#f2f2f2'; ctx.fillRect(0,0,width,height); ctx.fillStyle='#777'; ctx.font='14px system-ui'; ctx.fillText('อัปโหลดหรือ Paste รูปก่อน',16,28); return; }
  ctx.save();
  const s=getBaseScale()*view.scale;
  ctx.translate(view.offsetX,view.offsetY); ctx.scale(s,s);
  ctx.drawImage(img,0,0,imgW,imgH);
  for(const t of tiles){
    const x=t.cx-t.w/2, y=t.cy-t.h/2;
    ctx.lineWidth=(t.active?3:2)/s;
    ctx.setLineDash(t.active?[]:[8/s,5/s]);
    ctx.globalAlpha=t.active?1:0.45;
    ctx.strokeStyle=t.color; ctx.strokeRect(x,y,t.w,t.h);
    ctx.fillStyle='rgba(0,0,0,.68)'; ctx.font=`${14/s}px system-ui`;
    ctx.fillText(`T${t.typeId}`, x+4/s, y+16/s);
    ctx.globalAlpha=1; ctx.setLineDash([]);
    if(t.id===suggestionId){ ctx.lineWidth=6/s; ctx.strokeStyle='#ff1744'; ctx.strokeRect(x-3/s,y-3/s,t.w+6/s,t.h+6/s); }
  }
  ctx.restore();
}

function resetBoardOnly(){ tiles=[]; nextId=1; suggestionId=null; history=[]; clearTray(); }
async function setImageFromBlob(blob){
  const url=URL.createObjectURL(blob); const image=new Image();
  image.onload=()=>{ img=image; imgW=image.naturalWidth; imgH=image.naturalHeight; view={scale:1,offsetX:0,offsetY:0}; resetBoardOnly(); const heuristic=Math.round(clamp(imgW/9,60,115)); $('tileSize').value=heuristic; $('tileSizeLabel').textContent=heuristic; resizeCanvasToDisplay(); $('result').textContent='โหลดรูปแล้ว — กด Auto Detect หรือแตะไพ่ที่กดได้'; };
  image.onerror=()=> $('result').textContent='อ่านรูปไม่สำเร็จ ลอง Paste ใหม่หรือใช้ปุ่มเลือกรูป';
  image.src=url;
}
async function pasteFromClipboard(){
  try{ if(navigator.clipboard && navigator.clipboard.read){ const items=await navigator.clipboard.read(); for(const item of items){ const type=item.types.find(t=>t.startsWith('image/')); if(type){ await setImageFromBlob(await item.getType(type)); return true; } } $('result').textContent='ไม่พบรูปในคลิปบอร์ด — ให้ Copy Screenshot ก่อน'; return false; } }catch(e){}
  $('result').textContent='ถ้า iOS ไม่อนุญาตอ่าน clipboard ให้แตะค้างแล้วเลือก Paste'; pasteCatcher.focus(); return false;
}

function dHashFromCanvas(cropCanvas){ const w=9,h=8,c=document.createElement('canvas'); c.width=w;c.height=h; const cctx=c.getContext('2d'); cctx.drawImage(cropCanvas,0,0,w,h); const data=cctx.getImageData(0,0,w,h).data, gray=[]; for(let i=0;i<data.length;i+=4) gray.push(data[i]*.299+data[i+1]*.587+data[i+2]*.114); const bits=new Uint8Array(64); let k=0; for(let y=0;y<h;y++) for(let x=0;x<w-1;x++) bits[k++]=gray[y*w+x+1]>gray[y*w+x]?1:0; return bits; }
function hamming(a,b){ let d=0; for(let i=0;i<a.length;i++) if(a[i]!==b[i]) d++; return d; }
function cropTileAt(ix,iy,size){ const crop=document.createElement('canvas'); crop.width=size; crop.height=size; const cctx=crop.getContext('2d'); const sx=clamp(ix-size/2,0,Math.max(0,imgW-size)); const sy=clamp(iy-size/2,0,Math.max(0,imgH-size)); cctx.drawImage(img,sx,sy,size,size,0,0,size,size); return crop; }
function tileHashAt(ix,iy,size){ const crop=cropTileAt(ix,iy,size); const inner=document.createElement('canvas'); inner.width=64; inner.height=64; const ictx=inner.getContext('2d'); const pad=Math.round(size*.18); ictx.drawImage(crop,pad,pad,size-2*pad,size-2*pad,0,0,64,64); return dHashFromCanvas(inner); }
function recluster(){
  const reps=[];
  for(const t of tiles){
    let assigned=false;
    for(const r of reps){ if(hamming(t.hash,r.hash)<=10){ t.typeId=r.typeId; assigned=true; break; } }
    if(!assigned){ const typeId=reps.length+1; reps.push({typeId,hash:t.hash}); t.typeId=typeId; }
    t.color=colorForType(t.typeId);
  }
}
function addTileAtImage(ix,iy,source='manual'){
  const size=parseInt($('tileSize').value,10);
  if(ix<0||iy<0||ix>imgW||iy>imgH) return null;
  const hash=tileHashAt(ix,iy,size);
  const tile={id:nextId++,cx:ix,cy:iy,w:size,h:size,hash,typeId:999,color:'#999',active:true,source};
  tiles.push(tile); recluster(); draw(); return tile;
}
function findTileAtImage(ix,iy){
  for(let i=tiles.length-1;i>=0;i--){ const t=tiles[i]; if(ix>=t.cx-t.w/2 && ix<=t.cx+t.w/2 && iy>=t.cy-t.h/2 && iy<=t.cy+t.h/2) return t; }
  return null;
}

// Lightweight CV/AI-assisted detector: sliding window tile-likeness + NMS. This intentionally detects candidates, not guaranteed final truth.
function meanStats(data, x0,y0,w,h,stride=4){
  let n=0,sum=0,sum2=0,edge=0;
  const W=data.width, H=data.height, arr=data.data;
  const x1=clamp(Math.floor(x0+w),0,W-1), y1=clamp(Math.floor(y0+h),0,H-1);
  x0=clamp(Math.floor(x0),0,W-1); y0=clamp(Math.floor(y0),0,H-1);
  for(let y=y0;y<y1;y+=stride){ for(let x=x0;x<x1;x+=stride){ const idx=(y*W+x)*4; const r=arr[idx],g=arr[idx+1],b=arr[idx+2]; const br=(r+g+b)/3; sum+=br; sum2+=br*br; n++; if(x+stride<x1 && y+stride<y1){ const idx2=(y*W+x+stride)*4, idx3=((y+stride)*W+x)*4; const br2=(arr[idx2]+arr[idx2+1]+arr[idx2+2])/3, br3=(arr[idx3]+arr[idx3+1]+arr[idx3+2])/3; edge += Math.abs(br-br2)+Math.abs(br-br3); } } }
  const mean=sum/Math.max(1,n); const variance=sum2/Math.max(1,n)-mean*mean; return {mean,variance,edge:edge/Math.max(1,n)};
}
function iou(a,b){ const ax0=a.cx-a.w/2, ay0=a.cy-a.h/2, ax1=a.cx+a.w/2, ay1=a.cy+a.h/2; const bx0=b.cx-b.w/2, by0=b.cy-b.h/2, bx1=b.cx+b.w/2, by1=b.cy+b.h/2; const ix=Math.max(0,Math.min(ax1,bx1)-Math.max(ax0,bx0)); const iy=Math.max(0,Math.min(ay1,by1)-Math.max(ay0,by0)); const inter=ix*iy; const union=a.w*a.h+b.w*b.h-inter; return union?inter/union:0; }
function autoDetectTiles(){
  if(!img){ $('result').textContent='กรุณาโหลดรูปก่อน'; return; }
  const size=parseInt($('tileSize').value,10);
  const sens=parseInt($('detectSensitivity').value,10);
  const scale=Math.min(1, 900/imgW);
  const pc=document.createElement('canvas'); pc.width=Math.round(imgW*scale); pc.height=Math.round(imgH*scale);
  const pctx=pc.getContext('2d'); pctx.drawImage(img,0,0,pc.width,pc.height);
  const imageData=pctx.getImageData(0,0,pc.width,pc.height);
  const sSize=size*scale;
  const step=Math.max(8, Math.round(sSize/4));
  const candidates=[];
  // skip top/bottom UI-ish margins lightly, but keep broad enough for landscape layouts
  for(let y=Math.round(sSize/2); y<pc.height-sSize/2; y+=step){
    for(let x=Math.round(sSize/2); x<pc.width-sSize/2; x+=step){
      const st=meanStats(imageData,x-sSize/2,y-sSize/2,sSize,sSize,Math.max(2,Math.round(sSize/18)));
      const inner=meanStats(imageData,x-sSize*.28,y-sSize*.28,sSize*.56,sSize*.56,Math.max(2,Math.round(sSize/20)));
      // tile-like: bright-ish card area with enough internal detail; sensitivity changes threshold
      const brightScore=(st.mean-80)*1.15;
      const detailScore=Math.sqrt(Math.max(0,inner.variance))*2.2 + st.edge*0.65;
      const score=brightScore+detailScore;
      if(score > 120 - sens){ candidates.push({cx:x/scale,cy:y/scale,w:size,h:size,score}); }
    }
  }
  candidates.sort((a,b)=>b.score-a.score);
  const selected=[];
  const maxCandidates=80;
  for(const c of candidates){
    if(selected.length>=maxCandidates) break;
    if(selected.every(o=>iou(c,o)<0.32)) selected.push(c);
  }
  // merge with existing: add only non-overlap
  let added=0;
  for(const c of selected){
    if(tiles.every(t=>iou(c,t)<0.35)) { addTileAtImage(c.cx,c.cy,'auto'); added++; }
  }
  recluster(); suggestionId=null; draw();
  $('result').textContent=`Auto Detect เพิ่ม ${added} ใบ / รวม ${tiles.length} ใบ — แตะกรอบที่ผิดเพื่อปิดใช้งาน หรือแตะเพิ่มใบที่ตกหล่น`;
}

function syncTrayCounts(){ trayCounts=new Map(); for(const t of traySlots) trayCounts.set(t,(trayCounts.get(t)||0)+1); }
function addToTray(typeId){ if(traySlots.length>=7) return false; traySlots.push(typeId); syncTrayCounts(); let cleared=false; if(trayCounts.get(typeId)===3){ let removed=0; traySlots=traySlots.filter(t=>(t===typeId && removed++<3)?false:true); syncTrayCounts(); cleared=true; } renderTray(); return {ok:true,cleared}; }
function clearTray(){ traySlots=[]; trayCounts=new Map(); renderTray(); }
function renderTray(){ const trayView=$('trayView'); trayView.innerHTML=''; for(let i=0;i<7;i++){ const slot=document.createElement('div'); slot.className='slot'; if(i<traySlots.length){ const typeId=traySlots[i]; slot.textContent=`T${typeId}`; slot.style.borderColor=colorForType(typeId); slot.style.color=colorForType(typeId); } trayView.appendChild(slot); } $('trayMeta').textContent=`ขนาดถาด: ${traySlots.length}/7 • นับ: ${[...trayCounts.entries()].map(([k,v])=>`T${k}:${v}`).join('  ') || '-'}`; }
function activeTiles(){ return tiles.filter(t=>t.active); }
function recommendNextMove(){
  if(!img) return {ok:false,msg:'กรุณาอัปโหลดหรือ Paste รูปก่อน'};
  const pool=activeTiles();
  if(!pool.length) return {ok:false,msg:'ไม่มี candidate ที่ active — แตะเพิ่มไพ่ที่กดได้ หรือ Auto Detect ใหม่'};
  if(traySlots.length>=7) return {ok:false,msg:'ถาดเต็มแล้ว (7)'};
  const openCount=new Map(); for(const t of pool) openCount.set(t.typeId,(openCount.get(t.typeId)||0)+1);
  const trayTypes=new Set(traySlots); let best=null;
  for(const t of pool){
    const type=t.typeId, inTray=trayCounts.get(type)||0; let score=0, reason=[];
    if(inTray===2){ score+=1000; reason.push('ปิดครบ 3 เพื่อลบ'); }
    else if(inTray===1){ score+=220; reason.push('ทำให้เป็นคู่ (2 ใบ)'); }
    if((openCount.get(type)||0)>=2){ score+=85; reason.push('มีชนิดเดียวกันที่กดได้หลายใบ'); }
    if(traySlots.length>=5 && !trayTypes.has(type)){ score-=180; reason.push('ถาดใกล้เต็ม เลี่ยงชนิดใหม่'); }
    if(trayTypes.has(type)) score+=45;
    if(traySlots.length===6 && inTray===0) score-=250;
    score += (1000-t.id)*1e-6;
    if(!best || score>best.score) best={tile:t,score,reason};
  }
  return {ok:true,tile:best.tile,reason:best.reason.join(' • ') || 'คะแนนรวมดีที่สุด'};
}
function suggest(){ const r=recommendNextMove(); if(!r.ok){ suggestionId=null; draw(); $('result').textContent=r.msg; return false; } suggestionId=r.tile.id; draw(); $('result').innerHTML=`แนะนำให้กด <b>T${r.tile.typeId}</b> (กรอบแดง) • ${r.reason}`; return true; }
function applySuggestedMove(){
  if(!suggestionId){ if(!suggest()) return; }
  const idx=tiles.findIndex(t=>t.id===suggestionId);
  if(idx<0){ suggestionId=null; suggest(); return; }
  const tile=tiles[idx];
  const snapshot={tiles:tiles.map(t=>({...t, hash:new Uint8Array(t.hash)})), traySlots:[...traySlots], suggestionId, nextId};
  history.push(snapshot);
  const add=addToTray(tile.typeId);
  tiles.splice(idx,1);
  suggestionId=null; recluster(); draw(); renderTray();
  const clearedText=add.cleared?' • ครบ 3 ลบออกจากถาดแล้ว':'';
  $('result').textContent=`บันทึกว่าได้กด T${tile.typeId} แล้ว${clearedText}`;
  setTimeout(()=>suggest(), 60);
}
function undo(){
  const last=history.pop(); if(!last){ $('result').textContent='ไม่มีประวัติให้ Undo'; return; }
  tiles=last.tiles.map(t=>({...t, hash:new Uint8Array(t.hash)})); traySlots=[...last.traySlots]; suggestionId=last.suggestionId; nextId=last.nextId; syncTrayCounts(); renderTray(); draw(); $('result').textContent='Undo แล้ว';
}

$('upload').addEventListener('change', e=>{ const file=e.target.files[0]; if(file) setImageFromBlob(file); });
$('btnPaste').addEventListener('click', pasteFromClipboard);
$('btnReset').addEventListener('click',()=>{ tiles=[]; nextId=1; suggestionId=null; history=[]; clearTray(); draw(); $('result').textContent='ล้างข้อมูลแล้ว'; });
$('btnClearTray').addEventListener('click',()=>{ clearTray(); $('result').textContent='ล้างถาดแล้ว'; });
$('btnAutoDetect').addEventListener('click',autoDetectTiles);
$('btnSuggest').addEventListener('click',suggest);
$('btnApply').addEventListener('click',applySuggestedMove);
$('btnUndo').addEventListener('click',undo);
$('btnToggleMode').addEventListener('click',()=>{ tapMode=tapMode==='add-or-toggle'?'toggle-only':'add-or-toggle'; $('btnToggleMode').textContent=tapMode==='add-or-toggle'?'โหมดแตะ: เพิ่ม/เลือกไพ่':'โหมดแตะ: เลือกกรอบเท่านั้น'; });
$('tileSize').addEventListener('input', e=> $('tileSizeLabel').textContent=e.target.value);
$('detectSensitivity').addEventListener('input', e=> $('detectSensitivityLabel').textContent=e.target.value);

function handleTap(clientX,clientY){
  if(!img) return;
  const {ix,iy}=clientToImage(clientX,clientY);
  const hit=findTileAtImage(ix,iy);
  if(hit){ hit.active=!hit.active; suggestionId=null; draw(); $('result').textContent=`${hit.active?'เปิดใช้งาน':'ปิดใช้งาน'} T${hit.typeId}`; return; }
  if(tapMode==='add-or-toggle'){ const t=addTileAtImage(ix,iy,'manual'); if(t) $('result').textContent=`เพิ่มไพ่ T${t.typeId} แล้ว`; }
}
canvas.addEventListener('pointerdown',e=>{ canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId,{x:e.clientX,y:e.clientY}); if(pointers.size===1) pointerDownInfo={x:e.clientX,y:e.clientY,time:Date.now()}; if(pointers.size===2){ const pts=[...pointers.values()]; lastPinchDist=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y); suppressNextTap=true; } });
canvas.addEventListener('pointermove',e=>{ if(!pointers.has(e.pointerId)) return; const prev=pointers.get(e.pointerId), cur={x:e.clientX,y:e.clientY}; pointers.set(e.pointerId,cur); if(pointers.size===1){ const dx=cur.x-prev.x,dy=cur.y-prev.y; if(Math.abs(dx)+Math.abs(dy)>1){ view.offsetX+=dx; view.offsetY+=dy; draw(); } } else if(pointers.size===2){ const pts=[...pointers.values()], dist=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y); if(lastPinchDist){ const factor=dist/lastPinchDist; const newScale=clamp(view.scale*factor,.5,5); const rect=getRect(); const mx=(pts[0].x+pts[1].x)/2-rect.left, my=(pts[0].y+pts[1].y)/2-rect.top; const before=cssToImage(mx,my); view.scale=newScale; const s=getBaseScale()*view.scale; view.offsetX=mx-before.ix*s; view.offsetY=my-before.iy*s; draw(); } lastPinchDist=dist; } });
function endPointer(e){ const wasSingle=pointers.size===1 && pointers.has(e.pointerId); pointers.delete(e.pointerId); if(pointers.size<2) lastPinchDist=null; if(wasSingle && pointerDownInfo && !suppressNextTap){ const moved=Math.hypot(e.clientX-pointerDownInfo.x,e.clientY-pointerDownInfo.y); const elapsed=Date.now()-pointerDownInfo.time; if(moved<8 && elapsed<700) handleTap(e.clientX,e.clientY); } if(pointers.size===0){ pointerDownInfo=null; setTimeout(()=>{suppressNextTap=false;},50); } }
canvas.addEventListener('pointerup',endPointer);
canvas.addEventListener('pointercancel',e=>{ pointers.delete(e.pointerId); pointerDownInfo=null; if(pointers.size<2) lastPinchDist=null; suppressNextTap=false; });

if(pasteCatcher){ pasteCatcher.addEventListener('paste', async e=>{ const cd=e.clipboardData; if(!cd) return; if(cd.items){ for(const it of cd.items){ if(it.type && it.type.startsWith('image/')){ const blob=it.getAsFile(); if(blob){ e.preventDefault(); await setImageFromBlob(blob); return; } } } } const html=cd.getData('text/html'); if(html){ const m=html.match(/<img[^>]+src=["']([^"']+)["']/i); if(m && m[1] && m[1].startsWith('data:image/')){ e.preventDefault(); const res=await fetch(m[1]); await setImageFromBlob(await res.blob()); return; } } $('result').textContent='Paste ไม่พบรูป — ให้ Copy Screenshot ใหม่ แล้วลองอีกครั้ง'; }); }
window.addEventListener('resize',()=>{ if(img) resizeCanvasToDisplay(); });
renderTray(); resizeCanvasToDisplay();
