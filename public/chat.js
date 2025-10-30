// public/chat.js
const socket = io();
const username = localStorage.getItem("username") || prompt("Enter name") || `user_${Math.random().toString(36).slice(2,6)}`;
localStorage.setItem("username", username);

const room = "room1";
socket.emit("join", username);
socket.emit("joinRoom", room);

// Chat elements
const messagesDiv = document.getElementById("messages");
const msgInput = document.getElementById("msg");
const sendBtn = document.getElementById("send");

// Marry UI elements
const marryBtn = document.getElementById("marryBtn");
const truthBtn = document.getElementById("truthBtn");

const marryProposer = document.getElementById("marryProposer");
const name1 = document.getElementById("name1");
const name2 = document.getElementById("name2");
const name3 = document.getElementById("name3");
const startMarryBtn = document.getElementById("startMarryBtn");
const cancelMarryBtn = document.getElementById("cancelMarryBtn");
const marryStatus = document.getElementById("marryStatus");

const marryResponder = document.getElementById("marryResponder");
const marryFrom = document.getElementById("marryFrom");
const responderNames = document.getElementById("responderNames");
const responderExplanation = document.getElementById("responderExplanation");
const submitMarryResponseBtn = document.getElementById("submitMarryResponseBtn");
const declineMarryBtn = document.getElementById("declineMarryBtn");
const marryResponderStatus = document.getElementById("marryResponderStatus");

let currentMarry = null; // holds names and proposer info when a round is active for this client
let responderAssignment = {}; // mapping name->action for responder UI

// helper to render a chat message (your messages on right)
// updated appendMessage - replace existing function
// Replace your appendMessage with this version (safe + preserves line breaks)
function appendMessage({ user, msg, time }) {
  const el = document.createElement("div");

  // choose class: system/game messages are centered, your messages right, others left
  let className;
  if (user === "Game") {
    className = "message game";
  } else if (user === username) {
    className = "message mine";
  } else {
    className = "message theirs";
  }
  el.className = className;

  const t = time ? new Date(time).toLocaleTimeString() : new Date().toLocaleTimeString();

  // escape then replace \n with <br> for safe multiline rendering
  const safe = escapeHtml(msg).replace(/\n/g, "<br>");

  // for Game messages, we show just the bubble (no strong username)
  if (user === "Game") {
    el.innerHTML = `<div class="bubble"><div class="text">${safe}</div></div>`;
  } else {
    el.innerHTML = `<div class="bubble"><div class="meta"><strong>${escapeHtml(user)}</strong> <span class="time">${t}</span></div><div class="text">${safe}</div></div>`;
  }

  messagesDiv.appendChild(el);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}



function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (m) => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[m]));
}

// load history
socket.on("chatHistory", (arr) => {
  messagesDiv.innerHTML = "";
  arr.forEach(doc => appendMessage(doc));
});

socket.on("chatMessage", (doc) => {
  appendMessage(doc);
});

sendBtn.onclick = send;
msgInput.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });

function send() {
  const msg = msgInput.value.trim();
  if (!msg) return;
  socket.emit("chatMessage", { room, msg });
  msgInput.value = "";
}

/* ------------------ MARRY UI / FLOW ------------------ */

// show/hide functions
function showProposer(show) {
  marryProposer.style.display = show ? "block" : "none";
  if (!show) {
    // notify server we left marry mode (if a round was active)
    socket.emit("leaveGame", { room, game: "marry" });
    marryStatus.textContent = "";
  }
}
function showResponder(show) {
  marryResponder.style.display = show ? "block" : "none";
  if (!show) {
    socket.emit("leaveGame", { room, game: "marry" });
    marryResponderStatus.textContent = "";
  }
}

// click marry to toggle proposer UI
marryBtn.addEventListener("click", () => {
  // toggle proposer UI
  const showing = marryProposer.style.display === "block";
  if (showing) {
    showProposer(false);
  } else {
    // open proposer and clear any responder UI
    showResponder(false);
    showProposer(true);
  }
});

// truth button still goes to truth page (or you can keep it)
truthBtn.addEventListener("click", () => {
  // for convenience, go to truth page
  location.href = "truth.html";
});

// start marry round (proposer)
startMarryBtn.addEventListener("click", () => {
  const a = name1.value.trim();
  const b = name2.value.trim();
  const c = name3.value.trim();
  if (!a || !b || !c) {
    marryStatus.textContent = "Enter three names.";
    return;
  }
  // send start request
  const names = [a, b, c];
  socket.emit("startMarry", { room, names });
  marryStatus.textContent = "Waiting for response...";
});

// cancel proposer UI
cancelMarryBtn.addEventListener("click", () => {
  showProposer(false);
});

// When server tells us proposer should wait
socket.on("marryWaiting", ({ names }) => {
  showProposer(true);
  marryStatus.textContent = "Waiting for the other player to respond...";
});

// When server notifies other players of a proposal
socket.on("marryProposed", ({ proposerName, names }) => {
  // show responder UI
  currentMarry = { proposerName, names };
  marryFrom.textContent = proposerName;
  responderExplanation.value = "";
  renderResponderNames(names);
  showResponder(true);
  marryResponderStatus.textContent = "Choose Kiss/Marry/Kill — each action exactly once.";
});

// If a client reconnected and there's an active marry round, server may emit marryState
socket.on("marryState", ({ active, marryRound }) => {
  if (!active || !marryRound) return;
  if (marryRound.proposerId === socket.id) {
    // you're the proposer — show waiting
    showProposer(true);
    marryStatus.textContent = "Waiting for someone to answer your list...";
  } else {
    currentMarry = { proposerName: marryRound.proposerName, names: marryRound.names };
    renderResponderNames(marryRound.names);
    showResponder(true);
    marryResponderStatus.textContent = "A proposal is active — respond.";
  }
});

// if server says marry round busy or error
socket.on("marryFailed", ({ reason }) => {
  marryStatus.textContent = reason === "busy" ? "Someone already proposed. Try again later." :
    reason === "truth_active" ? "Truth round active. Wait or stop it first." : "Failed: " + (reason || "unknown");
});

// render responder interface (three items with action buttons)
function renderResponderNames(names) {
  responderNames.innerHTML = "";
  responderAssignment = {}; // reset
  // available actions start as all
  const actions = ["kiss", "marry", "kill"];
  // for each name, create a card with three action buttons (toggle)
  names.forEach((n, idx) => {
    const card = document.createElement("div");
    card.style.display = "flex";
    card.style.flexDirection = "column";
    card.style.gap = "6px";
    card.style.padding = "8px";
    card.style.borderRadius = "10px";
    card.style.background = "linear-gradient(180deg,#ffffff,#fbfbfd)";
    card.style.border = "1px solid rgba(10,10,10,0.03)";

    const title = document.createElement("div");
    title.innerHTML = `<strong>${escapeHtml(n)}</strong>`;
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.gap = "6px";

    actions.forEach(action => {
      const btn = document.createElement("button");
      btn.className = "btn-ghost";
      btn.textContent = action[0].toUpperCase() + action.slice(1);
      btn.dataset.name = n;
      btn.dataset.action = action;
      // clicking picks this action for this name and removes it from others
      btn.addEventListener("click", () => {
        assignAction(n, action);
      });
      row.appendChild(btn);
    });

    card.appendChild(title);
    card.appendChild(row);
    responderNames.appendChild(card);
  });
  updateActionButtons();
}

// assign an action to a name and enforce uniqueness
function assignAction(name, action) {
  // if action already assigned to same name -> unassign
  for (const k in responderAssignment) {
    if (responderAssignment[k] === action && k === name) {
      delete responderAssignment[name];
      updateActionButtons();
      return;
    }
  }
  // remove action from any other name
  for (const k in responderAssignment) {
    if (responderAssignment[k] === action) delete responderAssignment[k];
  }
  // set
  responderAssignment[name] = action;
  updateActionButtons();
}

function updateActionButtons() {
  // disable action buttons that are already used by another name
  const buttons = responderNames.querySelectorAll("button");
  buttons.forEach(btn => {
    const action = btn.dataset.action;
    const name = btn.dataset.name;
    const usedBy = Object.keys(responderAssignment).find(k => responderAssignment[k] === action);
    if (usedBy && usedBy !== name) {
      btn.disabled = true;
      btn.style.opacity = "0.5";
    } else {
      btn.disabled = false;
      btn.style.opacity = "1";
    }
    // highlight chosen action
    if (responderAssignment[name] === action) {
      btn.style.background = "#ff7eb3";
      btn.style.color = "#fff";
      btn.style.border = "none";
    } else {
      btn.style.background = "";
      btn.style.color = "";
      btn.style.border = "";
    }
  });
}

// decline marry (responder) -> send leaveGame and hide UI
declineMarryBtn.addEventListener("click", () => {
  socket.emit("leaveGame", { room, game: "marry" });
  showResponder(false);
});

// submit marry response
submitMarryResponseBtn.addEventListener("click", () => {
  // validation: must assign exactly 3 actions to the 3 names
  if (!currentMarry || !currentMarry.names) {
    marryResponderStatus.textContent = "No active proposal.";
    return;
  }
  const names = currentMarry.names;
  // ensure all names assigned
  if (Object.keys(responderAssignment).length !== 3) {
    marryResponderStatus.textContent = "Assign Kiss/Marry/Kill to each name.";
    return;
  }
  // ensure uniqueness (already enforced), prepare mapping object
  const mapping = {};
  for (const n of names) {
    mapping[n] = responderAssignment[n];
  }
  const explanation = responderExplanation.value.trim();
  // send to server
  socket.emit("submitMarryResponse", { room, mapping, explanation });
  marryResponderStatus.textContent = "Answer submitted!";
  // hide UI after submission
  setTimeout(() => { showResponder(false); }, 900);
});

// when server emits result, show it in chat as messages
// replace the old marryResult handler with this
// Replace your existing socket.on("marryResult", ...) with this:
socket.on("marryResult", ({ proposerName, responderName, names, mapping, explanation }) => {
  // clear local marry UI state and hide panels
  currentMarry = null;
  responderAssignment = {};
  showProposer(false);
  showResponder(false);

  // optional short confirmation (server will also send the saved, detailed message)
  appendMessage({
    user: "Game",
    msg: `${responderName} answered ${proposerName}'s list. Result saved.`,
    time: new Date().toISOString()
  });
});



// if server cancels marry round
socket.on("marryCancelled", ({ reason }) => {
  appendMessage({ user: "Game", msg: `Marry round cancelled (${reason}).`, time: new Date().toISOString() });
  currentMarry = null;
  responderAssignment = {};
  showProposer(false);
  showResponder(false);
});

// if marry proposal arrives while you're proposer, show message
socket.on("marryProposed", ({ proposerName, names }) => {
  appendMessage({ user: "Game", msg: `${proposerName} proposed: ${names.join(", ")}`, time: new Date().toISOString() });
});

// if marry busy or failed
socket.on("marryFailed", ({ reason }) => {
  appendMessage({ user: "Game", msg: `Marry failed: ${reason}`, time: new Date().toISOString() });
});

/* ---------- If user closes page or navigates away, inform server they left marry/truth ---------- */
window.addEventListener("beforeunload", () => {
  try {
    socket.emit("leaveGame", { room, game: "marry" });
    socket.emit("leaveGame", { room, game: "truth" });
  } catch (e) {}
});

/* --------------- preserve old truth interactions --------------- */
// The truth interactions are handled on truth.html. However, we may want a quick ready toggle from chat:
document.getElementById("truthBtn").addEventListener("click", () => {
  // open truth.html as before
  location.href = "truth.html";
});

/* ------------------- utility ------------------- */
socket.on("participants", (list) => {
  // optional: display participants in chat as system message
  // appendMessage({ user: "System", msg: `Players: ${list.join(", ")}`, time: new Date().toISOString() });
});
