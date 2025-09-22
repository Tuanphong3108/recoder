/* playback.js - Pro version:
   - loads blob from IndexedDB by id param
   - sets up Audio element + AudioContext + AnalyserNode
   - draws real waveform (time domain) onto canvas while audio plays
   - UI: play/pause, seek, volume, speed, menu, info modal, export, delete
   - ripple effect on buttons
*/

let db;
const DB_NAME = "recorder-db";
const STORE_NAME = "recordings";

function openDB(){
  return new Promise((resolve,reject)=>{
    const r = indexedDB.open(DB_NAME,1);
    r.onupgradeneeded = ()=>{}; // assume store exists
    r.onsuccess = e => { db = e.target.result; resolve(); };
    r.onerror = reject;
  });
}
function getRecording(id){
  return new Promise((resolve,reject)=>{
    const tx = db.transaction(STORE_NAME,'readonly');
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = ()=>resolve(req.result);
    req.onerror = reject;
  });
}
function deleteRecording(id){
  return new Promise((resolve,reject)=>{
    const tx = db.transaction(STORE_NAME,'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = reject;
  });
}

/* DOM */
const canvas = document.getElementById('waveform');
const ctx = canvas.getContext('2d');
const playBtn = document.getElementById('btnPlay');
const backBtn = document.getElementById('btnBack');
const forwardBtn = document.getElementById('btnForward');
const seek = document.getElementById('seek');
const volume = document.getElementById('volume');
const volIcon = document.getElementById('volIcon');
const speedBtn = document.getElementById('speed');
const timeEl = document.getElementById('playbackTime');

const menuBtn = document.getElementById('menuBtn');
const menu = document.getElementById('menu');
const infoBtn = document.getElementById('infoBtn');
const exportBtn = document.getElementById('exportBtn');
const deleteBtn = document.getElementById('deleteBtn');
const infoModal = document.getElementById('infoModal');
const infoContent = document.getElementById('infoContent');
const closeInfo = document.getElementById('closeInfo');

/* audio + audio context */
const audio = new Audio();
let audioCtx, sourceNode, analyser;
let rafId = null;
let dataArray, bufferLength;

/* URL param id */
const params = new URLSearchParams(location.search);
const recId = params.get('id');

/* helpers */
function formatTime(t){
  if (!isFinite(t)) return '00:00';
  const m = Math.floor(t/60).toString().padStart(2,'0');
  const s = Math.floor(t%60).toString().padStart(2,'0');
  return `${m}:${s}`;
}

/* canvas sizing */
function resizeCanvas(){
  const ratio = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.floor(w * ratio);
  canvas.height = Math.floor(h * ratio);
  ctx.scale(ratio, ratio);
}
window.addEventListener('resize', () => { cancelAnimationFrame(rafId); resizeCanvas(); drawPlaceholder(); });

/* draw placeholder waveform (when nothing playing) */
function drawPlaceholder(){
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  ctx.clearRect(0,0,w,h);
  // subtle dotted waveform style
  ctx.fillStyle = 'rgba(208,188,255,0.06)';
  const bars = 24;
  const gap = w / bars;
  for(let i=0;i<bars;i++){
    const hh = 6 + Math.abs(Math.sin(i))*28;
    const x = i*gap + gap*0.12;
    const y = (h - hh)/2;
    roundRectFill(ctx, x, y, gap*0.76, hh, 6);
  }
}
function roundRectFill(c,x,y,w,h,r){ c.beginPath(); c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r); c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.fill(); }

/* draw realtime waveform using analyser (time domain) */
function drawWave(){
  if (!analyser) return;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const data = dataArray;
  analyser.getByteTimeDomainData(data);

  ctx.clearRect(0,0,w,h);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(208,188,255,0.95)';

  ctx.beginPath();
  const sliceWidth = w / bufferLength;
  let x = 0;
  for(let i=0;i<bufferLength;i++){
    const v = data[i] / 128.0; // 0..2
    const y = (v * h) / 2;
    if(i===0) ctx.moveTo(x,y);
    else ctx.lineTo(x,y);
    x += sliceWidth;
  }
  ctx.lineTo(w,h/2);
  ctx.stroke();

  // small center line
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.moveTo(0, h/2);
  ctx.lineTo(w, h/2);
  ctx.stroke();

  rafId = requestAnimationFrame(drawWave);
}

/* stop drawing */
function stopDraw(){
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
}

/* setup audio context/analyser when audio loaded */
function setupAnalyser(){
  try{
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // if a previous source exists, disconnect
    if (sourceNode) {
      try{ sourceNode.disconnect(); }catch(e){}
    }
    sourceNode = audioCtx.createMediaElementSource(audio);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    bufferLength = analyser.fftSize;
    dataArray = new Uint8Array(bufferLength);
    sourceNode.connect(analyser);
    analyser.connect(audioCtx.destination);
  }catch(err){
    console.warn('AudioContext error', err);
  }
}

/* UI wiring */
async function init(){
  if (!recId) {
    alert('Không có ID bản ghi');
    location.href = 'index.html';
    return;
  }

  await openDB();
  const rec = await getRecording(recId);
  if (!rec) {
    alert('Không tìm thấy bản ghi'); location.href='index.html'; return;
  }

  // set page title & create blob url
  document.title = rec.name + ' - Recorder';
  const blobUrl = URL.createObjectURL(rec.blob);
  audio.src = blobUrl;

  // canvas size & placeholder
  resizeCanvas();
  drawPlaceholder();

  // autoplay attempt
  try{
    await audio.play();
    // audio has started; set up analyser after first play
  }catch(e){
    // autoplay blocked — update play button icon to play_arrow (user must click)
    playBtn.textContent = 'play_arrow';
    console.info('Autoplay blocked, waiting user play');
  }

  audio.onplay = () => {
    // resume or create audio context
    if (!audioCtx || audioCtx.state === 'closed') setupAnalyser();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    playBtn.textContent = 'pause';
    // start drawing
    if (analyser) {
      bufferLength = analyser.fftSize;
      dataArray = new Uint8Array(bufferLength);
      stopDraw();
      drawWave();
    }
  };

  audio.onpause = () => {
    playBtn.textContent = 'play_arrow';
    stopDraw();
  };

  audio.onended = () => {
    playBtn.textContent = 'play_arrow';
    stopDraw();
    // optional: reset seek to end
  };

  audio.onloadedmetadata = () => {
    seek.max = audio.duration;
    updateTime();
  };

  audio.ontimeupdate = () => {
    seek.value = audio.currentTime;
    updateTime();
  };

  // buttons
  playBtn.addEventListener('click', async (e)=>{
    e.stopPropagation();
    if (audio.paused){
      try{
        // resume context if suspended
        if (audioCtx && audioCtx.state === 'suspended') await audioCtx.resume();
        await audio.play();
      }catch(err){
        console.warn('Play failed', err);
      }
    } else {
      audio.pause();
    }
  });

  backBtn.addEventListener('click', (e)=>{
    e.stopPropagation();
    audio.currentTime = Math.max(0, audio.currentTime - 5);
  });
  forwardBtn.addEventListener('click', (e)=>{
    e.stopPropagation();
    audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
  });

  seek.addEventListener('input', (e)=> {
    audio.currentTime = parseFloat(e.target.value);
  });

  volume.addEventListener('input', (e)=>{
    audio.volume = parseFloat(e.target.value);
    updateVolIcon(parseFloat(e.target.value));
  });

  function updateVolIcon(v){
    if (v === 0) volIcon.textContent = 'volume_off';
    else if (v < 0.5) volIcon.textContent = 'volume_down';
    else volIcon.textContent = 'volume_up';
  }

  // speed cycle
  speedBtn.addEventListener('click', (e)=>{
    e.stopPropagation();
    const speeds = [1, 1.25, 1.5, 2];
    const idx = speeds.indexOf(audio.playbackRate);
    audio.playbackRate = speeds[(idx + 1) % speeds.length];
    speedBtn.textContent = audio.playbackRate + 'x';
  });

  // menu toggle
  menuBtn.addEventListener('click', (e)=>{
    e.stopPropagation();
    menu.classList.toggle('show');
  });
  window.addEventListener('click', (e)=>{
    if (!menu.contains(e.target) && e.target !== menuBtn) menu.classList.remove('show');
  });

  // info/export/delete actions
  infoBtn.addEventListener('click', (e)=>{ e.stopPropagation(); showInfo(rec); menu.classList.remove('show'); });
  exportBtn.addEventListener('click', (e)=>{ e.stopPropagation(); downloadBlob(rec.blob, rec.name); menu.classList.remove('show'); });
  deleteBtn.addEventListener('click', async (e)=>{ e.stopPropagation(); if (confirm('Xóa bản ghi này?')) { await deleteRecording(rec.id); location.href = 'index.html'; } });

  closeInfo.addEventListener('click', ()=>{ infoModal.classList.add('hidden'); });

  // ripple for all clickable buttons/menu items
  document.querySelectorAll('button, .chip').forEach(btn=>{
    btn.addEventListener('click', function(ev){
      const circle = document.createElement('span');
      const d = Math.max(this.clientWidth, this.clientHeight);
      const r = d/2;
      circle.style.width = circle.style.height = `${d}px`;
      const rect = this.getBoundingClientRect();
      circle.style.left = `${ev.clientX - rect.left - r}px`;
      circle.style.top = `${ev.clientY - rect.top - r}px`;
      circle.className = 'ripple';
      this.appendChild(circle);
      setTimeout(()=> circle.remove(), 700);
    });
  });

  // helper functions
  function showInfo(r){
    const sizeKB = Math.round(r.blob.size / 1024);
    infoContent.innerHTML = `
      <p><strong>Tên:</strong> ${r.name}</p>
      <p><strong>Thời lượng:</strong> ${isFinite(audio.duration)? formatTime(audio.duration): '—'}</p>
      <p><strong>Kích thước:</strong> ${sizeKB} KB</p>
      <p><strong>ID:</strong> ${r.id}</p>
    `;
    infoModal.classList.remove('hidden');
  }
  function downloadBlob(blob, name){
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name.replace(/\s+/g,'_') + '.webm';
    a.click();
    setTimeout(()=> URL.revokeObjectURL(a.href), 60000);
  }
}

/* update time display */
function updateTime(){
  const cur = formatTime(audio.currentTime || 0);
  const total = formatTime(isFinite(audio.duration)? audio.duration : 0);
  timeEl.textContent = `${cur} / ${total}`;
}

/* init flow */
(async ()=> {
  try{
    await openDB();
    await init();
  }catch(err){
    console.error('Init error', err);
    alert('Lỗi khi khởi tạo playback: ' + err);
  }
})();
