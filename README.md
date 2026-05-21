# Skribbl.io Clone

An end-to-end, real-time multiplayer drawing and guessing game built with React, Node.js, Express, and Socket.IO. 

## 🚀 Features

- **Public & Private Rooms:** Jump into a public "Quick Play" matchmaking queue or create private, invite-only rooms with your friends via shareable links.
- **Turn-based Drawing:** Players take turns drawing a chosen word while others frantically guess in the live chat.
- **Real-time Synchronization:** Canvas drawing strokes, chat messages, timer countdowns, and game states are synced seamlessly across all connected clients via WebSockets.
- **Hint System:** Stuck? The server gradually reveals letters of the word as the timer ticks down (e.g., `a _ _ l _`).
- **Comprehensive Settings:** Hosts can customize Max Players, Rounds, Draw Time, Word Count (choices), and the number of Hints per round.
- **Robust Drawing Tools:** Choose from a preset palette, pick a custom HEX color, adjust brush thickness, undo strokes, clear the canvas, or use a true Eraser tool.
- **Dynamic Scoring:** Faster correct guesses yield more points for the guesser, while the drawer earns points for every player who successfully guesses their drawing.

---

## 🏗 Architecture Overview

This application uses a classic full-stack WebSocket architecture to maintain a single source of truth on the server while keeping clients responsive.

### 1. The Server (Node.js + Socket.IO)
The backend is built around an **Object-Oriented Architecture**:
- **`GameServer`:** Acts as the central hub, managing all active `Room` instances and resolving matchmaking (Quick Play) and invite links.
- **`Room`:** Represents a lobby. It manages a map of `Player` instances, tracks the host, maintains the `strokeHistory` for late-joiners, and holds an instance of `Game`.
- **`Game`:** The heart of the game loop. It handles round logic, the current drawer, turn rotation, the countdown timer, hint scheduling, and dynamic point scoring.
- **`Player`:** Maintains session data for a connected socket (name, score, and lobby ready-status).

By keeping all game logic (timers, word selection, hints) on the server, we prevent client-side cheating and ensure all clients stay perfectly in sync.

### 2. The Client (React + Canvas API)
The frontend relies heavily on a decoupled state system:
- **WebSocket Event Handlers:** The `Game.tsx` component registers Socket.IO listeners that update local React state. 
- **HTML5 Canvas:** All drawing interactions (pointer down, pointer move, pointer up) are captured locally and instantly drawn to the canvas while simultaneously being broadcasted to the server (`draw_start`, `draw_move`, `draw_data`).
- **State Hydration:** When a player joins a room, they request the full game snapshot (including `strokeHistory`). The client instantly redraws the entire canvas stroke-by-stroke so late-joiners see exactly what everyone else sees.

---

## 🛠 Tech Stack

- **Frontend:** React 19, TypeScript, Vite, CSS (Vanilla)
- **Backend:** Node.js, Express
- **Realtime:** Socket.IO
- **Canvas:** Native HTML5 Canvas API

---

## 💻 Local Setup & Development

### 1. Install Dependencies
You need Node.js installed. Open two terminal windows.
In the first terminal, install server dependencies:
```bash
cd server
npm install
```
In the second terminal, install client dependencies:
```bash
cd client
npm install
```

### 2. Run the Application
Start the backend server (runs on `http://localhost:3001`):
```bash
cd server
npm run dev
```

Start the frontend Vite dev server (runs on `http://localhost:5173`):
```bash
cd client
npm run dev
```

Open your browser to `http://localhost:5173`. You can open multiple incognito windows to test multiplayer functionality locally.

---

## 🌍 Deployment

You can deploy this application easily using services like **Render**, **Railway**, or **Heroku**.

### Backend Deployment (Render / Railway)
1. Set the root directory to `server`.
2. Build Command: `npm install`
3. Start Command: `node server.js`
4. The server will bind to the `$PORT` environment variable provided by the platform.

### Frontend Deployment (Vercel / Netlify)
1. Set the root directory to `client`.
2. Build Command: `npm run build`
3. Output Directory: `dist`
4. **Important:** Update `client/src/socket.ts` to point to your deployed backend URL instead of `localhost:3001` before deploying.
