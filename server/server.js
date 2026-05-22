import express from "express";
import http from "node:http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// ─── Constants ──────────────────────────────────────────────────

const PORT = Number(process.env.PORT) || 3001;
const DEFAULT_MAX_PLAYERS = 8;
const DEFAULT_ROUND_TIME = 60; // seconds per drawing turn
const CHOOSING_TIME = 15; // seconds to pick a word
const ROUND_OVER_PAUSE = 5; // seconds between turns
const DEFAULT_MAX_ROUNDS = 3;
const GAME_OVER_PAUSE = 10; // seconds showing final scoreboard
const DRAWER_BONUS = 50; // points drawer gets per correct guesser

// ─── Word Bank ──────────────────────────────────────────────────

const WORD_BANK = [
  // Existing Words
  "apple", "banana", "car", "dog", "elephant", "flower", "guitar", "house", "island", "jacket",
  "kite", "lamp", "mountain", "notebook", "ocean", "piano", "queen", "robot", "sun", "tree",
  "umbrella", "violin", "whale", "xylophone", "yacht", "zebra", "airplane", "bridge", "castle",
  "diamond", "eagle", "forest", "globe", "hammer", "igloo", "jungle", "kangaroo", "lighthouse",
  "mushroom", "necklace", "octopus", "penguin", "rainbow", "sandwich", "telephone", "unicorn",
  "volcano", "waterfall", "bicycle", "candle", "dragon", "feather", "giraffe", "helicopter",
  "icecream", "jellyfish", "koala", "lemon", "mermaid", "ninja", "orange", "parrot", "rocket",
  "starfish", "tornado", "vampire", "wizard",

  // Animals
  "alligator", "alpaca", "ant", "bat", "bear", "beaver", "bee", "bird", "butterfly", "camel", 
  "cat", "cheetah", "chicken", "chimpanzee", "cow", "crab", "crocodile", "deer", "dolphin", 
  "duck", "flamingo", "fox", "frog", "goat", "gorilla", "hamster", "hedgehog", "hippopotamus", 
  "horse", "iguana", "jaguar", "ladybug", "leopard", "lion", "llama", "lobster", "monkey", 
  "moose", "mouse", "ostrich", "owl", "panda", "peacock", "pig", "pigeon", "rabbit", "raccoon", 
  "rat", "rhino", "seal", "shark", "sheep", "sloth", "snail", "snake", "spider", "squid", 
  "squirrel", "swan", "tiger", "toad", "turkey", "turtle", "walrus", "wolf", "worm",

  // Food & Drinks
  "avocado", "bacon", "bagel", "bread", "broccoli", "burger", "burrito", "cake", "candy", 
  "carrot", "cheese", "cherry", "chocolate", "coffee", "cookie", "corn", "croissant", "cupcake", 
  "donut", "egg", "french fries", "grapes", "hamburger", "hotdog", "kiwi", "lollipop", "mango", 
  "melon", "milk", "muffin", "onion", "pancake", "peach", "peanut", "pear", "pepper", "pie", 
  "pineapple", "pizza", "popcorn", "potato", "pretzel", "pumpkin", "salad", "salt", "sausage", 
  "soup", "spaghetti", "steak", "strawberry", "sushi", "taco", "tea", "toast", "tomato", "waffle", 
  "watermelon",

  // Household & Objects
  "alarm clock", "backpack", "basket", "bathtub", "bed", "blanket", "book", "bottle", "bowl", 
  "broom", "brush", "bucket", "camera", "chair", "clock", "comb", "computer", "couch", "cup", 
  "door", "drawer", "fan", "flashlight", "fork", "fridge", "glasses", "hair dryer", "headphones", 
  "key", "keyboard", "knife", "ladder", "laptop", "lock", "magnet", "map", "microphone", "mirror", 
  "mouse", "mug", "paint", "paper", "pen", "pencil", "phone", "pillow", "plate", "radio", "remote", 
  "ruler", "scissors", "shampoo", "shoe", "soap", "sock", "sofa", "sponge", "spoon", "table", 
  "television", "thermometer", "toothbrush", "toothpaste", "towel", "trash can", "tv", "vacuum", 
  "wallet", "watch", "window",

  // Nature & Environment
  "beach", "branch", "bush", "cave", "cloud", "comet", "desert", "dirt", "earth", "fire", 
  "galaxy", "grass", "hill", "ice", "lake", "leaf", "lightning", "meteor", "moon", "planet", 
  "plant", "puddle", "river", "rock", "root", "sand", "sky", "smoke", "snow", "snowman", "space", 
  "star", "stone", "storm", "sunflower", "sunset", "thunder", "wave", "wind", "wood",

  // Body Parts
  "arm", "back", "beard", "bone", "brain", "chest", "chin", "ear", "elbow", "eye", "face", 
  "finger", "foot", "hair", "hand", "head", "heart", "knee", "leg", "lip", "mouth", "muscle", 
  "nail", "neck", "nose", "shoulder", "skeleton", "skin", "skull", "stomach", "teeth", "thumb", 
  "toe", "tongue", "tooth",

  // Professions & People
  "alien", "astronaut", "baby", "baker", "boy", "builder", "chef", "clown", "cowboy", "dancer", 
  "dentist", "doctor", "farmer", "firefighter", "ghost", "girl", "king", "knight", "magician", 
  "man", "nurse", "pilot", "pirate", "police", "princess", "scientist", "singer", "soldier", 
  "superhero", "teacher", "thief", "waiter", "witch", "woman", "zombie",

  // Vehicles & Transport
  "ambulance", "boat", "bus", "canoe", "helicopter", "jet", "motorcycle", "rocket", "sailboat", 
  "scooter", "ship", "skateboard", "submarine", "subway", "tractor", "train", "truck", "van",

  // Clothes
  "belt", "boots", "cap", "coat", "dress", "gloves", "hat", "hoodie", "jeans", "mittens", 
  "pants", "scarf", "shirt", "shoes", "shorts", "skirt", "sneakers", "socks", "suit", "sweater", 
  "tie", "underwear",

  // Actions & Verbs
  "dance", "draw", "drink", "eat", "fly", "jump", "kick", "laugh", "listen", "paint", "play", 
  "read", "run", "sing", "sleep", "smile", "swim", "talk", "throw", "walk", "write",

  // Misc / Fun
  "angel", "battery", "bell", "bomb", "bow", "box", "bubble", "button", "cards", "coin", 
  "crown", "dice", "drum", "flag", "gem", "gift", "glasses", "guitar", "idea", "magic", 
  "medal", "money", "music", "password", "photo", "piano", "picture", "present", "ring", 
  "sword", "target", "ticket", "treasure", "trophy", "video game"
];

function maskWord(word) {
  return word
    .split("")
    .map((ch) => (ch === " " ? "\u2003" : "_")) // Use em-space for multiple words
    .join(" ");
}

// ─── State ─────────────────────────────────────────────────────

const globalState = {
  rooms: new Map(),
  inviteTokens: new Map(),
};

// ─── Factory Functions ─────────────────────────────────────────

function createPlayer(socketId, name) {
  return {
    id: socketId,
    name: name,
    score: 0,
    isReady: false,
  };
}

function createRoom(roomCode, isPublic, hostId, settings) {
  return {
    roomCode,
    isPublic,
    hostId,
    inviteToken: isPublic
      ? null
      : Math.random().toString(36).slice(2, 8).toUpperCase(),
    settings: {
      maxPlayers: Number(settings.maxPlayers) || DEFAULT_MAX_PLAYERS,
      rounds: Math.min(
        Math.max(Number(settings.rounds) || DEFAULT_MAX_ROUNDS, 1),
        10,
      ),
      drawTime: Math.min(
        Math.max(Number(settings.drawTime) || DEFAULT_ROUND_TIME, 15),
        240,
      ),
      wordCount: Math.min(Math.max(Number(settings.wordCount) || 3, 1), 5),
      hints:
        settings.hints !== undefined
          ? Math.min(Math.max(Number(settings.hints), 0), 5)
          : 2,
    },
    players: new Map(),
    strokeHistory: [],
    game: {
      status: "waiting", // "waiting" | "choosing" | "drawing" | "round_over" | "game_over"
      playerOrder: [],
      currentDrawerIndex: -1,
      currentWord: null,
      maskedWord: "",
      wordChoices: [],
      round: 0,
      maxRounds: Math.min(
        Math.max(Number(settings.rounds) || DEFAULT_MAX_ROUNDS, 1),
        10,
      ),
      roundTimeLeft: 0,
      timerId: null,
      hintTimerId: null,
      guessedPlayers: new Set(),
    },
  };
}

// ─── Room / Global Functions ───────────────────────────────────

function createRoomCode() {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

function addRoom(roomCode, isPublic, hostId, settings) {
  const room = createRoom(roomCode, isPublic, hostId, settings);
  globalState.rooms.set(roomCode, room);
  if (room.inviteToken) {
    globalState.inviteTokens.set(room.inviteToken, roomCode);
  }
  return room;
}

function deleteRoom(roomCode) {
  const room = globalState.rooms.get(roomCode);
  if (room) {
    clearTimers(room.game);
    if (room.inviteToken) {
      globalState.inviteTokens.delete(room.inviteToken);
    }
    globalState.rooms.delete(roomCode);
  }
}

function addPlayerToRoom(room, socketId, name) {
  room.players.set(socketId, createPlayer(socketId, name || "Player"));
}

function removePlayerFromRoom(room, socketId) {
  room.players.delete(socketId);

  if (room.hostId === socketId && room.players.size > 0) {
    room.hostId = room.players.keys().next().value;
    const newHostName = room.players.get(room.hostId)?.name || "Player";
    io.to(room.roomCode).emit("chat_message", {
      type: "system",
      text: `${newHostName} is now the host.`,
    });
  }
}

function getPlayerList(room) {
  return Array.from(room.players.values());
}

function getScores(room) {
  const scores = {};
  for (const [id, player] of room.players) {
    scores[id] = player.score;
  }
  return scores;
}

function getSnapshot(room, socketId) {
  const g = room.game;
  const drawerId = g.playerOrder[g.currentDrawerIndex] ?? null;
  const isDrawer = socketId === drawerId;

  return {
    status: g.status,
    round: g.round,
    maxRounds: g.maxRounds,
    currentDrawerId: drawerId,
    currentDrawerName:
      drawerId && room.players.has(drawerId)
        ? room.players.get(drawerId).name
        : null,
    maskedWord: g.maskedWord,
    currentWord: isDrawer ? g.currentWord : null,
    wordChoices: isDrawer && g.status === "choosing" ? g.wordChoices : [],
    roundTimeLeft: g.roundTimeLeft,
    isDrawer,
    scores: getScores(room),
    guessedPlayers: [...g.guessedPlayers],
    isHost: socketId === room.hostId,
    isPublic: room.isPublic,
    inviteToken: room.inviteToken,
    hostName:
      room.hostId && room.players.has(room.hostId)
        ? room.players.get(room.hostId).name
        : null,
    settings: room.settings,
  };
}

function broadcastGameState(room) {
  const playersArr = getPlayerList(room);
  for (const p of playersArr) {
    io.to(p.id).emit("game_state_update", {
      roomCode: room.roomCode,
      players: playersArr,
      game: getSnapshot(room, p.id),
    });
  }
}

function broadcastPlayerList(room) {
  io.to(room.roomCode).emit("player_list_updated", {
    roomCode: room.roomCode,
    players: getPlayerList(room),
  });
}

// ─── Game Logic Functions ──────────────────────────────────────

function clearTimers(game) {
  if (game.timerId) {
    clearInterval(game.timerId);
    game.timerId = null;
  }
  if (game.hintTimerId) {
    clearInterval(game.hintTimerId);
    game.hintTimerId = null;
  }
}

function startGame(room) {
  const g = room.game;
  g.playerOrder = Array.from(room.players.keys());
  g.currentDrawerIndex = -1;
  g.round = 1;
  g.maxRounds = room.settings.rounds;

  for (const player of room.players.values()) {
    player.score = 0;
    player.isReady = false;
  }

  g.guessedPlayers = new Set();
  startNextTurn(room);
}

function startNextTurn(room) {
  const g = room.game;
  g.currentDrawerIndex++;

  if (g.currentDrawerIndex >= g.playerOrder.length) {
    g.currentDrawerIndex = 0;
    g.round++;
    if (g.round > g.maxRounds) {
      endGame(room);
      return;
    }
  }

  g.currentWord = null;
  g.maskedWord = "";
  g.guessedPlayers = new Set();
  room.strokeHistory = [];

  const shuffled = [...WORD_BANK].sort(() => Math.random() - 0.5);
  g.wordChoices = shuffled.slice(0, room.settings.wordCount);
  g.status = "choosing";
  g.roundTimeLeft = CHOOSING_TIME;

  broadcastGameState(room);
  io.to(room.roomCode).emit("canvas_clear");

  clearTimers(g);
  g.timerId = setInterval(() => {
    g.roundTimeLeft--;
    io.to(room.roomCode).emit("timer_tick", { timeLeft: g.roundTimeLeft });

    if (g.roundTimeLeft <= 0) {
      clearTimers(g);
      if (g.status === "choosing") {
        selectWord(room, g.wordChoices[0]);
      }
    }
  }, 1000);
}

function selectWord(room, word) {
  const g = room.game;
  g.currentWord = word;
  g.maskedWord = maskWord(word);
  g.wordChoices = [];
  g.status = "drawing";
  g.roundTimeLeft = room.settings.drawTime;

  broadcastGameState(room);
  clearTimers(g);

  const numHints = room.settings.hints;
  if (numHints > 0) {
    scheduleHints(room, numHints);
  }

  g.timerId = setInterval(() => {
    g.roundTimeLeft--;
    io.to(room.roomCode).emit("timer_tick", { timeLeft: g.roundTimeLeft });

    if (g.roundTimeLeft <= 0) {
      clearTimers(g);
      endTurn(room);
    }
  }, 1000);
}

function scheduleHints(room, numHints) {
  const g = room.game;
  const wordLen = g.currentWord.replace(/ /g, "").length;
  const hintsToGive = Math.min(numHints, wordLen - 1);
  if (hintsToGive <= 0) return;

  const interval = Math.floor(room.settings.drawTime / (hintsToGive + 1));
  let hintsGiven = 0;

  g.hintTimerId = setInterval(() => {
    if (hintsGiven >= hintsToGive) {
      clearInterval(g.hintTimerId);
      return;
    }
    revealHint(room);
    hintsGiven++;
  }, interval * 1000);
}

function revealHint(room) {
  const g = room.game;
  const unrevealedIndices = [];
  const maskedArr = g.maskedWord.split(" "); // Split by space to get 1-to-1 mapping

  for (let i = 0; i < g.currentWord.length; i++) {
    if (g.currentWord[i] !== " " && maskedArr[i] === "_") {
      unrevealedIndices.push(i);
    }
  }

  if (unrevealedIndices.length === 0) return;

  const idx =
    unrevealedIndices[Math.floor(Math.random() * unrevealedIndices.length)];
  maskedArr[idx] = g.currentWord[idx];
  g.maskedWord = maskedArr.join(" ");

  io.to(room.roomCode).emit("chat_message", {
    type: "system",
    text: "A hint was revealed!",
  });
  broadcastGameState(room);
}

function endTurn(room) {
  const g = room.game;
  clearTimers(g);
  g.status = "round_over";
  g.roundTimeLeft = 0;

  let endText = `The word was: ${g.currentWord}`;
  if (g.guessedPlayers.size > 0) {
    const firstGuesserId = Array.from(g.guessedPlayers)[0];
    const firstGuesser = room.players.get(firstGuesserId);
    if (firstGuesser) {
      endText = `${firstGuesser.name} has guessed the word ${g.currentWord} right`;
    }
  }

  io.to(room.roomCode).emit("turn_over", { word: endText });
  io.to(room.roomCode).emit("chat_message", {
    type: "system",
    text: endText,
  });

  broadcastGameState(room);

  setTimeout(() => {
    startNextTurn(room);
  }, ROUND_OVER_PAUSE * 1000);
}

function endGame(room) {
  const g = room.game;
  clearTimers(g);
  g.status = "game_over";
  g.currentWord = null;
  g.maskedWord = "";
  g.wordChoices = [];
  g.roundTimeLeft = 0;

  io.to(room.roomCode).emit("game_over", {
    scores: getScores(room),
    players: getPlayerList(room),
  });

  io.to(room.roomCode).emit("chat_message", {
    type: "system",
    text: "Game over! Final scores are shown.",
  });

  broadcastGameState(room);

  setTimeout(() => {
    g.status = "waiting";
    g.currentDrawerIndex = -1;
    g.playerOrder = [];
    g.round = 0;
    for (const p of room.players.values()) p.isReady = false;
    broadcastGameState(room);
  }, GAME_OVER_PAUSE * 1000);
}

function checkGuess(room, socketId, guess) {
  const g = room.game;
  if (g.status !== "drawing") return false;
  const drawerId = g.playerOrder[g.currentDrawerIndex];
  if (socketId === drawerId) return false;
  if (g.guessedPlayers.has(socketId)) return true;

  const isCorrect = guess.toLowerCase() === (g.currentWord || "").toLowerCase();

  if (isCorrect) {
    g.guessedPlayers.add(socketId);
    const player = room.players.get(socketId);
    const drawer = room.players.get(drawerId);

    const drawTime = room.settings.drawTime || DEFAULT_ROUND_TIME;
    const timeBonus = Math.round((g.roundTimeLeft / drawTime) * 400);
    const guesserScore = 100 + timeBonus;

    if (player) player.score += guesserScore;
    if (drawer) drawer.score += DRAWER_BONUS;

    io.to(room.roomCode).emit("chat_message", {
      type: "correct_guess",
      playerName: player ? player.name : "Someone",
      text: `${player ? player.name : "Someone"} guessed the word! (+${guesserScore})`,
    });

    broadcastGameState(room);

    const totalGuessers = g.playerOrder.length - 1;
    if (g.guessedPlayers.size >= totalGuessers) {
      endTurn(room);
    }
    return true;
  }
  return false;
}

// ─── REST & Socket.IO Handlers ───────────────────────────────────

app.get("/", (_req, res) => res.json({ status: "ok" }));
app.get("/health", (_req, res) => res.json({ status: "ok" }));

io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);
  socket.data.roomCode = null;
  socket.data.playerName = null;

  socket.on("quick_play", ({ playerName }, callback) => {
    let targetRoom = null;
    for (const room of globalState.rooms.values()) {
      if (
        room.isPublic &&
        room.game.status === "waiting" &&
        room.players.size < room.settings.maxPlayers
      ) {
        targetRoom = room;
        break;
      }
    }

    if (!targetRoom) {
      targetRoom = addRoom(createRoomCode(), true, socket.id, {});
    }
    if (!targetRoom.hostId) targetRoom.hostId = socket.id;

    const trimmedName = (playerName || "Player").trim() || "Player";
    addPlayerToRoom(targetRoom, socket.id, trimmedName);

    socket.join(targetRoom.roomCode);
    socket.data.roomCode = targetRoom.roomCode;
    socket.data.playerName = trimmedName;

    callback?.({
      success: true,
      roomCode: targetRoom.roomCode,
      players: getPlayerList(targetRoom),
      game: getSnapshot(targetRoom, socket.id),
    });

    broadcastPlayerList(targetRoom);
    broadcastGameState(targetRoom);
  });

  socket.on(
    "create_private_room",
    ({ playerName, settings, roomCode: customCode }, callback) => {
      let code = customCode
        ? customCode.trim().toUpperCase()
        : createRoomCode();

      if (customCode && globalState.rooms.get(code)) {
        return callback?.({
          success: false,
          message: `Room "${code}" already exists.`,
        });
      }

      const room = addRoom(code, false, socket.id, settings || {});
      const trimmedName = (playerName || "Player").trim() || "Player";

      addPlayerToRoom(room, socket.id, trimmedName);
      socket.join(room.roomCode);
      socket.data.roomCode = room.roomCode;
      socket.data.playerName = trimmedName;

      callback?.({
        success: true,
        roomCode: room.roomCode,
        players: getPlayerList(room),
        game: getSnapshot(room, socket.id),
      });

      broadcastPlayerList(room);
      broadcastGameState(room);
    },
  );

  socket.on("join_private_room", ({ roomCode, playerName }, callback) => {
    const room = globalState.rooms.get(roomCode);
    if (!room)
      return callback?.({ success: false, message: "Room not found." });
    if (room.players.size >= room.settings.maxPlayers)
      return callback?.({ success: false, message: "Room is full." });

    const trimmedName = (playerName || "Player").trim() || "Player";
    addPlayerToRoom(room, socket.id, trimmedName);
    socket.join(room.roomCode);
    socket.data.roomCode = room.roomCode;
    socket.data.playerName = trimmedName;

    callback?.({
      success: true,
      roomCode,
      players: getPlayerList(room),
      game: getSnapshot(room, socket.id),
    });

    broadcastPlayerList(room);
    broadcastGameState(room);
  });

  socket.on(
    "join_via_invite_token",
    ({ inviteToken, playerName }, callback) => {
      const roomCode = globalState.inviteTokens.get(inviteToken);
      if (!roomCode)
        return callback?.({ success: false, message: "Invalid invite link." });

      const room = globalState.rooms.get(roomCode);
      if (!room)
        return callback?.({ success: false, message: "Room not found." });
      if (room.players.size >= room.settings.maxPlayers)
        return callback?.({ success: false, message: "Room is full." });

      const trimmedName = (playerName || "Player").trim() || "Player";
      addPlayerToRoom(room, socket.id, trimmedName);
      socket.join(room.roomCode);
      socket.data.roomCode = room.roomCode;
      socket.data.playerName = trimmedName;

      callback?.({
        success: true,
        roomCode,
        players: getPlayerList(room),
        game: getSnapshot(room, socket.id),
      });

      broadcastPlayerList(room);
      broadcastGameState(room);
    },
  );

  socket.on("toggle_ready", () => {
    const { roomCode } = socket.data;
    const room = globalState.rooms.get(roomCode);
    if (!room || room.game.status !== "waiting") return;

    const player = room.players.get(socket.id);
    if (player) {
      player.isReady = !player.isReady;
      broadcastGameState(room);
    }
  });

  socket.on("start_game", (_, callback) => {
    const { roomCode } = socket.data;
    const room = globalState.rooms.get(roomCode);
    if (!room) return;

    if (!room.isPublic && socket.id !== room.hostId) {
      return callback?.({
        success: false,
        message: "Only the host can start the game.",
      });
    }
    if (room.players.size < 2) {
      return callback?.({
        success: false,
        message: "Need at least 2 players.",
      });
    }
    if (room.game.status !== "waiting") {
      return callback?.({
        success: false,
        message: "Game already in progress.",
      });
    }

    io.to(roomCode).emit("chat_message", {
      type: "system",
      text: "Game started! Get ready to draw and guess.",
    });

    startGame(room);
    callback?.({ success: true });
  });

  socket.on("chat_guess", ({ message }) => {
    const { roomCode } = socket.data;
    const room = globalState.rooms.get(roomCode);
    if (!room) return;

    const guess = (message || "").trim();
    if (!guess) return;

    if (checkGuess(room, socket.id, guess)) {
      return;
    }

    const senderName = socket.data.playerName || "Player";
    io.to(roomCode).emit("chat_message", {
      type: "chat",
      playerName: senderName,
      text: guess,
    });
  });

  socket.on("word_selected", ({ word }) => {
    const { roomCode } = socket.data;
    const room = globalState.rooms.get(roomCode);
    if (!room) return;

    if (room.game.status !== "choosing") return;
    if (socket.id !== room.game.playerOrder[room.game.currentDrawerIndex])
      return;

    selectWord(room, word);
  });

  socket.on("request_game_state", () => {
    const { roomCode } = socket.data;
    const room = globalState.rooms.get(roomCode);
    if (!room) return;

    socket.emit("game_state_update", {
      roomCode,
      players: getPlayerList(room),
      game: getSnapshot(room, socket.id),
    });

    socket.emit("player_list_updated", {
      roomCode,
      players: getPlayerList(room),
    });
  });

  // ── Drawing Events (forwarded to room) ──

  const forwardDrawingEvent = (event, data) => {
    const { roomCode } = socket.data;
    const room = globalState.rooms.get(roomCode);
    if (!room) return;

    if (room.game.status === "drawing") {
      if (socket.id !== room.game.playerOrder[room.game.currentDrawerIndex])
        return;
    }
    socket.to(roomCode).emit(event, data);
  };

  socket.on("draw_start", (data) => forwardDrawingEvent("draw_start", data));
  socket.on("draw_move", (data) => forwardDrawingEvent("draw_move", data));
  socket.on("draw_end", (data) => forwardDrawingEvent("draw_end", data));

  socket.on("draw_data", (data) => {
    const room = globalState.rooms.get(socket.data.roomCode);
    if (
      room &&
      room.game.status === "drawing" &&
      socket.id === room.game.playerOrder[room.game.currentDrawerIndex]
    ) {
      if (data.stroke) room.strokeHistory.push(data.stroke);
      socket.to(room.roomCode).emit("draw_data", data);
    }
  });

  socket.on("canvas_clear", () => {
    const room = globalState.rooms.get(socket.data.roomCode);
    if (
      room &&
      room.game.status === "drawing" &&
      socket.id === room.game.playerOrder[room.game.currentDrawerIndex]
    ) {
      room.strokeHistory = [];
      socket.to(room.roomCode).emit("canvas_clear");
    }
  });

  socket.on("draw_undo", () => {
    const room = globalState.rooms.get(socket.data.roomCode);
    if (
      room &&
      room.game.status === "drawing" &&
      socket.id === room.game.playerOrder[room.game.currentDrawerIndex]
    ) {
      room.strokeHistory.pop();
      socket.to(room.roomCode).emit("draw_undo");
    }
  });

  const handleLeaveRoom = () => {
    const { roomCode } = socket.data;
    const room = globalState.rooms.get(roomCode);

    if (room) {
      const g = room.game;
      const orderIdx = g.playerOrder.indexOf(socket.id);
      removePlayerFromRoom(room, socket.id);

      if (orderIdx !== -1) {
        g.playerOrder.splice(orderIdx, 1);

        if (orderIdx === g.currentDrawerIndex) {
          g.currentDrawerIndex--;
          if (g.status === "choosing" || g.status === "drawing") {
            clearTimers(g);
            // We will handle the < 2 check below
            if (g.playerOrder.length >= 2) {
              startNextTurn(room);
            }
          }
        } else if (orderIdx < g.currentDrawerIndex) {
          g.currentDrawerIndex--;
        }
      }

      if (room.players.size === 0) {
        deleteRoom(roomCode);
      } else {
        broadcastPlayerList(room);
        
        if (room.players.size < 2 && g.status !== "waiting" && g.status !== "game_over") {
          io.to(roomCode).emit("chat_message", {
            type: "system",
            text: "Not enough players to continue. Game over!",
          });
          endGame(room);
        } else {
          broadcastGameState(room);
        }
      }
    }

    if (roomCode) {
      socket.leave(roomCode);
    }
    socket.data.roomCode = null;
    socket.data.playerName = null;
  };

  socket.on("leave_room", handleLeaveRoom);

  socket.on("disconnect", () => {
    handleLeaveRoom();
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
