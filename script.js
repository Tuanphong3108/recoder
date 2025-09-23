let mediaRecorder, audioChunks = [];
let timerInterval, startTime, isPaused = false, elapsed = 0;

const splash = document.getElementById('splash');
const recordBtn = document.getElementById('recordBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resumeBtn = document.getElementById('resumeBtn');
const stopBtn = document.getElementById('stopBtn');
const timer = document.getElementById('timer');
const menuBtn = document.getElementById('menuBtn');
const menu = document.getElementById('menu');
const infoBtn = document.getElementById('infoBtn');
const exportBtn = document.getElementById('exportBtn');
const infoDialog = document.getElementById('infoDialog');
const closeInfo = document.getElementById('closeInfo');

function updateTimer() {
  const now = Date.now();
  const diff = (now - startTime + elapsed) / 1000;
  const mins = Math.floor(diff / 60);
  const secs = Math.floor(diff % 60);
  const ms = Math.floor((diff * 10) % 10);
  timer.textContent = `${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}.${ms}`;
}

navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
  mediaRecorder = new MediaRecorder(stream);

  mediaRecorder.ondataavailable = e => audioChunks.push(e.data);

  mediaRecorder.onstop = () => {
    const blob = new Blob(audioChunks, { type: 'audio/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recording_${Date.now()}.webm`;
    a.click();
  };

  // Hide splash after permission granted
  setTimeout(() => splash.style.display = 'none', 1000);

  recordBtn.onclick = () => {
    audioChunks = [];
    mediaRecorder.start();
    startTime = Date.now();
    timerInterval = setInterval(updateTimer, 100);
    recordBtn.classList.add('hidden');
    pauseBtn.classList.remove('hidden');
    stopBtn.classList.remove('hidden');
  };

  pauseBtn.onclick = () => {
    if (mediaRecorder.state === "recording") {
      mediaRecorder.pause();
      clearInterval(timerInterval);
      elapsed += Date.now() - startTime;
      pauseBtn.classList.add('hidden');
      resumeBtn.classList.remove('hidden');
    }
  };

  resumeBtn.onclick = () => {
    if (mediaRecorder.state === "paused") {
      mediaRecorder.resume();
      startTime = Date.now();
      timerInterval = setInterval(updateTimer, 100);
      resumeBtn.classList.add('hidden');
      pauseBtn.classList.remove('hidden');
    }
  };

  stopBtn.onclick = () => {
    mediaRecorder.stop();
    clearInterval(timerInterval);
    timer.textContent = "00:00.0";
    pauseBtn.classList.add('hidden');
    resumeBtn.classList.add('hidden');
    stopBtn.classList.add('hidden');
    recordBtn.classList.remove('hidden');
    elapsed = 0;
  };
});

// Menu
menuBtn.onclick = () => menu.classList.toggle('hidden');
infoBtn.onclick = () => {
  menu.classList.add('hidden');
  infoDialog.classList.remove('hidden');
};
exportBtn.onclick = () => {
  menu.classList.add('hidden');
  alert("Xuất file ghi âm sau khi dừng");
};
closeInfo.onclick = () => infoDialog.classList.add('hidden');
