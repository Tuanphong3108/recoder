// ================== IndexedDB helpers ==================
const DB_NAME = "recorder-db";
const STORE_NAME = "recordings";
let db;

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

function getRecording(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = reject;
  });
}

// ================== Playback UI ==================
async function initPlayback() {
  await openDB();
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");

  const rec = await getRecording(id);
  if (!rec) {
    document.body.innerHTML = "<h1>Không tìm thấy bản ghi</h1>";
    return;
  }

  document.getElementById("playbackTitle").textContent = rec.name;

  const blobUrl = URL.createObjectURL(rec.blob);
  const audio = new Audio(blobUrl);

  const canvas = document.getElementById("playbackWave");
  const ctx = canvas.getContext("2d");
  const seekbar = document.getElementById("seekbar");
  const time = document.getElementById("playbackTime");

  const playPauseBtn = document.getElementById("playPauseBtn");
  const rewindBtn = document.getElementById("rewindBtn");
  const forwardBtn = document.getElementById("forwardBtn");
  const volume = document.getElementById("volume");
  const speedBtn = document.getElementById("speedBtn");

  // audio context + waveform
  const audioCtx = new AudioContext();
  const srcNode = audioCtx.createMediaElementSource(audio);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  const dataArr = new Uint8Array(analyser.fftSize);

  srcNode.connect(analyser);
  analyser.connect(audioCtx.destination);

  function fmtTime(sec) {
    sec = Math.floor(sec);
    return String(Math.floor(sec / 60)).padStart(2, "0") + ":" + String(sec % 60).padStart(2, "0");
  }

  audio.ontimeupdate = () => {
    if (!isNaN(audio.duration)) {
      seekbar.value = (audio.currentTime / audio.duration) * 100 || 0;
      time.textContent = `${fmtTime(audio.currentTime)} / ${fmtTime(audio.duration)}`;
    }
  };

  seekbar.oninput = () => {
    if (!isNaN(audio.duration)) {
      audio.currentTime = (seekbar.value / 100) * audio.duration;
    }
  };

  playPauseBtn.onclick = () => {
    if (audio.paused) {
      audio.play();
      audioCtx.resume();
      playPauseBtn.textContent = "⏸";
    } else {
      audio.pause();
      playPauseBtn.textContent = "▶";
    }
  };

  rewindBtn.onclick = () => { audio.currentTime = Math.max(0, audio.currentTime - 5); };
  forwardBtn.onclick = () => { audio.currentTime = Math.min(audio.duration, audio.currentTime + 5); };

  volume.oninput = () => { audio.volume = volume.value; };

  let speeds = [1, 1.25, 1.5, 2];
  let idx = 0;
  speedBtn.onclick = () => {
    idx = (idx + 1) % speeds.length;
    audio.playbackRate = speeds[idx];
    speedBtn.textContent = speeds[idx] + "x";
  };

  function drawWave() {
    analyser.getByteTimeDomainData(dataArr);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    ctx.strokeStyle = "#9f9";
    let slice = canvas.width / dataArr.length;
    let x = 0;
    for (let i = 0; i < dataArr.length; i++) {
      let v = dataArr[i] / 128.0;
      let y = (v * canvas.height) / 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += slice;
    }
    ctx.stroke();
    requestAnimationFrame(drawWave);
  }
  drawWave();
}

initPlayback();
