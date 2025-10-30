// server.js
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import { MongoClient } from "mongodb";

dotenv.config();

const app = express();
const http = createServer(app);
const io = new Server(http);

app.use(express.static("public"));
app.use(express.json());

// connect to mongodb
const client = new MongoClient(process.env.MONGO_URI);
await client.connect();
const db = client.db("doublef");
const messages = db.collection("messages");
const users = db.collection("users");

// rooms state map
// rooms.get(room) => { sockets:Set, ready:Set, question, questionStart, answers: {}, revealTimeout, reviewTimeout, marryRound: null }
const rooms = new Map();

function getRandomQuestion() {
  const list = [
  "What’s something you’ve never told anyone?",
  "When were you last really proud of yourself?",
  "What’s a secret habit you have?",
  "What scares you more than it should?",
  "What’s the most childish thing you still do sometimes?",
  "What’s one small thing that instantly makes your day better?",
  "What’s a memory you smile at when you think of it?",
  "If you could erase one awkward moment, which would it be?",
  "What’s something you’ve done you’re kind of proud of but never mention?",
  "What’s a weird food combo you actually love?",
  "What’s one dream you’ve never told anyone about?",
  "If you could have a conversation with your future self, what would you ask?",
  "What does love mean to you?",
  "What’s the nicest thing someone has ever done for you?",
  "When do you feel most alive?",
  "What’s a regret you learned from?",
  "What’s your go-to comfort song and why?",
  "What quality do you value most in a friend?",
  "If you could change one thing about school, what would it be?",
  "What’s a belief you used to hold that you no longer do?",
  "What’s the bravest thing you’ve ever done?",
  "What fictional character do you relate to most and why?",
  "What’s an opinion you have that’s unpopular among your friends?",
  "When were you most surprised by your own strength?",
  "What’s a habit you want to build in the next year?",
  "What’s the last thing that made you cry (happy or sad)?",
  "What’s one small daily ritual that calms you?",
  "What’s a lie you once believed as a kid?",
  "If you had to describe your life as a movie genre, what would it be?",
  "What’s a compliment you wish you heard more often?",
  "What’s the kindest thing you’ve ever said to someone?",
  "What’s something you’d try if you knew you couldn’t fail?",
  "If you could relive one day from your past, which would it be?",
  "What’s one fear you want to overcome?",
  "What’s the best piece of advice you’ve ever received?",
  "What’s a small thing that makes you irrationally happy?",
  "What’s one truth you wish people understood about you?",
  "What’s the first thing you notice about someone you like?",
  "If you had to give your future child one piece of advice, what would it be?",
  "What hobby would you pick up if you had unlimited time?",
  "What’s a secret ambition you have?",
  "What’s the kindest thing a stranger has ever done for you?",
  "When do you feel most vulnerable?",
  "What’s a memory that changed how you see yourself?",
  "What’s one value you refuse to compromise on?",
  "If you could instantly learn a skill, what skill would it be?",
  "What small win are you proud of this week?",
  "What’s something you admire about your closest friend?",
  "What’s the weirdest coincidence that ever happened to you?",
  "If you could master one instrument instantly, which would you choose?",
  "What’s a boundary you wish people respected more?",
  "What does success look like to you in five years?",
  "What’s one book that changed the way you think?",
  "What’s the most spontaneous thing you’ve ever done?",
  "What’s a secret fear that surprises even you?",
  "If you had to describe your personality in three words, what would they be?",
  "What’s something you do to cheer yourself up when you’re down?",
  "What’s the best compliment you’ve ever received?",
  "Who in your life has taught you the most, and what did they teach?",
  "What’s one habit you’d like to stop?",
  "What’s a small gesture that instantly earns your respect?",
  "What’s a memory that still makes you laugh out loud?",
  "If you could invite anyone (alive) to dinner, who would it be and why?",
  "What’s one thing you wish adults understood about your generation?",
  "What’s a tradition you want to keep alive in your life?",
  "What’s the most meaningful gift you’ve ever given?",
  "What’s the last dream you remember having?",
  "If you could change one thing about yourself, what would it be and why?",
  "What’s your favorite way to spend a rainy afternoon?",
  "What’s something that instantly makes you trust someone?",
  "What’s the best risk you’ve ever taken?",
  "What’s a question you wish people asked you more often?",
  "If you could teleport for 24 hours, where would you go and what would you do?",
  "What’s one small luxury you’d never give up?",
  "What’s a time you surprised yourself by being brave?",
  "What’s the worst advice you ever followed—and what happened?",
  "If you could send a message to your younger self, what would it say?",
  "What’s a dream job you secretly want?",
  "What’s a smell that instantly takes you back somewhere?",
  "What’s the most peaceful place you’ve ever been?",
  "What’s your guilty pleasure show or movie?",
  "If you knew you only had one year left, what would you do first?",
  "What’s something you wish you did more often?",
  "What small thing could someone do to make your whole day?",
  "What fictional world would you live in if you could?",
  "Who was your childhood hero and why?",
  "What’s a habit that makes your life better but feels silly?",
  "What’s something you’re curious about but haven’t explored yet?",
  "What’s a piece of advice you often give others?",
  "What’s the nicest thing someone did for you unexpectedly?",
  "What’s a memory that feels like home to you?",
  "If you could remove one rule from society, what would it be?",
  "What’s the one question you’d like to be answered about the future?",
  "What’s something you hope to be remembered for?",
  "What’s a small act of courage you admire in others?",
  "What’s your favorite way to celebrate a personal win?",
  "What’s a silly fear you still have?",
  "What’s one thing you’d like to learn together with your partner/friend?",
  "What’s your favorite thing to do when you want to feel like a kid again?",
  "What’s one honest thing you’d like to ask me right now?"
];

  return list[Math.floor(Math.random() * list.length)];
}

function ensureRoom(roomName) {
  if (!rooms.has(roomName)) {
    rooms.set(roomName, {
      sockets: new Set(),
      ready: new Set(),
      question: null,
      questionStart: null,
      answers: {},
      revealTimeout: null,
      reviewTimeout: null,
      marryRound: null // NEW: hold marry game state
    });
  }
  return rooms.get(roomName);
}

// helper: count how many ready socket ids are actually present in the room
function countReadyInRoom(roomName) {
  const r = rooms.get(roomName);
  if (!r) return 0;
  let cnt = 0;
  for (const id of r.ready) {
    if (r.sockets.has(id)) cnt++;
  }
  return cnt;
}

async function revealAndScheduleNext(roomName) {
  const r = rooms.get(roomName);
  if (!r) return;

  if (r.revealTimeout) {
    clearTimeout(r.revealTimeout);
    r.revealTimeout = null;
  }

  // reveal current round answers to participants
  io.to(roomName).emit("revealAnswers", r.answers);

  // start 60s review period
  const reviewStart = Date.now();
  const reviewDuration = 60; // seconds
  io.to(roomName).emit("startReview", { startTime: reviewStart, duration: reviewDuration });

  // reset question state (keep answers until reveal)
  r.question = null;
  r.questionStart = null;

  if (r.reviewTimeout) clearTimeout(r.reviewTimeout);
  r.reviewTimeout = setTimeout(() => {
    r.reviewTimeout = null;
    // auto-start next round only if at least two ready sockets that are actually in the room
    const readyCount = countReadyInRoom(roomName);
    if (readyCount >= 2) {
      const q = getRandomQuestion();
      const startTime = Date.now() + 3000; // small prep
      const duration = 60;
      r.question = q;
      r.questionStart = startTime;
      r.answers = {};
      io.to(roomName).emit("startTruthRound", { question: q, startTime, duration });

      if (r.revealTimeout) clearTimeout(r.revealTimeout);
      r.revealTimeout = setTimeout(() => {
        revealAndScheduleNext(roomName);
      }, (duration + 3) * 1000);
    } else {
      // not enough players
      io.to(roomName).emit("waitingForPlayers");
      r.ready = new Set();
    }
  }, reviewDuration * 1000);
}

/** NEW: cancel an active marry round and notify room */
function cancelMarry(roomName, reason = "player_left") {
  const r = rooms.get(roomName);
  if (!r || !r.marryRound) return;
  io.to(roomName).emit("marryCancelled", { reason });
  r.marryRound = null;
}

io.on("connection", (socket) => {
  console.log("socket connected", socket.id);

  socket.on("join", (username) => {
    socket.username = username || `user_${socket.id.slice(0,4)}`;
  });

  socket.on("joinRoom", async (roomName = "room1") => {
    socket.join(roomName);
    socket.room = roomName;

    const r = ensureRoom(roomName);
    r.sockets.add(socket.id);

    // participants list (usernames)
    const participants = Array.from(r.sockets).map(id => {
      const s = io.sockets.sockets.get(id);
      return s?.username || null;
    }).filter(Boolean);
    io.to(roomName).emit("participants", participants);

    // send chat history for the room
    try {
      const recent = await messages.find({ room: roomName }).sort({ time: 1 }).limit(200).toArray();
      socket.emit("chatHistory", recent);
    } catch (err) {
      console.error("failed to load messages:", err);
    }

    // If a marry round was active but proposer/responder missing -> cancel
    if (r.marryRound) {
      const { proposerId, responderId } = r.marryRound;
      // if proposer/responder are not both in r.sockets, cancel
      if ((proposerId && !r.sockets.has(proposerId)) || (responderId && !r.sockets.has(responderId))) {
        cancelMarry(roomName, "participant_left");
      } else {
        // if active marry round exists and both present, re-emit state to this socket
        socket.emit("marryState", { active: true, marryRound: r.marryRound });
      }
    }

    // Very important: if this socket joins and there are already 2+ ready socket ids
    // that are actually in the room, and there's no active question, start round.
    const readyCount = countReadyInRoom(roomName);
    if (readyCount >= 2) {
      // only start if no active truth question
      if (!r.question) {
        const q = getRandomQuestion();
        const startTime = Date.now() + 3000;
        const duration = 60;
        r.question = q;
        r.questionStart = startTime;
        r.answers = {};

        io.to(roomName).emit("startTruthRound", { question: q, startTime, duration });

        if (r.revealTimeout) clearTimeout(r.revealTimeout);
        r.revealTimeout = setTimeout(() => {
          revealAndScheduleNext(roomName);
        }, (duration + 3) * 1000);
      }
    }
  });

  socket.on("chatMessage", async ({ room = "room1", msg }) => {
    const doc = { room, user: socket.username, msg, time: new Date() };
    try {
      await messages.insertOne(doc);
    } catch (err) {
      console.error("messages.insertOne error", err);
    }
    io.to(room).emit("chatMessage", doc);
  });

  // TRUTH game ready/submit handlers (unchanged)
  socket.on("readyForTruth", (roomName = "room1") => {
    const r = ensureRoom(roomName);
    // mark this socket as ready (we store socket.id)
    r.ready.add(socket.id);

    // broadcast ready count (how many ready socket ids are present in the room)
    const readyCount = countReadyInRoom(roomName);
    io.to(roomName).emit("readyCount", readyCount);

    // start only if 2+ ready sockets that are also in the room and no active question
    if (readyCount >= 2 && !r.question) {
      const q = getRandomQuestion();
      const startTime = Date.now() + 3000;
      const duration = 60;
      r.question = q;
      r.questionStart = startTime;
      r.answers = {};

      // when starting a truth round, we should cancel any active marry round
      if (r.marryRound) {
        cancelMarry(roomName, "truth_started");
      }

      io.to(roomName).emit("startTruthRound", { question: q, startTime, duration });

      // clear previous timers
      if (r.revealTimeout) { clearTimeout(r.revealTimeout); r.revealTimeout = null; }
      if (r.reviewTimeout) { clearTimeout(r.reviewTimeout); r.reviewTimeout = null; }

      // schedule reveal for this round
      r.revealTimeout = setTimeout(() => {
        revealAndScheduleNext(roomName);
      }, (duration + 3) * 1000);
    }
  });

  socket.on("submitAnswer", ({ room = "room1", answer }) => {
    const r = rooms.get(room);
    if (!r || !r.question) return;
    r.answers[socket.username] = answer;

    const distinctSubmitCount = Object.keys(r.answers).length;
    if (distinctSubmitCount >= 2) {
      // reveal and schedule next
      revealAndScheduleNext(room);
    }
  });

  /** NEW: marry game flow **/
  // proposer sends 3 names to start a marry round
  socket.on("startMarry", ({ room = "room1", names }) => {
    const r = ensureRoom(room);

    // if a truth round is active, refuse and notify
    if (r.question) {
      socket.emit("marryFailed", { reason: "truth_active" });
      return;
    }

    // if a marry round is already active, tell proposer it's busy
    if (r.marryRound) {
      socket.emit("marryFailed", { reason: "busy" });
      return;
    }

    // sanitize names (array of 3 strings)
    if (!Array.isArray(names) || names.length !== 3) {
      socket.emit("marryFailed", { reason: "invalid_names" });
      return;
    }

    r.marryRound = {
      proposerId: socket.id,
      proposerName: socket.username,
      names,
      responderId: null,
      responderName: null,
      result: null,
      startedAt: Date.now()
    };

    // notify proposer they are waiting
    socket.emit("marryWaiting", { names });

    // notify the other participants (exclude proposer)
    socket.to(room).emit("marryProposed", { proposerName: socket.username, names });
  });

  // responder submits mapping: mapping is object { name1: "kiss", name2: "marry", name3: "kill" } and explanation optional
 // submitMarryResponse (replace existing handler)
socket.on("submitMarryResponse", async ({ room = "room1", mapping, explanation }) => {
  const r = rooms.get(room);
  if (!r || !r.marryRound) {
    socket.emit("marryFailed", { reason: "no_active_round" });
    return;
  }

  // prevent proposer from answering their own proposal
  if (socket.id === r.marryRound.proposerId) {
    socket.emit("marryFailed", { reason: "proposer_cannot_answer" });
    return;
  }

  // simple validation
  const allowed = new Set(["kiss", "marry", "kill"]);
  const keys = Object.keys(mapping || {});
  if (keys.length !== 3) {
    socket.emit("marryFailed", { reason: "invalid_mapping" });
    return;
  }
  const used = new Set();
  for (const k of keys) {
    const v = mapping[k];
    if (!allowed.has(v)) {
      socket.emit("marryFailed", { reason: "invalid_action" });
      return;
    }
    used.add(v);
  }
  if (used.size !== 3) {
    socket.emit("marryFailed", { reason: "actions_must_be_unique" });
    return;
  }

  // accept response
  r.marryRound.responderId = socket.id;
  r.marryRound.responderName = socket.username;
  r.marryRound.result = { mapping, explanation: explanation || "", at: Date.now() };

  // Emit the structured event (keeps previous behavior / UI)
  io.to(room).emit("marryResult", {
    proposerName: r.marryRound.proposerName,
    responderName: r.marryRound.responderName,
    names: r.marryRound.names,
    mapping: r.marryRound.result.mapping,
    explanation: r.marryRound.result.explanation
  });

  // --- Persist a nicely formatted "Game" chat message into the DB ---
  try {
    // Build formatted text exactly as requested
    const killName  = Object.keys(mapping).find(k => mapping[k] === 'kill')  || "(none)";
    const marryName = Object.keys(mapping).find(k => mapping[k] === 'marry') || "(none)";
    const kissName  = Object.keys(mapping).find(k => mapping[k] === 'kiss')  || "(none)";

    const lines = [];
    lines.push("Marry Round");
    lines.push("");
    lines.push(`${r.marryRound.responderName} chose to:`);
    lines.push(`Kill - ${killName}`);
    lines.push(`Marry - ${marryName}`);
    lines.push(`Kiss - ${kissName}`);
    lines.push("");
    if (r.marryRound.result.explanation && r.marryRound.result.explanation.trim().length > 0) {
      lines.push(`For the reason: ${r.marryRound.result.explanation.trim()}`);
    } else {
      lines.push(`For no reason.`);
    }
    const formattedText = lines.join("\n");

    const doc = {
      room,
      user: "Game",
      msg: formattedText,
      time: new Date()
    };

    // insert in DB and broadcast to clients as a chat message (so chatHistory will include it)
    await messages.insertOne(doc);
    io.to(room).emit("chatMessage", doc);
  } catch (err) {
    console.error("Failed to save marry result message:", err);
  }

  // clear marryRound so new rounds can be started
  r.marryRound = null;
});


  // client signals leaving a particular game mode (truth or marry)
  socket.on("leaveGame", ({ room = "room1", game }) => {
    const r = rooms.get(room);
    if (!r) return;

    if (game === "marry") {
      // if there is an active marry round, cancel it
      if (r.marryRound) cancelMarry(room, "left_by_player");
    }
    if (game === "truth") {
      // clear ready and cancel any active truth round
      r.ready.delete(socket.id);
      // if truth is active, reset it and notify others
      if (r.question) {
        if (r.revealTimeout) { clearTimeout(r.revealTimeout); r.revealTimeout = null; }
        if (r.reviewTimeout) { clearTimeout(r.reviewTimeout); r.reviewTimeout = null; }
        r.question = null;
        r.answers = {};
        io.to(room).emit("waitingForPlayers");
      }
    }
  });

  socket.on("disconnect", () => {
    const roomName = socket.room;
    if (roomName && rooms.has(roomName)) {
      const r = rooms.get(roomName);
      r.sockets.delete(socket.id);
      r.ready.delete(socket.id);

      // if they were involved in an active marry round -> cancel it
      if (r.marryRound) {
        const mr = r.marryRound;
        if (mr.proposerId === socket.id || mr.responderId === socket.id) {
          cancelMarry(roomName, "participant_disconnected");
        } else {
          // if someone disconnected and made room size < 2 -> cancel marry as well
          if (r.sockets.size < 2) cancelMarry(roomName, "not_enough_players");
        }
      }

      const participants = Array.from(r.sockets).map(id => {
        const s = io.sockets.sockets.get(id);
        return s?.username || null;
      }).filter(Boolean);
      io.to(roomName).emit("participants", participants);

      // if room empty, cleanup timers and delete room
      if (r.sockets.size === 0) {
        if (r.revealTimeout) clearTimeout(r.revealTimeout);
        if (r.reviewTimeout) clearTimeout(r.reviewTimeout);
        if (r.marryRound) r.marryRound = null;
        rooms.delete(roomName);
      } else {
        // also if not enough players for truth, notify
        const readyCount = countReadyInRoom(roomName);
        if (readyCount < 2 && r.question) {
          // cancel truth round too
          if (r.revealTimeout) { clearTimeout(r.revealTimeout); r.revealTimeout = null; }
          if (r.reviewTimeout) { clearTimeout(r.reviewTimeout); r.reviewTimeout = null; }
          r.question = null;
          r.answers = {};
          io.to(roomName).emit("waitingForPlayers");
        }
      }
    }
  });
});

app.get("/health", (req, res) => res.json({ ok: true }));

app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ success: false, error: "Missing username or password" });
    }

    let user = await users.findOne({ username });
    if (!user) {
      // create user (simple approach — later replace with hashed passwords)
      await users.insertOne({ username, password });
      user = { username };
    }

    return res.json({ success: true, username: user.username });
  } catch (err) {
    console.error("POST /login error:", err);
    // always return JSON on error
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log("Server listening on", PORT));
