let mediaRecorder;
let audioChunks = [];

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const recordingsList = document.getElementById("recordingsList");

startBtn.addEventListener("click", async () => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream);
  audioChunks = [];

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      audioChunks.push(e.data);
    }
  };

  mediaRecorder.onstop = () => {
    const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
    const audioURL = URL.createObjectURL(audioBlob);

    const li = document.createElement("li");
    const audio = document.createElement("audio");
    audio.controls = true;
    audio.src = audioURL;

    const download = document.createElement("a");
    download.href = audioURL;
    download.download = `recording-${Date.now()}.webm`;
    download.textContent = "💾 Save";

    li.appendChild(audio);
    li.appendChild(download);
    recordingsList.appendChild(li);
  };

  mediaRecorder.start();
  startBtn.disabled = true;
  stopBtn.disabled = false;
});

stopBtn.addEventListener("click", () => {
  mediaRecorder.stop();
  startBtn.disabled = false;
  stopBtn.disabled = true;
});
