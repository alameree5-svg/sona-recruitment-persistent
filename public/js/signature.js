
function initSignature(canvasId, inputId){
  const canvas = document.getElementById(canvasId);
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  let drawing=false, lastX=0, lastY=0;
  function resize(){ const d=canvas.toDataURL(); canvas.width=canvas.offsetWidth; canvas.height=canvas.offsetHeight; if(d){const i=new Image(); i.onload=()=>ctx.drawImage(i,0,0,canvas.width,canvas.height); i.src=d;} }
  window.addEventListener('resize', resize); setTimeout(resize,0);
  function pos(e){ const r=canvas.getBoundingClientRect(); const x=(e.touches?e.touches[0].clientX:e.clientX)-r.left; const y=(e.touches?e.touches[0].clientY:e.clientY)-r.top; return {x,y}; }
  function start(e){ drawing=true; const p=pos(e); lastX=p.x; lastY=p.y; e.preventDefault(); }
  function move(e){ if(!drawing) return; const p=pos(e); ctx.strokeStyle='#e5e7eb'; ctx.lineWidth=2; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(lastX,lastY); ctx.lineTo(p.x,p.y); ctx.stroke(); lastX=p.x; lastY=p.y; e.preventDefault(); }
  function end(e){ drawing=false; e.preventDefault(); }
  canvas.addEventListener('mousedown', start); canvas.addEventListener('mousemove', move); canvas.addEventListener('mouseup', end); canvas.addEventListener('mouseleave', end);
  canvas.addEventListener('touchstart', start, {passive:false}); canvas.addEventListener('touchmove', move, {passive:false}); canvas.addEventListener('touchend', end, {passive:false});
  const form = canvas.closest('form'); form.addEventListener('submit', ()=>{ const input=document.getElementById(inputId); if(input){ input.value = canvas.toDataURL('image/png'); } });
}
function clearCanvas(id){ const c=document.getElementById(id); const ctx=c.getContext('2d'); ctx.clearRect(0,0,c.width,c.height); }
