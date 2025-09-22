let db;
const DB_NAME = "recorder-db";
const STORE_NAME = "recordings";

// ========== IndexedDB ==========
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onsuccess = e => {
      db = e.target.result;
      resolve();
    };
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

// ========== Elements ==========
const audio = new Audio();

const playBtn = document.getElementById("btnPlay");
const backBtn = document.getElementById("btnBack");
const forwardBtn = document.getElementById("btnForward");

const seek = document.getElementById("seek");
const volume = document.getElementById("volume");
const volIcon = document.getElementById("volIcon");
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

// ========== Get URL param ==========
const params = new URLSearchParams(location.search);
recId = params.get("id");

// ========== Init ==========
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

  // auto play khi mở
  audio.play();
  playBtn.textContent = "pause";

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

// ========== Controls ==========
// ... giữ nguyên phần trên như bản full trước đó ...

// Controls
playBtn.onclick = () => {
  if (audio.paused) {
    audio.play();
    playBtn.textContent = "pause"; // Material icon
  } else {
    audio.pause();
    playBtn.textContent = "play_arrow"; // Material icon
  }
};


backBtn.onclick = () =>
  (audio.currentTime = Math.max(0, audio.currentTime - 5));

forwardBtn.onclick = () =>
  (audio.currentTime = Math.min(audio.duration, audio.currentTime + 5));

seek.oninput = () => (audio.currentTime = seek.value);

// Volume
volume.oninput = () => {
  audio.volume = volume.value;
  if (volume.value == 0) volIcon.textContent = "volume_off";
  else if (volume.value < 0.5) volIcon.textContent = "volume_down";
  else volIcon.textContent = "volume_up";
};

// Speed
speedBtn.onclick = () => {
  const speeds = [1, 1.25, 1.5, 2];
  let idx = speeds.indexOf(audio.playbackRate);
  audio.playbackRate = speeds[(idx + 1) % speeds.length];
  speedBtn.textContent = audio.playbackRate + "x";
};

// ========== Time ==========
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

// ========== Waveform ==========
function drawWaveform() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#d0bcff";
  ctx.beginPath();
  const mid = canvas.height / 2;
  const len = 100;
  const step = canvas.width / len;
  for (let i = 0; i < len; i++) {
    const h = Math.sin(audio.currentTime + i / 10) * 20;
    ctx.moveTo(i * step, mid - h);
    ctx.lineTo(i * step, mid + h);
  }
  ctx.stroke();
}

// ========== Menu ==========
menuBtn.onclick = () => {
  menu.classList.toggle("show");
};

window.onclick = (e) => {
  if (!menu.contains(e.target) && e.target !== menuBtn) {
    menu.classList.remove("show");
  }
};

// ========== Menu Actions ==========
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

// ========== Ripple effect ==========
document.querySelectorAll("button, .chip").forEach(btn => {
  btn.addEventListener("click", function (e) {
    const circle = document.createElement("span");
    const diameter = Math.max(this.clientWidth, this.clientHeight);
    const radius = diameter / 2;

    circle.style.width = circle.style.height = `${diameter}px`;
    circle.style.left = `${e.clientX - this.getBoundingClientRect().left - radius}px`;
    circle.style.top = `${e.clientY - this.getBoundingClientRect().top - radius}px`;
    circle.classList.add("ripple");

    // custom color accent
    circle.style.background = "rgba(208, 188, 255, 0.35)";

    const ripple = this.querySelector(".ripple");
    if (ripple) ripple.remove();

    this.appendChild(circle);
  });
});
