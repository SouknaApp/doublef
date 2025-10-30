// public/truth.js
const socket = io();
const username = localStorage.getItem("username") || prompt("Enter name") || `user_${Math.random().toString(36).slice(2,6)}`;
localStorage.setItem("username", username);

const room = "room1";
socket.emit("join", username);
socket.emit("joinRoom", room);

// elements
const questionEl = document.getElementById("question");
const answerBox = document.getElementById("answer");
const submitBtn = document.getElementById("submitBtn");
const answersDiv = document.getElementById("answers");
const timerEl = document.getElementById("timer");
const participantsEl = document.getElementById("participants");
const waitingEl = document.getElementById("waiting");

let roundActive = false;
let localTimer = null;
let prepInterval = null;
let reviewInterval = null;

// IMPORTANT: don't auto-ready immediately. Wait for participants list so we know we're in the room
socket.on("participants", (list) => {
  participantsEl.textContent = `Players: ${list.join(", ")}`;

  // if there are at least 2 participants, tell the server we're ready
  // (this avoids the race where client emits ready before having actually joined server room)
  if (list.length >= 2) {
    socket.emit("readyForTruth", room);
  }
});

// show ready count if server sends it
socket.on("readyCount", (n) => {
  waitingEl.textContent = `Waiting for players... (${n}/2 ready)`;
});

// start truth round (server sends question + startTime + duration)
socket.on("startTruthRound", ({ question, startTime, duration }) => {
  // reset UI
  answersDiv.innerHTML = "";
  answerBox.value = "";
  answerBox.disabled = true;
  submitBtn.disabled = true;
  roundActive = false;
  questionEl.textContent = "Get ready...";
  timerEl.textContent = "";
  waitingEl.textContent = "";

  if (prepInterval) clearInterval(prepInterval);

  // prep countdown until startTime
  function prepTick() {
    const msLeft = startTime - Date.now();
    if (msLeft <= 0) {
      clearInterval(prepInterval);
      beginAnswerPhase(duration);
      return;
    }
    timerEl.textContent = `Starting in ${Math.ceil(msLeft / 1000)}s`;
  }

  prepInterval = setInterval(prepTick, 200);
  prepTick();

  function beginAnswerPhase(durSeconds) {
    roundActive = true;
    questionEl.textContent = question;
    answerBox.disabled = false;
    submitBtn.disabled = false;

    let left = durSeconds;
    timerEl.textContent = `Time left: ${left}s`;

    if (localTimer) clearInterval(localTimer);
    localTimer = setInterval(() => {
      left--;
      timerEl.textContent = `Time left: ${left}s`;
      if (left <= 0) {
        clearInterval(localTimer);
        answerBox.disabled = true;
        submitBtn.disabled = true;
        timerEl.textContent = `Time's up! Waiting for answers...`;
      }
    }, 1000);
  }
});

// reveal answers event
socket.on("revealAnswers", (data) => {
  // stop timers
  if (localTimer) { clearInterval(localTimer); localTimer = null; }
  if (prepInterval) { clearInterval(prepInterval); prepInterval = null; }

  roundActive = false;
  answerBox.disabled = true;
  submitBtn.disabled = true;

  // render answers
  answersDiv.innerHTML = "";
  for (const [user, ans] of Object.entries(data || {})) {
    const p = document.createElement("p");
    p.innerHTML = `<strong>${escapeHtml(user)}:</strong> ${escapeHtml(ans || "(no answer)")}`;
    answersDiv.appendChild(p);
  }

  timerEl.textContent = "Answers revealed. Read them!";
});

// server starts review period (60s), show countdown
socket.on("startReview", ({ startTime, duration }) => {
  if (reviewInterval) clearInterval(reviewInterval);
  function reviewTick() {
    const msLeft = (startTime + duration * 1000) - Date.now();
    if (msLeft <= 0) {
      clearInterval(reviewInterval);
      timerEl.textContent = "Starting next round shortly...";
      return;
    }
    timerEl.textContent = `Next round in ${Math.ceil(msLeft / 1000)}s`;
  }
  reviewInterval = setInterval(reviewTick, 200);
  reviewTick();
});

// server informed that not enough players to auto-start
socket.on("waitingForPlayers", () => {
  timerEl.textContent = "Waiting for players to rejoin. Refresh when ready.";
  // optionally re-enable manual ready
  // socket.emit("readyForTruth", room);
});

// submit answer UI
submitBtn.onclick = () => {
  if (!roundActive) return;
  const a = answerBox.value.trim();
  socket.emit("submitAnswer", { room, answer: a });
  // lock to prevent re-submission; server will reveal when both submit or after timeout
  answerBox.disabled = true;
  submitBtn.disabled = true;
};

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (m) => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[m]));
}
