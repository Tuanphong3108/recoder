// === DB Setup ===
let db;
const DB_NAME = "recorder-db";
const STORE_NAME = "recordings";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = e => {
      if (!e.target.result.objectStoreNames.contains(STORE_NAME)) {
        e.target.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = e => { db = e.target.result; resolve(); };
    req.onerror = reject;
  });
}
function saveRecording(rec) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(rec);
    tx.oncomplete = resolve;
    tx.onerror = reject;
  });
}
function getAllRecordings() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result);
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

// === Elements ===
const splash = document.getElementById("splash");
const recordBtn = document.getElementById("recordBtn");
const recordControls = document.getElementById("recordControls");
const pauseBtn = document.getElementById("pauseBtn");
const stopBtn = document.getElementById("stopBtn");
const recordTime = document.getElementById("recordTime");
const listEl = document.getElementById("recordings");

const infoModal = document.getElementById("infoModal");
const infoContent = document.getElementById("infoContent");
const closeInfo = document.getElementById("closeInfo");

// === Recording state ===
let mediaRecorder, chunks = [];
let isRecording = false;
let isPaused = false;
let startTimestamp = 0;
let elapsedBeforePause = 0;
let timerInterval;

// === Init ===
async function init() {
  await openDB();
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
    splash.classList.add("fade-out");
    setTimeout(() => splash.remove(), 600);
  } catch (err) {
    alert("Không có quyền mic: " + err);
  }
  renderList();
}
init();

// === Timer utils ===
function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min = String(Math.floor(totalSec / 60)).padStart(2, "0");
  const sec = String(totalSec % 60).padStart(2, "0");
  const dec = Math.floor((ms % 1000) / 100);
  return `${min}:${sec}.${dec}`;
}
function startTimer() {
  startTimestamp = performance.now();
  timerInterval = setInterval(() => {
    const now = performance.now();
    const elapsed = elapsedBeforePause + (now - startTimestamp);
    recordTime.textContent = formatTime(elapsed);
  }, 100);
}
function pauseTimer() {
  clearInterval(timerInterval);
  elapsedBeforePause += performance.now() - startTimestamp;
}
function resumeTimer() {
  startTimestamp = performance.now();
  timerInterval = setInterval(() => {
    const now = performance.now();
    const elapsed = elapsedBeforePause + (now - startTimestamp);
    recordTime.textContent = formatTime(elapsed);
  }, 100);
}
function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  elapsedBeforePause = 0;
  recordTime.textContent = "00:00.0";
}

// === Recording ===
recordBtn.onclick = async () => {
  if (isRecording) return;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream);
  chunks = [];

  mediaRecorder.ondataavailable = e => chunks.push(e.data);
  mediaRecorder.onstop = async () => {
    const blob = new Blob(chunks, { type: "audio/webm" });
    const id = Date.now() + "-" + Math.floor(Math.random() * 1000);
    const rec = {
      id,
      name: "Bản ghi " + new Date().toLocaleTimeString(),
      blob,
      created: new Date()
    };
    await saveRecording(rec);
    renderList();
  };

  mediaRecorder.start();
  isRecording = true;
  recordBtn.classList.add("hidden");
  recordControls.classList.remove("hidden");
  pauseBtn.textContent = "pause";
  isPaused = false;
  startTimer();
};

pauseBtn.onclick = () => {
  if (!isRecording) return;
  if (!isPaused) {
    mediaRecorder.pause();
    pauseTimer();
    pauseBtn.textContent = "play_arrow"; // resume
    isPaused = true;
  } else {
    mediaRecorder.resume();
    resumeTimer();
    pauseBtn.textContent = "pause";
    isPaused = false;
  }
};

stopBtn.onclick = () => {
  if (!isRecording) return;
  mediaRecorder.stop();
  isRecording = false;
  stopTimer();
  recordControls.classList.add("hidden");
  recordBtn.classList.remove("hidden");
};

// === Render list ===
async function renderList() {
  const recs = await getAllRecordings();
  listEl.innerHTML = "";
  recs.sort((a,b) => new Date(b.created) - new Date(a.created));
  recs.forEach(rec => {
    const card = document.createElement("div");
    card.className = "recording-card";

    const info = document.createElement("div");
    info.className = "recording-info";
    const name = document.createElement("div");
    name.className = "recording-name";
    name.textContent = rec.name;
    const meta = document.createElement("div");
    meta.className = "recording-meta";
    meta.textContent = `${new Date(rec.created).toLocaleString()}`;

    info.appendChild(name);
    info.appendChild(meta);

    const menuBtn = document.createElement("button");
    menuBtn.className = "material-symbols-rounded recording-menu";
    menuBtn.textContent = "more_vert";

    const menu = document.createElement("div");
    menu.className = "menu-card";
    menu.innerHTML = `
      <button class="info"><span class="material-symbols-rounded">info</span> Thông tin</button>
      <button class="export"><span class="material-symbols-rounded">download</span> Xuất</button>
      <button class="delete danger"><span class="material-symbols-rounded">delete</span> Xóa</button>
    `;

    card.onclick = (e) => {
      if (e.target !== menuBtn && !menu.contains(e.target)) {
        location.href = `playback.html?id=${rec.id}`;
      }
    };

    menuBtn.onclick = (e) => {
      e.stopPropagation();
      document.querySelectorAll(".menu-card").forEach(m => m.classList.remove("show"));
      menu.classList.toggle("show");
    };
    window.addEventListener("click", (e) => {
      if (!menu.contains(e.target) && e.target !== menuBtn) {
        menu.classList.remove("show");
      }
    });

    menu.querySelector(".info").onclick = async (e) => {
      e.stopPropagation();
      const r = await getRecording(rec.id);
      const sizeKB = Math.round(r.blob.size / 1024);
      infoContent.innerHTML = `
        <p><b>Tên:</b> ${r.name}</p>
        <p><b>Kích thước:</b> ${sizeKB} KB</p>
        <p><b>ID:</b> ${r.id}</p>
        <p><b>Ngày tạo:</b> ${new Date(r.created).toLocaleString()}</p>
      `;
      infoModal.classList.remove("hidden");
    };
    menu.querySelector(".export").onclick = (e) => {
      e.stopPropagation();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(rec.blob);
      a.download = rec.name.replace(/\s+/g, "_") + ".webm";
      a.click();
    };
    menu.querySelector(".delete").onclick = async (e) => {
      e.stopPropagation();
      if (confirm("Xóa bản ghi này?")) {
        await deleteRecording(rec.id);
        renderList();
      }
    };

    card.appendChild(info);
    card.appendChild(menuBtn);
    card.appendChild(menu);
    listEl.appendChild(card);
  });
}

// === Modal ===
closeInfo.onclick = () => infoModal.classList.add("hidden");

// === Ripple ===
document.addEventListener("click", (e) => {
  const btn = e.target.closest("button, .chip");
  if (!btn) return;
  const circle = document.createElement("span");
  const d = Math.max(btn.clientWidth, btn.clientHeight);
  const r = d / 2;
  circle.style.width = circle.style.height = `${d}px`;
  const rect = btn.getBoundingClientRect();
  circle.style.left = `${e.clientX - rect.left - r}px`;
  circle.style.top = `${e.clientY - rect.top - r}px`;
  circle.classList.add("ripple");
  circle.style.background = "rgba(208, 188, 255, 0.35)";
  const ripple = btn.querySelector(".ripple");
  if (ripple) ripple.remove();
  btn.appendChild(circle);
});
