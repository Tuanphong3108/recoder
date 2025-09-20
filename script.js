// ================== Splash Screen ==================
async function initSplash() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // tắt stream ngay sau khi test quyền
    stream.getTracks().forEach(track => track.stop());

    // Ẩn splash, show app
    document.getElementById("splash").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
  } catch (e) {
    console.warn("Mic access denied:", e);
    alert("Ứng dụng cần quyền microphone để ghi âm!");
    document.getElementById("splash").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
  }
}

initSplash();

// ================== IndexedDB ==================
let db;
const DB_NAME = "recorder-db";
const STORE_NAME = "recordings";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = (e) => { db = e.target.result; resolve(); };
    req.onerror = (e) => reject(e);
  });
}

function saveRecording(id, name, blob) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put({ id, name, blob });
    tx.oncomplete = resolve;
    tx.onerror = reject;
  });
}

function getAllRecordings() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
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

// ================== Recorder ==================
let mediaRecorder, chunks = [];
let timerInterval, startTime;

const btnRecord = document.getElementById("btnRecord");
const btnPause = document.getElementById("btnPause");
const btnStop = document.getElementById("btnStop");
const recordingsList = document.getElementById("recordingsList");
const timerEl = document.getElementById("timer");

btnRecord.onclick = async () => {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    // đang ghi → stop
    mediaRecorder.stop();
    btnRecord.textContent = "⏺";
    btnPause.disabled = true;
    btnStop.disabled = true;
    clearInterval(timerInterval);
    timerEl.textContent = "00:00.0";
  } else {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);

      mediaRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        chunks = [];
        const id = Date.now().toString() + "-" + Math.floor(Math.random() * 1000).toString().padStart(4,"0");
        const name = "Bản ghi lúc " + new Date().toLocaleString();
        await saveRecording(id, name, blob);
        refreshList();
        clearInterval(timerInterval);
        timerEl.textContent = "00:00.0";
      };

      mediaRecorder.start();
      btnRecord.textContent = "⏹";
      btnPause.disabled = false;
      btnStop.disabled = false;

      // start timer
      startTime = Date.now();
      timerInterval = setInterval(() => {
        const diff = Date.now() - startTime;
        const secs = diff / 1000;
        const m = String(Math.floor(secs / 60)).padStart(2, "0");
        const s = (secs % 60).toFixed(1).padStart(4, "0");
        timerEl.textContent = `${m}:${s}`;
      }, 100);

    } catch (err) {
      alert("Không thể truy cập microphone: " + err);
    }
  }
};

btnPause.onclick = () => {
  if (!mediaRecorder) return;
  if (mediaRecorder.state === "recording") {
    mediaRecorder.pause();
    btnPause.textContent = "▶";
  } else if (mediaRecorder.state === "paused") {
    mediaRecorder.resume();
    btnPause.textContent = "⏸";
  }
};

btnStop.onclick = () => {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
};

// ================== Render list ==================
async function refreshList() {
  const recs = await getAllRecordings();
  recordingsList.innerHTML = "";
  recs.forEach(rec => {
    const div = document.createElement("div");
    div.className = "rec-item";
    div.innerHTML = `
      <span>${rec.name}</span>
      <a href="playback.html?id=${rec.id}" class="play-link">▶</a>
      <button class="delete-btn">🗑</button>
    `;
    div.querySelector(".delete-btn").onclick = async () => {
      await deleteRecording(rec.id);
      refreshList();
    };
    recordingsList.appendChild(div);
  });
}

// ================== Init ==================
async function init() {
  await openDB();
  refreshList();
}
init();
