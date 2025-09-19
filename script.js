// script.js (đã fix phân biệt Start/Resume – Pause – Stop)
// --- Splash ---
async function initSplash() {
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    console.warn("Mic access denied:", e);
  }
  setTimeout(() => {
    document.getElementById('splash').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
  }, 2000);
}
initSplash();

// --- IndexedDB helper ---
const DB_NAME = 'recorder-clone-db-v1';
const STORE = 'recordings';

function openDB() {
  return new Promise((res, rej) => {
    const rq = indexedDB.open(DB_NAME, 1);
    rq.onupgradeneeded = () => {
      const db = rq.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}
async function saveRecording(record) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => res(true);
    tx.onerror = () => rej(tx.error);
  });
}
async function deleteRecording(id) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => res(true);
    tx.onerror = () => rej(tx.error);
  });
}
async function getAllRecordings() {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => res(req.result.sort((a,b)=>b.created - a.created));
    req.onerror = () => rej(req.error);
  });
}

// --- DOM refs ---
const micList = document.getElementById('micList');
const btnMic = document.getElementById('btnMic');
const btnRecord = document.getElementById('btnRecord');
const btnPause = document.getElementById('btnPause');
const btnStop = document.getElementById('btnStop');
const btnClear = document.getElementById('btnClear');
const statusText = document.getElementById('statusText');
const timerEl = document.getElementById('timer');
const recordingsList = document.getElementById('recordingsList');
const modal = document.getElementById('modal');
const modalContent = document.getElementById('modalContent');
const modalDownload = document.getElementById('modalDownload');
const modalDelete = document.getElementById('modalDelete');
const modalClose = document.getElementById('modalClose');
const settings = document.getElementById('settings');
const btnSettings = document.getElementById('btnSettings');
const settingsClose = document.getElementById('settingsClose');
const autoSaveCheckbox = document.getElementById('autoSave');
const waveCanvas = document.getElementById('waveCanvas');
const canvasCtx = waveCanvas.getContext('2d');

// --- state ---
let audioCtx, analyser, dataArray, sourceNode;
let mediaRecorder = null;
let currentStream = null;
let chunks = [];
let startTS = 0;
let accumulated = 0;
let tickRAF = null;

// --- utilities ---
function fmtTime(s){
  if(!s) return '00:00.0';
  const mm = Math.floor(s/60).toString().padStart(2,'0');
  const ss = Math.floor(s%60).toString().padStart(2,'0');
  const d = Math.floor((s - Math.floor(s)) * 10);
  return `${mm}:${ss}.${d}`;
}
function formatBytes(bytes){
  if(!bytes) return '0 B';
  const units = ['B','KB','MB','GB'];
  let i=0;
  while(bytes >= 1024 && i<units.length-1){ bytes/=1024; i++; }
  return bytes.toFixed(1) + ' ' + units[i];
}

// --- device handling ---
async function refreshMics(){
  try{
    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter(d => d.kind === 'audioinput');
    micList.innerHTML = '';
    if(mics.length === 0){
      const opt = document.createElement('option'); opt.textContent = 'Không có mic'; micList.appendChild(opt);
      return;
    }
    mics.forEach(m=>{
      const o = document.createElement('option');
      o.value = m.deviceId;
      o.textContent = m.label || `Mic ${micList.length+1}`;
      micList.appendChild(o);
    });
  }catch(e){
    console.warn('refreshMics', e);
  }
}
navigator.mediaDevices?.addEventListener?.('devicechange', refreshMics);

// --- visualizer ---
function resizeCanvas(){
  const dpr = window.devicePixelRatio || 1;
  waveCanvas.width = waveCanvas.clientWidth * dpr;
  waveCanvas.height = waveCanvas.clientHeight * dpr;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function drawWave(){
  if(!analyser){ canvasCtx.clearRect(0,0,waveCanvas.width, waveCanvas.height); return; }
  analyser.getByteTimeDomainData(dataArray);
  canvasCtx.clearRect(0,0,waveCanvas.width,waveCanvas.height);
  canvasCtx.lineWidth = 2;
  canvasCtx.strokeStyle = 'rgba(255,255,255,0.85)';
  canvasCtx.beginPath();
  const slice = waveCanvas.width / dataArray.length;
  let x = 0;
  for(let i=0;i<dataArray.length;i++){
    const v = dataArray[i] / 128.0;
    const y = v * (waveCanvas.height/2);
    if(i===0) canvasCtx.moveTo(x,y); else canvasCtx.lineTo(x,y);
    x += slice;
  }
  canvasCtx.stroke();
  tickRAF = requestAnimationFrame(drawWave);
}

// --- recording control ---
async function startRecording(){
  try{
    const deviceId = micList.value && micList.value !== 'undefined' ? micList.value : undefined;
    const constraints = deviceId ? { audio: { deviceId: { exact: deviceId } } } : { audio: true };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    currentStream = stream;

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    sourceNode = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    dataArray = new Uint8Array(analyser.fftSize);
    sourceNode.connect(analyser);

    drawWave();

    chunks = [];
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
    mediaRecorder.ondataavailable = e => { if(e.data && e.data.size>0) chunks.push(e.data); };
    mediaRecorder.onstart = () => {
      startTS = performance.now();
      accumulated = 0;
      statusText.textContent = 'Đang ghi...';
      btnPause.disabled = false;
      btnStop.disabled = false;
      btnRecord.classList.add('recording');
      tickTimer();
    };
    mediaRecorder.onpause = () => {
      accumulated += (performance.now() - startTS)/1000;
      statusText.textContent = 'Tạm dừng';
    };
    mediaRecorder.onresume = () => {
      startTS = performance.now();
      statusText.textContent = 'Đang ghi...';
    };
    mediaRecorder.onstop = async () => {
      cancelAnimationFrame(tickRAF);
      try{ audioCtx && audioCtx.close(); }catch(e){}
      statusText.textContent = 'Đã dừng';
      btnPause.disabled = true;
      btnStop.disabled = true;
      btnRecord.classList.remove('recording');
      const blob = new Blob(chunks, { type: chunks[0]?.type || 'audio/webm' });
      const duration = accumulated + ((performance.now() - startTS)/1000);
      const meta = {
        id: 'r_' + Date.now(),
        name: `Recording ${new Date().toLocaleString()}`,
        created: Date.now(),
        duration,
        size: blob.size,
        mime: blob.type,
        blob
      };
      if(autoSaveCheckbox.checked){
        await saveRecording(meta);
        refreshList();
      }
      try{ currentStream.getTracks().forEach(t=>t.stop()); }catch(e){}
    };

    mediaRecorder.start();
  }catch(err){
    console.error('startRecording', err);
    alert('Không thể truy cập micro: ' + (err.message||err));
  }
}
function pauseRecording(){
  if(mediaRecorder && mediaRecorder.state === 'recording'){
    mediaRecorder.pause();
  }
}
function resumeRecording(){
  if(mediaRecorder && mediaRecorder.state === 'paused'){
    mediaRecorder.resume();
  }
}
function stopRecording(){
  if(mediaRecorder && (mediaRecorder.state==='recording' || mediaRecorder.state==='paused')){
    mediaRecorder.stop();
  }
}
function tickTimer(){
  function tick(){
    if(!mediaRecorder) return;
    if(mediaRecorder.state === 'recording'){
      const dur = accumulated + ((performance.now() - startTS)/1000);
      timerEl.textContent = fmtTime(dur);
    } else if(mediaRecorder.state === 'paused'){
      timerEl.textContent = fmtTime(accumulated);
    }
    requestAnimationFrame(tick);
  }
  tick();
}

// --- list & modal (y như gốc) ---
async function refreshList(){
  recordingsList.innerHTML = '';
  const recs = await getAllRecordings();
  if(recs.length === 0){ recordingsList.innerHTML = '<div class="muted">Chưa có bản ghi nào</div>'; return; }
  recs.forEach(rec => {
    const el = document.createElement('div');
    el.className = 'record-item';
    const left = document.createElement('div'); left.className = 'rec-left';
    const name = document.createElement('div'); name.className = 'rec-name'; name.textContent = rec.name;
    const meta = document.createElement('div'); meta.className = 'rec-meta'; meta.textContent = `${new Date(rec.created).toLocaleString()} • ${fmtTime(rec.duration||0)} • ${formatBytes(rec.size)}`;
    left.appendChild(name); left.appendChild(meta);
    const actions = document.createElement('div'); actions.className = 'rec-actions';
    const btnPlay = document.createElement('button'); btnPlay.textContent = '▶'; btnPlay.onclick = () => { new Audio(URL.createObjectURL(rec.blob)).play(); };
    const btnExport = document.createElement('button'); btnExport.textContent = '⬇'; btnExport.onclick = () => { const a=document.createElement('a'); a.href=URL.createObjectURL(rec.blob); a.download=`${rec.name.replace(/[^a-z0-9\\-_\\.]/ig,'_')}.webm`; a.click(); };
    const btnInfo = document.createElement('button'); btnInfo.textContent = 'ℹ️'; btnInfo.onclick = () => openModal(rec);
    actions.append(btnPlay, btnExport, btnInfo);
    el.append(left, actions);
    recordingsList.appendChild(el);
  });
}
let modalRec = null;
function openModal(rec){
  modalRec = rec;
  modalContent.innerHTML = `
    <div><strong>Tên:</strong> ${rec.name}</div>
    <div><strong>Ngày tạo:</strong> ${new Date(rec.created).toLocaleString()}</div>
    <div><strong>Thời lượng:</strong> ${fmtTime(rec.duration||0)}</div>
    <div><strong>Kích thước:</strong> ${formatBytes(rec.size)}</div>
  `;
  modal.classList.remove('hidden');
  modalDownload.onclick = () => { const a=document.createElement('a'); a.href=URL.createObjectURL(rec.blob); a.download=`${rec.name.replace(/[^a-z0-9\\-_\\.]/ig,'_')}.webm`; a.click(); };
  modalDelete.onclick = async () => { if(!confirm('Xác nhận xóa?')) return; await deleteRecording(rec.id); modal.classList.add('hidden'); refreshList(); };
}
modalClose.onclick = () => modal.classList.add('hidden');

// --- settings ---
btnSettings.onclick = () => settings.classList.remove('hidden');
settingsClose.onclick = () => settings.classList.add('hidden');

// --- buttons (FIXED) ---
btnRecord.onclick = async () => {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') {
    await startRecording();
  } else if (mediaRecorder.state === 'paused') {
    resumeRecording();
  }
};
btnPause.onclick = () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    pauseRecording();
  }
};
btnStop.onclick = () => {
  stopRecording();
};
btnMic.onclick = () => micList.focus();
btnClear.onclick = async () => {
  if(!confirm('Xóa tất cả bản ghi?')) return;
  const recs = await getAllRecordings();
  for(const r of recs) await deleteRecording(r.id);
  refreshList();
};

// --- init ---
(async function init(){
  if(!navigator.mediaDevices){ alert('Trình duyệt không hỗ trợ MediaDevices API'); return; }
  await refreshMics();
  await refreshList();
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('service-worker.js').catch(()=>{});
  }
})();

// tạo id unique
function generateId() {
  return Date.now().toString() + "-" + Math.floor(Math.random() * 1000).toString().padStart(4, '0');
}

// danh sách recordings
let recordings = JSON.parse(localStorage.getItem("recordings") || "[]");

function saveRecording(blob) {
  const id = generateId();
  const name = "Audio recording " + new Date().toLocaleString();
  const rec = { id, name };

  // tạo URL blob để phát
  rec.blobUrl = URL.createObjectURL(blob);

  recordings.push(rec);
  localStorage.setItem("recordings", JSON.stringify(recordings));

  renderRecordings();
}

function renderRecordings() {
  const list = document.getElementById("recordingsList");
  list.innerHTML = "";
  recordings.forEach(rec => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span>${rec.name}</span>
      <a href="playback.html?id=${rec.id}">▶</a>
    `;
    list.appendChild(li);
  });
}

// render lại list khi load
renderRecordings();

