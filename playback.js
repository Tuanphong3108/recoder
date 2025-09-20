let db;
const DB_NAME = "recorder-db";
const STORE_NAME = "recordings";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onsuccess = e => { db = e.target.result; resolve(); };
    req.onerror = reject;
  });
}
function getRecording(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = reject;
  });
}
function deleteRecording(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = reject;
  });
}

// Elements
const audio = new Audio();
const playBtn = document.getElementById("btnPlay");
const backBtn = document.getElementById("btnBack");
const forwardBtn = document.getElementById("btnForward");
const seek = document.getElementById("seek");
const volume = document.getElementById("volume");
const speedBtn = document.getElementById("speed");
const timeEl = document.getElementById("playbackTime");
const recNameEl = document.getElementById("recName");
const menuBtn = document.getElementById("menuBtn");
const menu = document.getElementById("menu");
const infoBtn = document.getElementById("infoBtn");
const exportBtn = document.getElementById("exportBtn");
const deleteBtn = document.getElementById("deleteBtn");
const infoModal = document.getElementById("infoModal");
const infoContent = document.getElementById("infoContent");
const closeInfo = document.getElementById("closeInfo");
const canvas = document.getElementById("waveform");
const ctx = canvas.getContext("2d");

let rec, recId, blobUrl;

// URL param
const params = new URLSearchParams(location.search);
recId = params.get("id");

// Menu toggle
menuBtn.onclick = () => menu.classList.toggle("hidden");
window.onclick = (e) => {
  if (e.target !== menuBtn && !menu.contains(e.target)) {
    menu.classList.add("hidden");
  }
};

// Init
async function init() {
  await openDB();
  rec = await getRecording(recId);
  if (!rec) {
    alert("Không tìm thấy bản ghi!");
    location.href = "index.html";
    return;
  }
  recNameEl.textContent = rec.name;

  const blob = rec.blob;
  blobUrl = URL.createObjectURL(blob);
  audio.src = blobUrl;

  // Auto play
  audio.play();

  // update seek & time
  audio.onloadedmetadata = () => {
    seek.max = audio.duration;
    updateTime();
  };
  audio.ontimeupdate = () => {
    seek.value = audio.currentTime;
    updateTime();
    drawWaveform();
  };
}
init();

// Controls
playBtn.onclick = () => {
  if (audio.paused) {
    audio.play();
    playBtn.textContent = "⏸";
  } else {
    audio.pause();
    playBtn.textContent = "▶";
  }
};
backBtn.onclick = () => audio.currentTime = Math.max(0, audio.currentTime - 5);
forwardBtn.onclick = () => audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
seek.oninput = () => audio.currentTime = seek.value;
volume.oninput = () => audio.volume = volume.value;
speedBtn.onclick = () => {
  const speeds = [1, 1.25, 1.5, 2];
  let idx = speeds.indexOf(audio.playbackRate);
  audio.playbackRate = speeds[(idx + 1) % speeds.length];
  speedBtn.textContent = audio.playbackRate + "x";
};

// Time format
function updateTime() {
  const cur = formatTime(audio.currentTime);
  const total = formatTime(audio.duration);
  timeEl.textContent = `${cur} / ${total}`;
}
function formatTime(sec) {
  if (isNaN(sec)) return "00:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// Waveform
function drawWaveform() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#d0bcff";
  ctx.beginPath();
  const mid = canvas.height / 2;
  const len = 100;
  const step = canvas.width / len;
  for (let i = 0; i < len; i++) {
    const h = Math.sin((audio.currentTime + i / 10)) * 20;
    ctx.moveTo(i * step, mid - h);
    ctx.lineTo(i * step, mid + h);
  }
  ctx.stroke();
}

// Menu actions
infoBtn.onclick = () => {
  const sizeKB = Math.round(rec.blob.size / 1024);
  const dur = formatTime(audio.duration);
  infoContent.innerHTML = `
    <p><b>Tên:</b> ${rec.name}</p>
    <p><b>Thời lượng:</b> ${dur}</p>
    <p><b>Kích thước:</b> ${sizeKB} KB</p>
    <p><b>ID:</b> ${rec.id}</p>
  `;
  infoModal.classList.remove("hidden");
};
closeInfo.onclick = () => infoModal.classList.add("hidden");

exportBtn.onclick = () => {
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = rec.name.replace(/\s+/g, "_") + ".webm";
  a.click();
};

deleteBtn.onclick = async () => {
  if (confirm("Xóa bản ghi này?")) {
    await deleteRecording(rec.id);
    location.href = "index.html";
  }
};
