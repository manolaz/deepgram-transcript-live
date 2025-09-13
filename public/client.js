const captions = window.document.getElementById("captions");
const fullTranscriptEl = document.getElementById("full-transcript");
const wordCountEl = document.getElementById("word-count");

let fullTranscriptText = "";
let startTime;
let timerInterval;
let currentTranscript = "";
let captionTimeout;

function addSentence() {
  if (currentTranscript.trim()) {
    fullTranscriptText += currentTranscript.trim() + "\n";
    currentTranscript = "";
    fullTranscriptEl.textContent = fullTranscriptText;
    updateWordCount();
    fullTranscriptEl.scrollTop = fullTranscriptEl.scrollHeight;
  }
}

function formatTime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function updateTimer() {
  if (startTime) {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    document.getElementById("timer").innerText = formatTime(elapsed);
  }
}

async function getMicrophone() {
  try {
    const userMedia = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });
    return new MediaRecorder(userMedia);
  } catch (error) {
    console.error("Error accessing microphone:", error);
    alert("Microphone access denied or unavailable. Please check your permissions and try again.");
    throw error;
  }
}

async function openMicrophone(microphone, socket) {
  await microphone.start(500);

  microphone.onstart = () => {
    console.log("client: microphone opened");
    document.body.classList.add("recording");
    startTime = Date.now();
    timerInterval = setInterval(updateTimer, 1000);
  };

  microphone.onstop = () => {
    console.log("client: microphone closed");
    document.body.classList.remove("recording");
    clearInterval(timerInterval);
  };

  microphone.ondataavailable = (e) => {
    const data = e.data;
    console.log("client: sent data to websocket");
    socket.send(data);
  };
}

async function closeMicrophone(microphone) {
  microphone.stop();
  clearInterval(timerInterval);
  // If there's remaining current transcript, add it as a sentence
  addSentence();
  // Clear caption timeout and captions
  if (captionTimeout) {
    clearTimeout(captionTimeout);
    captionTimeout = null;
  }
  captions.textContent = "";
  document.getElementById("timer").innerText = "00:00:00";
}

async function start(socket) {
  const listenButton = document.getElementById("record");
  let microphone;

  console.log("client: waiting to open microphone");

  listenButton.addEventListener("click", async () => {
    if (!microphone) {
      // open and close the microphone
      microphone = await getMicrophone();
      await openMicrophone(microphone, socket);
    } else {
      await closeMicrophone(microphone);
      microphone = undefined;
    }
  });
}

async function getTempToken() {
  const result = await fetch("/token");
  const json = await result.json();

  return json.access_token;
}

window.addEventListener("load", async () => {
  const token = await getTempToken();

  const modelSelect = document.getElementById("model-select");
  const selectedModel = modelSelect.value;

  const { createClient } = deepgram;
  const _deepgram = createClient({ accessToken: token });

  const socket = _deepgram.listen.live({ model: selectedModel, smart_format: true });

  socket.on("open", async () => {
    console.log("client: connected to websocket");
    document.getElementById("status").innerText = "Status: Connected";

    socket.on("Results", (data) => {
      const transcript = data.channel.alternatives[0].transcript;

      if (transcript) {
        currentTranscript += transcript;

        // Update live captions immediately
        captions.textContent = currentTranscript;

        // Clear existing timeout
        if (captionTimeout) clearTimeout(captionTimeout);

        // Set new timeout to clear captions after 10 seconds of no update
        captionTimeout = setTimeout(() => {
          captions.textContent = "";
        }, 10000);

        // Check if the current transcript ends with a sentence terminator
        if (/[.!?]$/.test(currentTranscript.trim())) {
          addSentence();
        }
      }
    });

    socket.on("error", (e) => {
      console.error("WebSocket error:", e);
      document.getElementById("status").innerText = "Status: Error - Check connection";
      alert("Connection error. Please refresh and try again.");
    });

    socket.on("warning", (e) => console.warn(e));

    socket.on("Metadata", (e) => console.log(e));

    socket.on("close", (e) => {
      console.log("WebSocket closed:", e);
      document.getElementById("status").innerText = "Status: Disconnected";
    });

    await start(socket);
  });

  document.getElementById("copy-btn").addEventListener("click", async () => {
    const text = fullTranscriptText + currentTranscript;
    try {
      await navigator.clipboard.writeText(text);
      alert("Transcript copied to clipboard!");
    } catch (err) {
      console.error("Failed to copy: ", err);
    }
  });

  document.getElementById("clear-btn").addEventListener("click", () => {
    fullTranscriptText = "";
    currentTranscript = "";
    fullTranscriptEl.innerText = "";
    wordCountEl.innerText = "Words: 0";
    captions.innerHTML = "";
  });

  document.getElementById("save-btn").addEventListener("click", () => {
    const text = fullTranscriptText + currentTranscript;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transcript.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
});
