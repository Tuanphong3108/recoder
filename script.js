// ================== Splash Screen ==================
async function initSplash() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());

    document.getElementById("splash").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
  } catch (e) {
    console.warn("Mic access denied:", e);
    alert("Ứng dụng cần quyền microphone để ghi âm!");
    document.getElementById("splash").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
  }
}

window.onload = () => {
  initSplash();
  init(); // khởi tạo DB sau khi DOM ready
};

// ================== IndexedDB ==================
let db;
const DB_NAME = "recorder-db";
const STORE_NAME = "recordings";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      db.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    req.onsuccess = e => { db = e.target.result; resolve(); };
    req.onerror = reject;
  });
}
function saveRecording(recording) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(recording);
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

// Elements
const recordBtn = document.getElementById("recordBtn");
const recordingsList = document.getElementById("recordings");
const splash = document.getElementById("splash");

let mediaRecorder, chunks = [], isRecording = false;

async function init() {
  await openDB();
  renderList();

  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
    splash.classList.add("fade-out");
    setTimeout(() => splash.remove(), 2000);
  } catch {
    alert("Không có quyền truy cập mic!");
  }
}
init();

// Record button
recordBtn.onclick = async () => {
  if (!isRecording) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    chunks = [];
    mediaRecorder.ondataavailable = e => chunks.push(e.data);
    mediaRecorder.onstop = async () => {
      const blob = new Blob(chunks, { type: "audio/webm" });
      const id = Date.now() + "-" + Math.floor(Math.random() * 1000);
      const rec = { id, name: `Bản ghi ${new Date().toLocaleString()}`, blob };
      await saveRecording(rec);
      renderList();
    };
    mediaRecorder.start();
    isRecording = true;
    recordBtn.textContent = "pause"; // Material icon
  } else if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.pause();
    recordBtn.textContent = "pause"; // vẫn pause icon
  } else if (mediaRecorder && mediaRecorder.state === "paused") {
    mediaRecorder.resume();
    recordBtn.textContent = "pause";
  }
};

// Stop button
document.getElementById("stopBtn").onclick = () => {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    isRecording = false;
    recordBtn.textContent = "mic";
  }
};

// Render recordings
async function renderList() {
  const list = await getAllRecordings();
  recordingsList.innerHTML = "";
  list.forEach(rec => {
    const item = document.createElement("div");
    item.className = "recording-card";

    const name = document.createElement("span");
    name.textContent = rec.name;

    const play = document.createElement("a");
    play.href = `playback.html?id=${rec.id}`;
    play.className = "material-symbols-rounded";
    play.textContent = "play_arrow";

    item.appendChild(name);
    item.appendChild(play);
    recordingsList.appendChild(item);
  });
}

// Ripple
document.querySelectorAll("button, .chip").forEach(btn => {
  btn.addEventListener("click", function (e) {
    const circle = document.createElement("span");
    const diameter = Math.max(this.clientWidth, this.clientHeight);
    const radius = diameter / 2;
    circle.style.width = circle.style.height = `${diameter}px`;
    circle.style.left = `${e.clientX - this.getBoundingClientRect().left - radius}px`;
    circle.style.top = `${e.clientY - this.getBoundingClientRect().top - radius}px`;
    circle.classList.add("ripple");
    circle.style.background = "rgba(208, 188, 255, 0.35)";
    const ripple = this.querySelector(".ripple");
    if (ripple) ripple.remove();
    this.appendChild(circle);
  });
});
