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
  "apple", "banana", "car", "dog", "elephant", "flower", "guitar", "house",
  "island", "jacket", "kite", "lamp", "mountain", "notebook", "ocean", "piano",
  "queen", "robot", "sun", "tree", "umbrella", "violin", "whale", "xylophone",
  "yacht", "zebra", "airplane", "bridge", "castle", "diamond", "eagle", "forest",
  "globe", "hammer", "igloo", "jungle", "kangaroo", "lighthouse", "mushroom",
  "necklace", "octopus", "penguin", "rainbow", "sandwich", "telephone", "unicorn",
  "volcano", "waterfall", "bicycle", "candle", "dragon", "feather", "giraffe",
  "helicopter", "icecream", "jellyfish", "koala", "lemon", "mermaid", "ninja",
  "orange", "parrot", "rocket", "starfish", "tornado", "vampire", "wizard"
];

function maskWord(word) {
  return word.split("").map((ch) => (ch === " " ? "  " : "_")).join(" ");
}

// ─── OOP Server Architecture ─────────────────────────────────────

class Player {
  constructor(socketId, name) {
    this.id = socketId;
    this.name = name;
    this.score = 0;
    this.isReady = false;
  }
}

class Game {
  constructor(room) {
    this.room = room; // reference to parent room
    this.status = "waiting"; // "waiting" | "choosing" | "drawing" | "round_over" | "game_over"
    this.playerOrder = [];
    this.currentDrawerIndex = -1;
    this.currentWord = null;
    this.maskedWord = "";
    this.wordChoices = [];
    this.round = 0;
    this.maxRounds = room.settings.rounds;
    this.roundTimeLeft = 0;
    this.timerId = null;
    this.hintTimerId = null;
    this.guessedPlayers = new Set();
  }

  clearTimers() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    if (this.hintTimerId) {
      clearInterval(this.hintTimerId);
      this.hintTimerId = null;
    }
  }

  startGame() {
    this.playerOrder = Array.from(this.room.players.keys());
    this.currentDrawerIndex = -1;
    this.round = 1;
    this.maxRounds = this.room.settings.rounds;
    
    // Reset players
    for (const player of this.room.players.values()) {
      player.score = 0;
      player.isReady = false; // Reset ready status for next time they are in lobby
    }
    
    this.guessedPlayers = new Set();
    this.startNextTurn();
  }

  startNextTurn() {
    this.currentDrawerIndex++;

    if (this.currentDrawerIndex >= this.playerOrder.length) {
      this.currentDrawerIndex = 0;
      this.round++;
      if (this.round > this.maxRounds) {
        this.endGame();
        return;
      }
    }

    this.currentWord = null;
    this.maskedWord = "";
    this.guessedPlayers = new Set();
    this.room.strokeHistory = [];
    
    this.wordChoices = this.pickRandomWords(this.room.settings.wordCount);
    this.status = "choosing";
    this.roundTimeLeft = CHOOSING_TIME;

    this.room.broadcastGameState();
    io.to(this.room.roomCode).emit("canvas_clear");

    this.clearTimers();
    this.timerId = setInterval(() => {
      this.roundTimeLeft--;
      io.to(this.room.roomCode).emit("timer_tick", { timeLeft: this.roundTimeLeft });

      if (this.roundTimeLeft <= 0) {
        this.clearTimers();
        if (this.status === "choosing") {
          this.selectWord(this.wordChoices[0]);
        }
      }
    }, 1000);
  }

  pickRandomWords(count) {
    const shuffled = [...WORD_BANK].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  selectWord(word) {
    this.currentWord = word;
    this.maskedWord = maskWord(word);
    this.wordChoices = [];
    this.status = "drawing";
    this.roundTimeLeft = this.room.settings.drawTime;

    this.room.broadcastGameState();
    this.clearTimers();
    
    // Schedule hints if enabled
    const numHints = this.room.settings.hints;
    if (numHints > 0) {
       this.scheduleHints(numHints);
    }

    this.timerId = setInterval(() => {
      this.roundTimeLeft--;
      io.to(this.room.roomCode).emit("timer_tick", { timeLeft: this.roundTimeLeft });

      if (this.roundTimeLeft <= 0) {
        this.clearTimers();
        this.endTurn();
      }
    }, 1000);
  }

  scheduleHints(numHints) {
    const wordLen = this.currentWord.replace(/ /g, "").length;
    const hintsToGive = Math.min(numHints, wordLen - 1); // leave at least 1 blank
    if (hintsToGive <= 0) return;

    // Distribute hints evenly over the draw time
    const interval = Math.floor(this.room.settings.drawTime / (hintsToGive + 1));
    let hintsGiven = 0;

    this.hintTimerId = setInterval(() => {
      if (hintsGiven >= hintsToGive) {
        clearInterval(this.hintTimerId);
        return;
      }
      this.revealHint();
      hintsGiven++;
    }, interval * 1000);
  }

  revealHint() {
    const unrevealedIndices = [];
    const maskedArr = this.maskedWord.split("");
    
    for (let i = 0; i < this.currentWord.length; i++) {
      if (this.currentWord[i] !== " " && maskedArr[i] === "_") {
        unrevealedIndices.push(i);
      }
    }
    
    if (unrevealedIndices.length === 0) return;

    // Pick random unrevealed index
    const idx = unrevealedIndices[Math.floor(Math.random() * unrevealedIndices.length)];
    maskedArr[idx] = this.currentWord[idx];
    this.maskedWord = maskedArr.join("");
    
    io.to(this.room.roomCode).emit("chat_message", {
      type: "system",
      text: "A hint was revealed!"
    });
    this.room.broadcastGameState();
  }

  endTurn() {
    this.clearTimers();
    this.status = "round_over";
    this.roundTimeLeft = 0;

    io.to(this.room.roomCode).emit("turn_over", { word: this.currentWord });
    io.to(this.room.roomCode).emit("chat_message", {
      type: "system",
      text: `The word was: ${this.currentWord}`
    });

    this.room.broadcastGameState();

    setTimeout(() => {
      this.startNextTurn();
    }, ROUND_OVER_PAUSE * 1000);
  }

  endGame() {
    this.clearTimers();
    this.status = "game_over";
    this.currentWord = null;
    this.maskedWord = "";
    this.wordChoices = [];
    this.roundTimeLeft = 0;

    io.to(this.room.roomCode).emit("game_over", {
      scores: this.room.getScores(),
      players: this.room.getPlayerList()
    });

    io.to(this.room.roomCode).emit("chat_message", {
      type: "system",
      text: "Game over! Final scores are shown."
    });

    this.room.broadcastGameState();

    setTimeout(() => {
      this.status = "waiting";
      this.currentDrawerIndex = -1;
      this.playerOrder = [];
      this.round = 0;
      for (const p of this.room.players.values()) p.isReady = false;
      this.room.broadcastGameState();
    }, GAME_OVER_PAUSE * 1000);
  }

  checkGuess(socketId, guess) {
    if (this.status !== "drawing") return false;
    const drawerId = this.playerOrder[this.currentDrawerIndex];
    if (socketId === drawerId) return false;
    if (this.guessedPlayers.has(socketId)) return true;

    const isCorrect = guess.toLowerCase() === (this.currentWord || "").toLowerCase();
    
    if (isCorrect) {
      this.guessedPlayers.add(socketId);
      const player = this.room.players.get(socketId);
      const drawer = this.room.players.get(drawerId);

      // Time-based scoring: faster = more points
      const drawTime = this.room.settings.drawTime || DEFAULT_ROUND_TIME;
      const timeBonus = Math.round((this.roundTimeLeft / drawTime) * 400);
      const guesserScore = 100 + timeBonus;

      if (player) player.score += guesserScore;
      if (drawer) drawer.score += DRAWER_BONUS;

      io.to(this.room.roomCode).emit("chat_message", {
        type: "correct_guess",
        playerName: player ? player.name : "Someone",
        text: `${player ? player.name : "Someone"} guessed the word! (+${guesserScore})`
      });

      this.room.broadcastGameState();

      const totalGuessers = this.playerOrder.length - 1;
      if (this.guessedPlayers.size >= totalGuessers) {
        this.endTurn();
      }
      return true;
    }
    return false;
  }
}

class Room {
  constructor(roomCode, isPublic, hostId, settings) {
    this.roomCode = roomCode;
    this.isPublic = isPublic;
    this.hostId = hostId;
    this.inviteToken = isPublic ? null : Math.random().toString(36).slice(2, 8).toUpperCase();
    
    this.settings = {
      maxPlayers: Number(settings.maxPlayers) || DEFAULT_MAX_PLAYERS,
      rounds: Math.min(Math.max(Number(settings.rounds) || DEFAULT_MAX_ROUNDS, 1), 10),
      drawTime: Math.min(Math.max(Number(settings.drawTime) || DEFAULT_ROUND_TIME, 15), 240),
      wordCount: Math.min(Math.max(Number(settings.wordCount) || 3, 1), 5),
      hints: settings.hints !== undefined ? Math.min(Math.max(Number(settings.hints), 0), 5) : 2
    };
    
    this.players = new Map();
    this.strokeHistory = [];
    this.game = new Game(this);
  }

  addPlayer(socketId, name) {
    this.players.set(socketId, new Player(socketId, name || "Player"));
  }

  removePlayer(socketId) {
    this.players.delete(socketId);
    
    // Host migration
    if (this.hostId === socketId && this.players.size > 0) {
      this.hostId = this.players.keys().next().value;
      const newHostName = this.players.get(this.hostId)?.name || "Player";
      io.to(this.roomCode).emit("chat_message", {
        type: "system",
        text: `${newHostName} is now the host.`
      });
    }
  }

  getPlayerList() {
    return Array.from(this.players.values());
  }

  getScores() {
    const scores = {};
    for (const [id, player] of this.players) {
      scores[id] = player.score;
    }
    return scores;
  }

  getSnapshot(socketId) {
    const g = this.game;
    const drawerId = g.playerOrder[g.currentDrawerIndex] ?? null;
    const isDrawer = socketId === drawerId;
    
    // Also attach isReady to players list for the snapshot
    const playersList = this.getPlayerList();

    return {
      status: g.status,
      round: g.round,
      maxRounds: g.maxRounds,
      currentDrawerId: drawerId,
      currentDrawerName: drawerId && this.players.has(drawerId) ? this.players.get(drawerId).name : null,
      maskedWord: g.maskedWord,
      currentWord: isDrawer ? g.currentWord : null,
      wordChoices: isDrawer && g.status === "choosing" ? g.wordChoices : [],
      roundTimeLeft: g.roundTimeLeft,
      isDrawer,
      scores: this.getScores(),
      guessedPlayers: [...g.guessedPlayers],
      isHost: socketId === this.hostId,
      isPublic: this.isPublic,
      inviteToken: this.inviteToken,
      hostName: this.hostId && this.players.has(this.hostId) ? this.players.get(this.hostId).name : null,
      settings: this.settings
    };
  }

  broadcastGameState() {
    const playersArr = this.getPlayerList();
    for (const p of playersArr) {
      io.to(p.id).emit("game_state_update", {
        roomCode: this.roomCode,
        players: playersArr,
        game: this.getSnapshot(p.id)
      });
    }
  }

  broadcastPlayerList() {
    io.to(this.roomCode).emit("player_list_updated", {
      roomCode: this.roomCode,
      players: this.getPlayerList()
    });
  }
}

class GameServer {
  constructor() {
    this.rooms = new Map();
    this.inviteTokens = new Map();
  }

  createRoomCode() {
    return Math.random().toString(36).slice(2, 7).toUpperCase();
  }

  getRoom(roomCode) {
    return this.rooms.get(roomCode);
  }

  createRoom(roomCode, isPublic, hostId, settings) {
    const room = new Room(roomCode, isPublic, hostId, settings);
    this.rooms.set(roomCode, room);
    if (room.inviteToken) {
      this.inviteTokens.set(room.inviteToken, roomCode);
    }
    return room;
  }

  deleteRoom(roomCode) {
    const room = this.rooms.get(roomCode);
    if (room) {
      room.game.clearTimers();
      if (room.inviteToken) {
        this.inviteTokens.delete(room.inviteToken);
      }
      this.rooms.delete(roomCode);
    }
  }
}

const gameServer = new GameServer();

// ─── REST & Socket.IO Handlers ───────────────────────────────────

app.get("/health", (_req, res) => res.json({ status: "ok" }));

io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);
  socket.data.roomCode = null;
  socket.data.playerName = null;

  socket.on("quick_play", ({ playerName }, callback) => {
    let targetRoom = null;
    for (const room of gameServer.rooms.values()) {
      if (room.isPublic && room.game.status === "waiting" && room.players.size < room.settings.maxPlayers) {
        targetRoom = room;
        break;
      }
    }

    if (!targetRoom) {
      targetRoom = gameServer.createRoom(gameServer.createRoomCode(), true, socket.id, {});
    }
    if (!targetRoom.hostId) targetRoom.hostId = socket.id;

    const trimmedName = (playerName || "Player").trim() || "Player";
    targetRoom.addPlayer(socket.id, trimmedName);
    
    socket.join(targetRoom.roomCode);
    socket.data.roomCode = targetRoom.roomCode;
    socket.data.playerName = trimmedName;

    callback?.({
      success: true,
      roomCode: targetRoom.roomCode,
      players: targetRoom.getPlayerList(),
      game: targetRoom.getSnapshot(socket.id)
    });
    
    targetRoom.broadcastPlayerList();
    targetRoom.broadcastGameState();
  });

  socket.on("create_private_room", ({ playerName, settings, roomCode: customCode }, callback) => {
    let code = customCode ? customCode.trim().toUpperCase() : gameServer.createRoomCode();
    
    if (customCode && gameServer.getRoom(code)) {
      return callback?.({ success: false, message: `Room "${code}" already exists.` });
    }

    const room = gameServer.createRoom(code, false, socket.id, settings || {});
    const trimmedName = (playerName || "Player").trim() || "Player";
    
    room.addPlayer(socket.id, trimmedName);
    socket.join(room.roomCode);
    socket.data.roomCode = room.roomCode;
    socket.data.playerName = trimmedName;

    callback?.({
      success: true,
      roomCode: room.roomCode,
      players: room.getPlayerList(),
      game: room.getSnapshot(socket.id)
    });

    room.broadcastPlayerList();
    room.broadcastGameState();
  });

  socket.on("join_private_room", ({ roomCode, playerName }, callback) => {
    const room = gameServer.getRoom(roomCode);
    if (!room) return callback?.({ success: false, message: "Room not found." });
    if (room.players.size >= room.settings.maxPlayers) return callback?.({ success: false, message: "Room is full." });

    const trimmedName = (playerName || "Player").trim() || "Player";
    room.addPlayer(socket.id, trimmedName);
    socket.join(room.roomCode);
    socket.data.roomCode = room.roomCode;
    socket.data.playerName = trimmedName;

    callback?.({
      success: true,
      roomCode,
      players: room.getPlayerList(),
      game: room.getSnapshot(socket.id)
    });

    room.broadcastPlayerList();
    room.broadcastGameState();
  });

  socket.on("join_via_invite_token", ({ inviteToken, playerName }, callback) => {
    const roomCode = gameServer.inviteTokens.get(inviteToken);
    if (!roomCode) return callback?.({ success: false, message: "Invalid invite link." });
    
    const room = gameServer.getRoom(roomCode);
    if (!room) return callback?.({ success: false, message: "Room not found." });
    if (room.players.size >= room.settings.maxPlayers) return callback?.({ success: false, message: "Room is full." });

    const trimmedName = (playerName || "Player").trim() || "Player";
    room.addPlayer(socket.id, trimmedName);
    socket.join(room.roomCode);
    socket.data.roomCode = room.roomCode;
    socket.data.playerName = trimmedName;

    callback?.({
      success: true,
      roomCode,
      players: room.getPlayerList(),
      game: room.getSnapshot(socket.id)
    });

    room.broadcastPlayerList();
    room.broadcastGameState();
  });

  socket.on("toggle_ready", () => {
    const { roomCode } = socket.data;
    const room = gameServer.getRoom(roomCode);
    if (!room || room.game.status !== "waiting") return;
    
    const player = room.players.get(socket.id);
    if (player) {
      player.isReady = !player.isReady;
      room.broadcastGameState();
    }
  });

  socket.on("start_game", (_, callback) => {
    const { roomCode } = socket.data;
    const room = gameServer.getRoom(roomCode);
    if (!room) return;
    
    if (!room.isPublic && socket.id !== room.hostId) {
      return callback?.({ success: false, message: "Only the host can start the game." });
    }
    if (room.players.size < 2) {
      return callback?.({ success: false, message: "Need at least 2 players." });
    }
    if (room.game.status !== "waiting") {
      return callback?.({ success: false, message: "Game already in progress." });
    }

    io.to(roomCode).emit("chat_message", {
      type: "system",
      text: "Game started! Get ready to draw and guess."
    });

    room.game.startGame();
    callback?.({ success: true });
  });

  socket.on("chat_guess", ({ message }) => {
    const { roomCode } = socket.data;
    const room = gameServer.getRoom(roomCode);
    if (!room) return;
    
    const guess = (message || "").trim();
    if (!guess) return;

    // Check if it's a correct guess
    if (room.game.checkGuess(socket.id, guess)) {
      return; 
    }

    // Normal chat
    const senderName = socket.data.playerName || "Player";
    io.to(roomCode).emit("chat_message", {
      type: "chat",
      playerName: senderName,
      text: guess
    });
  });

  socket.on("word_selected", ({ word }) => {
    const { roomCode } = socket.data;
    const room = gameServer.getRoom(roomCode);
    if (!room) return;
    
    if (room.game.status !== "choosing") return;
    if (socket.id !== room.game.playerOrder[room.game.currentDrawerIndex]) return;

    room.game.selectWord(word);
  });

  socket.on("request_game_state", () => {
    const { roomCode } = socket.data;
    const room = gameServer.getRoom(roomCode);
    if (!room) return;
    
    socket.emit("game_state_update", {
      roomCode,
      players: room.getPlayerList(),
      game: room.getSnapshot(socket.id)
    });
    
    socket.emit("player_list_updated", {
      roomCode,
      players: room.getPlayerList()
    });
  });

  // ── Drawing Events (forwarded to room) ──

  const forwardDrawingEvent = (event, data) => {
    const { roomCode } = socket.data;
    const room = gameServer.getRoom(roomCode);
    if (!room) return;
    
    if (room.game.status === "drawing") {
      if (socket.id !== room.game.playerOrder[room.game.currentDrawerIndex]) return;
    }
    socket.to(roomCode).emit(event, data);
  };

  socket.on("draw_start", (data) => forwardDrawingEvent("draw_start", data));
  socket.on("draw_move", (data) => forwardDrawingEvent("draw_move", data));
  socket.on("draw_end", (data) => forwardDrawingEvent("draw_end", data));
  
  socket.on("draw_data", (data) => {
    const room = gameServer.getRoom(socket.data.roomCode);
    if (room && room.game.status === "drawing" && socket.id === room.game.playerOrder[room.game.currentDrawerIndex]) {
       if (data.stroke) room.strokeHistory.push(data.stroke);
       socket.to(room.roomCode).emit("draw_data", data);
    }
  });
  
  socket.on("canvas_clear", () => {
    const room = gameServer.getRoom(socket.data.roomCode);
    if (room && room.game.status === "drawing" && socket.id === room.game.playerOrder[room.game.currentDrawerIndex]) {
       room.strokeHistory = [];
       socket.to(room.roomCode).emit("canvas_clear");
    }
  });
  
  socket.on("draw_undo", () => {
    const room = gameServer.getRoom(socket.data.roomCode);
    if (room && room.game.status === "drawing" && socket.id === room.game.playerOrder[room.game.currentDrawerIndex]) {
       room.strokeHistory.pop();
       socket.to(room.roomCode).emit("draw_undo");
    }
  });

  socket.on("disconnect", () => {
    const { roomCode } = socket.data;
    const room = gameServer.getRoom(roomCode);
    
    if (room) {
      const orderIdx = room.game.playerOrder.indexOf(socket.id);
      room.removePlayer(socket.id);

      if (orderIdx !== -1) {
        room.game.playerOrder.splice(orderIdx, 1);
        
        if (orderIdx === room.game.currentDrawerIndex) {
          room.game.currentDrawerIndex--;
          if (room.game.status === "choosing" || room.game.status === "drawing") {
            room.game.clearTimers();
            if (room.game.playerOrder.length < 2) {
              room.game.endGame();
            } else {
              room.game.startNextTurn();
            }
          }
        } else if (orderIdx < room.game.currentDrawerIndex) {
          room.game.currentDrawerIndex--;
        }
      }

      if (room.players.size === 0) {
        gameServer.deleteRoom(roomCode);
      } else {
        room.broadcastPlayerList();
        room.broadcastGameState();
      }
    }
    
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
